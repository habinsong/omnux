using System.Diagnostics;
using System.Globalization;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Xml.Linq;

namespace Omnux.Middleware;

// 크론(예약 작업) 도구 표면. 원래 CommandService.Config.cs 한 파일에 세션·크론·웹 검색이
// 함께 있어 4,200줄이었다. 저장소 규칙(파일당 500줄)에 맞추기 위해 책임 단위로 나눈다.
// partial class 이므로 동작은 그대로다.
public sealed partial class CommandService
{
    public CronToolStatusResult GetCronStatus()
    {
        return _routineRegistry.ReadAll(routines =>
        {
            var routineItems = routines.ToArray();
            long? nextWakeAtMs = null;
            foreach (var routine in routineItems)
            {
                if (!routine.Enabled)
                {
                    continue;
                }

                var candidate = routine.NextRunUtc.ToUnixTimeMilliseconds();
                if (!nextWakeAtMs.HasValue || candidate < nextWakeAtMs.Value)
                {
                    nextWakeAtMs = candidate;
                }
            }

            var schedulerEnabled = RoutineAppService.GetRoutineSchedulerStatus().Enabled;
            return new CronToolStatusResult(
                Enabled: schedulerEnabled,
                StorePath: _routineRegistry.StorePath,
                Jobs: routineItems.Length,
                NextWakeAtMs: nextWakeAtMs
            );
        });
    }

    public CronToolListResult ListCronJobs(
        bool includeDisabled = false,
        int? limit = null,
        int? offset = null
    )
    {
        return _routineRegistry.ReadAll(routines =>
        {
        var mapped = routines
            .Where(x => includeDisabled || x.Enabled)
            .Select(ToCronToolJob)
            .OrderBy(x => x.State.NextRunAtMs.HasValue ? 0 : 1)
            .ThenBy(x => x.State.NextRunAtMs ?? long.MaxValue)
            .ThenBy(x => x.Id, StringComparer.Ordinal)
            .ToArray();
        var total = mapped.Length;
        var resolvedOffset = Math.Clamp(offset ?? 0, 0, total);
        var defaultLimit = total == 0 ? 50 : total;
        var resolvedLimit = Math.Clamp(limit ?? defaultLimit, 1, 200);
        var page = mapped
            .Skip(resolvedOffset)
            .Take(resolvedLimit)
            .ToArray();
        var nextOffset = resolvedOffset + page.Length;
        return new CronToolListResult(
            Jobs: page,
            Total: total,
            Offset: resolvedOffset,
            Limit: resolvedLimit,
            HasMore: nextOffset < total,
            NextOffset: nextOffset < total ? nextOffset : null
        );
        });
    }

    public CronToolRunsResult ListCronRuns(
        string? jobId,
        int? limit = null,
        int? offset = null
    )
    {
        var normalizedId = (jobId ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalizedId))
        {
            return new CronToolRunsResult(false, Array.Empty<CronToolRunLogEntry>(), 0, 0, 0, false, null, "jobId is required");
        }

        if (!IsCronRunLogJobIdSafe(normalizedId))
        {
            return new CronToolRunsResult(false, Array.Empty<CronToolRunLogEntry>(), 0, 0, 0, false, null, "invalid jobId");
        }

        return _routineRegistry.Read(normalizedId, routine =>
        {
            if (routine == null)
            {
                return new CronToolRunsResult(false, Array.Empty<CronToolRunLogEntry>(), 0, 0, 0, false, null, $"job not found: {normalizedId}");
            }

            var entries = BuildCronRunEntries(routine)
            .OrderByDescending(x => x.Ts)
            .ThenByDescending(x => x.RunAtMs ?? 0L)
            .ToArray();
            var total = entries.Length;
            var resolvedOffset = Math.Clamp(offset ?? 0, 0, total);
            var resolvedLimit = Math.Clamp(limit ?? 50, 1, 200);
            var page = entries
            .Skip(resolvedOffset)
            .Take(resolvedLimit)
            .ToArray();
            var nextOffset = resolvedOffset + page.Length;

            return new CronToolRunsResult(
                Ok: true,
                Entries: page,
                Total: total,
                Offset: resolvedOffset,
                Limit: resolvedLimit,
                HasMore: nextOffset < total,
                NextOffset: nextOffset < total ? nextOffset : null,
                Error: null
            );
        });
    }

    public CronToolAddResult AddCronJob(string? rawJobJson)
    {
        var normalizedJson = (rawJobJson ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalizedJson))
        {
            return new CronToolAddResult(false, null, "job is required");
        }

        JsonDocument doc;
        try
        {
            doc = JsonDocument.Parse(normalizedJson);
        }
        catch (JsonException ex)
        {
            return new CronToolAddResult(false, null, $"invalid job json: {ex.Message}");
        }

        using (doc)
        {
            var job = doc.RootElement;
            if (job.ValueKind != JsonValueKind.Object)
            {
                return new CronToolAddResult(false, null, "job must be a JSON object");
            }

            if (job.TryGetProperty("sessionTarget", out var sessionTargetElement)
                && sessionTargetElement.ValueKind != JsonValueKind.String)
            {
                return new CronToolAddResult(false, null, "sessionTarget must be string when provided");
            }

            var sessionTargetRaw = ReadJsonString(job, "sessionTarget");
            if (!TryParseCronSessionTarget(sessionTargetRaw, allowEmpty: true, out var sessionTarget))
            {
                return new CronToolAddResult(false, null, "sessionTarget must be one of: main, isolated");
            }

            var wakeMode = ReadJsonString(job, "wakeMode");
            if (string.IsNullOrWhiteSpace(wakeMode))
            {
                wakeMode = "next-heartbeat";
            }

            if (!string.Equals(wakeMode, "next-heartbeat", StringComparison.OrdinalIgnoreCase)
                && !string.Equals(wakeMode, "now", StringComparison.OrdinalIgnoreCase))
            {
                return new CronToolAddResult(false, null, "wakeMode must be one of: next-heartbeat, now");
            }

            if (!job.TryGetProperty("schedule", out var scheduleElement)
                || scheduleElement.ValueKind != JsonValueKind.Object)
            {
                return new CronToolAddResult(false, null, "schedule object is required");
            }

            var scheduleKind = ReadJsonString(scheduleElement, "kind");
            if (string.IsNullOrWhiteSpace(scheduleKind))
            {
                return new CronToolAddResult(false, null, "schedule.kind is required");
            }

            scheduleKind = scheduleKind.Trim().ToLowerInvariant();
            var timezoneId = TimeZoneInfo.Local.Id;
            var scheduleDisplay = string.Empty;
            var scheduleLog = string.Empty;
            var nextRunUtc = DateTimeOffset.UtcNow;
            var hour = 0;
            var minute = 0;
            string? normalizedExpr = null;
            long? scheduleAtMs = null;
            long? scheduleEveryMs = null;
            long? scheduleAnchorMs = null;

            if (string.Equals(scheduleKind, "cron", StringComparison.Ordinal))
            {
                var scheduleExpr = ReadJsonString(scheduleElement, "expr");
                if (string.IsNullOrWhiteSpace(scheduleExpr))
                {
                    return new CronToolAddResult(false, null, "schedule.expr is required for schedule.kind=cron");
                }

                if (!TryParseDailyCronExpression(scheduleExpr, out hour, out minute, out normalizedExpr, out var scheduleError))
                {
                    return new CronToolAddResult(false, null, scheduleError);
                }

                var timezoneRaw = ReadJsonString(scheduleElement, "tz");
                if (!TryResolveCronTimeZone(timezoneRaw, out timezoneId, out var timezoneError))
                {
                    return new CronToolAddResult(false, null, timezoneError);
                }

                scheduleDisplay = string.Equals(timezoneId, TimeZoneInfo.Local.Id, StringComparison.OrdinalIgnoreCase)
                    ? $"매일 {hour:D2}:{minute:D2}"
                    : $"매일 {hour:D2}:{minute:D2} ({timezoneId})";
                nextRunUtc = ComputeNextDailyRunUtc(hour, minute, timezoneId, DateTimeOffset.UtcNow);
                scheduleLog = normalizedExpr;
            }
            else if (string.Equals(scheduleKind, "at", StringComparison.Ordinal))
            {
                var atRaw = ReadJsonString(scheduleElement, "at");
                if (string.IsNullOrWhiteSpace(atRaw))
                {
                    return new CronToolAddResult(false, null, "schedule.at is required for schedule.kind=at");
                }

                if (!TryParseCronAtSchedule(atRaw, out var atUtc, out var normalizedAt, out var scheduleError))
                {
                    return new CronToolAddResult(false, null, scheduleError);
                }

                scheduleAtMs = atUtc.ToUnixTimeMilliseconds();
                var localAt = atUtc.ToLocalTime();
                hour = localAt.Hour;
                minute = localAt.Minute;
                timezoneId = TimeZoneInfo.Utc.Id;
                scheduleDisplay = BuildCronAtScheduleDisplay(atUtc);
                nextRunUtc = atUtc;
                scheduleLog = normalizedAt;
            }
            else if (string.Equals(scheduleKind, "every", StringComparison.Ordinal))
            {
                if (!TryParseCronEverySchedule(
                        scheduleElement,
                        out var everyMs,
                        out var anchorMs,
                        out var scheduleError
                    ))
                {
                    return new CronToolAddResult(false, null, scheduleError);
                }

                scheduleEveryMs = everyMs;
                scheduleAnchorMs = anchorMs;
                timezoneId = TimeZoneInfo.Utc.Id;
                scheduleDisplay = BuildCronEveryScheduleDisplay(everyMs, anchorMs);
                scheduleLog = anchorMs.HasValue
                    ? $"every/{everyMs}ms@{anchorMs.Value}"
                    : $"every/{everyMs}ms";
            }
            else
            {
                return new CronToolAddResult(false, null, "schedule.kind must be one of: cron, at, every");
            }

            string? payloadKindRaw = null;
            var payloadKindSpecified = false;
            string? payloadTextFromPayload = null;
            string? payloadMessageFromPayload = null;
            string? payloadModelFromPayload = null;
            string? payloadThinkingFromPayload = null;
            int? payloadTimeoutSecondsFromPayload = null;
            bool? payloadLightContextFromPayload = null;
            if (job.TryGetProperty("payload", out var payloadElement))
            {
                if (payloadElement.ValueKind != JsonValueKind.Object)
                {
                    return new CronToolAddResult(false, null, "payload must be object when provided");
                }

                if (payloadElement.TryGetProperty("kind", out var payloadKindElement)
                    && payloadKindElement.ValueKind != JsonValueKind.String)
                {
                    return new CronToolAddResult(false, null, "payload.kind must be string when provided");
                }
                payloadKindSpecified = payloadElement.TryGetProperty("kind", out _);

                if (payloadElement.TryGetProperty("text", out var payloadTextElement)
                    && payloadTextElement.ValueKind != JsonValueKind.String)
                {
                    return new CronToolAddResult(false, null, "payload.text must be string when provided");
                }

                if (payloadElement.TryGetProperty("message", out var payloadMessageElement)
                    && payloadMessageElement.ValueKind != JsonValueKind.String)
                {
                    return new CronToolAddResult(false, null, "payload.message must be string when provided");
                }

                if (payloadElement.TryGetProperty("model", out var payloadModelElement)
                    && payloadModelElement.ValueKind != JsonValueKind.String)
                {
                    return new CronToolAddResult(false, null, "payload.model must be string when provided");
                }

                if (payloadElement.TryGetProperty("thinking", out var payloadThinkingElement)
                    && payloadThinkingElement.ValueKind != JsonValueKind.String)
                {
                    return new CronToolAddResult(false, null, "payload.thinking must be string when provided");
                }

                if (payloadElement.TryGetProperty("timeoutSeconds", out var payloadTimeoutSecondsElement))
                {
                    if (!TryReadCronPayloadTimeoutSeconds(payloadTimeoutSecondsElement, out var payloadTimeoutSeconds))
                    {
                        return new CronToolAddResult(false, null, "payload.timeoutSeconds must be non-negative integer when provided");
                    }

                    payloadTimeoutSecondsFromPayload = payloadTimeoutSeconds;
                }

                if (payloadElement.TryGetProperty("lightContext", out var payloadLightContextElement))
                {
                    if (payloadLightContextElement.ValueKind == JsonValueKind.True)
                    {
                        payloadLightContextFromPayload = true;
                    }
                    else if (payloadLightContextElement.ValueKind == JsonValueKind.False)
                    {
                        payloadLightContextFromPayload = false;
                    }
                    else
                    {
                        return new CronToolAddResult(false, null, "payload.lightContext must be boolean when provided");
                    }
                }

                payloadKindRaw = ReadJsonString(payloadElement, "kind");
                payloadTextFromPayload = ReadJsonString(payloadElement, "text");
                payloadMessageFromPayload = ReadJsonString(payloadElement, "message");
                payloadModelFromPayload = ReadJsonString(payloadElement, "model");
                payloadThinkingFromPayload = ReadJsonString(payloadElement, "thinking");
            }

            if (job.TryGetProperty("text", out var textElement)
                && textElement.ValueKind != JsonValueKind.String)
            {
                return new CronToolAddResult(false, null, "text must be string when provided");
            }

            if (job.TryGetProperty("message", out var messageElement)
                && messageElement.ValueKind != JsonValueKind.String)
            {
                return new CronToolAddResult(false, null, "message must be string when provided");
            }

            if (job.TryGetProperty("model", out var modelElement)
                && modelElement.ValueKind != JsonValueKind.String)
            {
                return new CronToolAddResult(false, null, "model must be string when provided");
            }

            if (job.TryGetProperty("thinking", out var thinkingElement)
                && thinkingElement.ValueKind != JsonValueKind.String)
            {
                return new CronToolAddResult(false, null, "thinking must be string when provided");
            }

            int? rootTimeoutSeconds = null;
            if (job.TryGetProperty("timeoutSeconds", out var timeoutSecondsElement))
            {
                if (!TryReadCronPayloadTimeoutSeconds(timeoutSecondsElement, out var parsedTimeoutSeconds))
                {
                    return new CronToolAddResult(false, null, "timeoutSeconds must be non-negative integer when provided");
                }

                rootTimeoutSeconds = parsedTimeoutSeconds;
            }

            bool? rootLightContext = null;
            if (job.TryGetProperty("lightContext", out var lightContextElement))
            {
                if (lightContextElement.ValueKind == JsonValueKind.True)
                {
                    rootLightContext = true;
                }
                else if (lightContextElement.ValueKind == JsonValueKind.False)
                {
                    rootLightContext = false;
                }
                else
                {
                    return new CronToolAddResult(false, null, "lightContext must be boolean when provided");
                }
            }

            var payloadKind = "systemEvent";
            var payloadKindValid = payloadKindSpecified
                ? TryParseCronPayloadKind(payloadKindRaw, allowEmpty: false, out payloadKind)
                : TryParseCronPayloadKind(payloadKindRaw, allowEmpty: true, out payloadKind);
            if (!payloadKindValid)
            {
                return new CronToolAddResult(false, null, "payload.kind must be one of: systemEvent, agentTurn");
            }

            if (string.IsNullOrWhiteSpace(payloadKindRaw)
                && string.Equals(sessionTarget, "isolated", StringComparison.Ordinal))
            {
                payloadKind = "agentTurn";
            }

            var payloadContractError = ValidateCronPayloadContract(sessionTarget, payloadKind);
            if (!string.IsNullOrWhiteSpace(payloadContractError))
            {
                return new CronToolAddResult(false, null, payloadContractError);
            }

            var rootText = ReadJsonString(job, "text");
            var rootMessage = ReadJsonString(job, "message");
            var rootModel = ReadJsonString(job, "model");
            var rootThinking = ReadJsonString(job, "thinking");
            var payloadText = string.Equals(payloadKind, "agentTurn", StringComparison.Ordinal)
                ? (payloadMessageFromPayload ?? rootMessage ?? rootText)
                : (payloadTextFromPayload ?? rootText ?? rootMessage);
            if (string.IsNullOrWhiteSpace(payloadText))
            {
                var requiredField = string.Equals(payloadKind, "agentTurn", StringComparison.Ordinal)
                    ? "payload.message"
                    : "payload.text";
                return new CronToolAddResult(false, null, $"{requiredField} is required for payload.kind={payloadKind}");
            }

            var payloadTextValue = payloadText.Trim();
            var payloadModelValue = string.Equals(payloadKind, "agentTurn", StringComparison.Ordinal)
                ? (payloadModelFromPayload ?? rootModel)
                : null;
            var payloadThinkingValue = string.Equals(payloadKind, "agentTurn", StringComparison.Ordinal)
                ? (payloadThinkingFromPayload ?? rootThinking)
                : null;
            var payloadTimeoutSecondsValue = string.Equals(payloadKind, "agentTurn", StringComparison.Ordinal)
                ? (payloadTimeoutSecondsFromPayload ?? rootTimeoutSeconds)
                : null;
            var payloadLightContextValue = string.Equals(payloadKind, "agentTurn", StringComparison.Ordinal)
                ? (payloadLightContextFromPayload ?? rootLightContext)
                : null;

            bool enabled = true;
            if (job.TryGetProperty("enabled", out var enabledElement))
            {
                if (enabledElement.ValueKind == JsonValueKind.True)
                {
                    enabled = true;
                }
                else if (enabledElement.ValueKind == JsonValueKind.False)
                {
                    enabled = false;
                }
                else
                {
                    return new CronToolAddResult(false, null, "enabled must be boolean when provided");
                }
            }

            var name = ReadJsonString(job, "name");
            if (string.IsNullOrWhiteSpace(name))
            {
                name = BuildRoutineTitle(payloadTextValue);
            }

            var description = ReadJsonString(job, "description");
            var createdAt = DateTimeOffset.UtcNow;
            var id = $"rt-{createdAt:yyyyMMddHHmmss}-{Guid.NewGuid().ToString("N")[..8]}";
            if (string.Equals(scheduleKind, "cron", StringComparison.Ordinal))
            {
                nextRunUtc = ComputeNextDailyRunUtc(hour, minute, timezoneId, createdAt);
            }
            else if (string.Equals(scheduleKind, "every", StringComparison.Ordinal))
            {
                scheduleAnchorMs = ResolveCronEveryAnchorMs(scheduleAnchorMs, createdAt.ToUnixTimeMilliseconds());
                var localAnchor = TryConvertUnixMsToLocalTime(scheduleAnchorMs.Value, out var parsedAnchorLocal)
                    ? parsedAnchorLocal
                    : createdAt.ToLocalTime();
                hour = localAnchor.Hour;
                minute = localAnchor.Minute;
                scheduleDisplay = BuildCronEveryScheduleDisplay(scheduleEveryMs ?? 1L, scheduleAnchorMs);
                nextRunUtc = ComputeNextCronEveryFromAnchorUtc(
                    scheduleEveryMs ?? 1L,
                    scheduleAnchorMs.Value,
                    createdAt,
                    null
                );
            }

            var runDir = Path.Combine(_paths.WorkspaceRootDir, "routines", id);
            Directory.CreateDirectory(runDir);
            var routineSchedule = new RoutineSchedule(hour, minute, scheduleDisplay);
            var routineCode = BuildFallbackRoutineCode(payloadTextValue, routineSchedule);
            var scriptPath = Path.Combine(runDir, "run.sh");
            File.WriteAllText(scriptPath, routineCode, Encoding.UTF8);
            if (!OperatingSystem.IsWindows())
            {
                try
                {
                    File.SetUnixFileMode(scriptPath,
                        UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute |
                        UnixFileMode.GroupRead | UnixFileMode.GroupExecute |
                        UnixFileMode.OtherRead | UnixFileMode.OtherExecute);
                }
                catch
                {
                }
            }

            var routine = new RoutineDefinition
            {
                Id = id,
                Title = name.Trim(),
                Request = payloadTextValue,
                ScheduleText = scheduleDisplay,
                TimezoneId = timezoneId,
                Hour = hour,
                Minute = minute,
                Enabled = enabled,
                NextRunUtc = nextRunUtc,
                LastRunUtc = null,
                LastStatus = enabled ? "created" : "disabled",
                LastOutput = $"cron.add bridge: schedule={scheduleLog}",
                ScriptPath = scriptPath,
                Language = "bash",
                Code = routineCode,
                Planner = "cron-bridge",
                PlannerModel = "none",
                CoderModel = "local-fallback",
                CronDescription = string.IsNullOrWhiteSpace(description) ? null : description.Trim(),
                CronSessionTarget = sessionTarget,
                CronWakeMode = wakeMode.Trim().ToLowerInvariant(),
                CronPayloadKind = payloadKind,
                CronPayloadModel = payloadModelValue,
                CronPayloadThinking = payloadThinkingValue,
                CronPayloadTimeoutSeconds = payloadTimeoutSecondsValue,
                CronPayloadLightContext = payloadLightContextValue,
                CronScheduleKind = scheduleKind,
                CronScheduleExpr = normalizedExpr,
                CronScheduleAtMs = scheduleAtMs,
                CronScheduleEveryMs = scheduleEveryMs,
                CronScheduleAnchorMs = scheduleAnchorMs,
                CreatedUtc = createdAt
            };

            routine.NextRunUtc = ComputeNextCronBridgeRunUtc(routine, createdAt);

            _routineRegistry.Mutate(routines =>
            {
                routines[routine.Id] = routine;
            });

            return new CronToolAddResult(true, ToCronToolJob(routine), null);
        }
    }

    public CronToolUpdateResult UpdateCronJob(string? jobId, string? rawPatchJson)
    {
        var normalizedId = (jobId ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalizedId))
        {
            return new CronToolUpdateResult(false, null, "jobId is required");
        }

        var normalizedJson = (rawPatchJson ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalizedJson))
        {
            return new CronToolUpdateResult(false, null, "patch is required");
        }

        JsonDocument doc;
        try
        {
            doc = JsonDocument.Parse(normalizedJson);
        }
        catch (JsonException ex)
        {
            return new CronToolUpdateResult(false, null, $"invalid patch json: {ex.Message}");
        }

        using (doc)
        {
            var patch = doc.RootElement;
            if (patch.ValueKind != JsonValueKind.Object)
            {
                return new CronToolUpdateResult(false, null, "patch must be a JSON object");
            }

            return _routineRegistry.Mutate<CronToolUpdateResult>(routines =>
            {
                if (!routines.TryGetValue(normalizedId, out var routine))
                {
                    return new CronToolUpdateResult(false, null, $"job not found: {normalizedId}");
                }

                var now = DateTimeOffset.UtcNow;
                var scheduleChanged = false;
                var payloadTextChanged = false;
                var nextSessionTarget = NormalizeCronSessionTargetOrDefault(routine.CronSessionTarget);
                var nextPayloadKind = NormalizeCronPayloadKindOrDefault(routine.CronPayloadKind);
                var nextPayloadText = routine.Request;
                var nextPayloadModel = NormalizeOptionalCronPayloadString(routine.CronPayloadModel);
                var nextPayloadThinking = NormalizeOptionalCronPayloadString(routine.CronPayloadThinking);
                var nextPayloadTimeoutSeconds = routine.CronPayloadTimeoutSeconds;
                var nextPayloadLightContext = routine.CronPayloadLightContext;
                var payloadKindChanged = false;
                var payloadModelSpecified = false;
                var payloadThinkingSpecified = false;
                var payloadTimeoutSecondsSpecified = false;
                var payloadLightContextSpecified = false;

                if (patch.TryGetProperty("sessionTarget", out var sessionTargetElement))
                {
                    if (sessionTargetElement.ValueKind != JsonValueKind.String)
                    {
                        return new CronToolUpdateResult(false, null, "sessionTarget must be string when provided");
                    }

                    var sessionTargetRaw = sessionTargetElement.GetString();
                    if (!TryParseCronSessionTarget(sessionTargetRaw, allowEmpty: false, out var sessionTarget))
                    {
                        return new CronToolUpdateResult(false, null, "sessionTarget must be one of: main, isolated");
                    }

                    nextSessionTarget = sessionTarget;
                }

                if (patch.TryGetProperty("wakeMode", out var wakeModeElement))
                {
                    if (wakeModeElement.ValueKind != JsonValueKind.String)
                    {
                        return new CronToolUpdateResult(false, null, "wakeMode must be string when provided");
                    }

                    var wakeMode = (wakeModeElement.GetString() ?? string.Empty).Trim().ToLowerInvariant();
                    if (wakeMode is not ("next-heartbeat" or "now"))
                    {
                        return new CronToolUpdateResult(false, null, "wakeMode must be one of: next-heartbeat, now");
                    }

                    if (!string.Equals(routine.CronWakeMode, wakeMode, StringComparison.Ordinal))
                    {
                        routine.CronWakeMode = wakeMode;
                    }
                }

                if (patch.TryGetProperty("name", out var nameElement))
                {
                    if (nameElement.ValueKind != JsonValueKind.String)
                    {
                        return new CronToolUpdateResult(false, null, "name must be string when provided");
                    }

                    var name = (nameElement.GetString() ?? string.Empty).Trim();
                    if (string.IsNullOrWhiteSpace(name))
                    {
                        return new CronToolUpdateResult(false, null, "name must be non-empty when provided");
                    }

                    if (!string.Equals(routine.Title, name, StringComparison.Ordinal))
                    {
                        routine.Title = name;
                    }
                }

                if (patch.TryGetProperty("description", out var descriptionElement))
                {
                    if (descriptionElement.ValueKind != JsonValueKind.String)
                    {
                        return new CronToolUpdateResult(false, null, "description must be string when provided");
                    }

                    var descriptionRaw = descriptionElement.GetString();
                    var description = string.IsNullOrWhiteSpace(descriptionRaw)
                        ? null
                        : descriptionRaw.Trim();
                    if (!string.Equals(routine.CronDescription ?? string.Empty, description ?? string.Empty, StringComparison.Ordinal))
                    {
                        routine.CronDescription = description;
                    }
                }

                if (patch.TryGetProperty("enabled", out var enabledElement))
                {
                    bool enabled;
                    if (enabledElement.ValueKind == JsonValueKind.True)
                    {
                        enabled = true;
                    }
                    else if (enabledElement.ValueKind == JsonValueKind.False)
                    {
                        enabled = false;
                    }
                    else
                    {
                        return new CronToolUpdateResult(false, null, "enabled must be boolean when provided");
                    }

                    if (routine.Enabled != enabled)
                    {
                        routine.Enabled = enabled;
                        if (enabled)
                        {
                            routine.NextRunUtc = ComputeNextCronBridgeRunUtc(routine, now);
                        }
                        else
                        {
                            routine.Running = false;
                        }
                    }
                }

                if (patch.TryGetProperty("schedule", out var scheduleElement))
                {
                    if (scheduleElement.ValueKind != JsonValueKind.Object)
                    {
                        return new CronToolUpdateResult(false, null, "schedule must be object when provided");
                    }

                    if (!scheduleElement.TryGetProperty("kind", out var scheduleKindElement)
                        || scheduleKindElement.ValueKind != JsonValueKind.String)
                    {
                        return new CronToolUpdateResult(false, null, "schedule.kind is required for schedule patch");
                    }

                    var scheduleKind = (scheduleKindElement.GetString() ?? string.Empty).Trim();
                    scheduleKind = scheduleKind.Trim().ToLowerInvariant();
                    if (string.Equals(scheduleKind, "cron", StringComparison.Ordinal))
                    {
                        if (!scheduleElement.TryGetProperty("expr", out var scheduleExprElement)
                            || scheduleExprElement.ValueKind != JsonValueKind.String)
                        {
                            return new CronToolUpdateResult(false, null, "schedule.expr is required for schedule.kind=cron");
                        }

                        var scheduleExpr = scheduleExprElement.GetString();
                        if (string.IsNullOrWhiteSpace(scheduleExpr))
                        {
                            return new CronToolUpdateResult(false, null, "schedule.expr is required for schedule.kind=cron");
                        }

                        if (!TryParseDailyCronExpression(
                                scheduleExpr,
                                out var hour,
                                out var minute,
                                out var normalizedExpr,
                                out var scheduleError
                            ))
                        {
                            return new CronToolUpdateResult(false, null, scheduleError);
                        }

                        string? timezoneRaw = null;
                        if (scheduleElement.TryGetProperty("tz", out var timezoneElement))
                        {
                            if (timezoneElement.ValueKind != JsonValueKind.String)
                            {
                                return new CronToolUpdateResult(false, null, "schedule.tz must be string when provided");
                            }

                            timezoneRaw = timezoneElement.GetString();
                        }

                        if (!TryResolveCronTimeZone(timezoneRaw, out var timezoneId, out var timezoneError))
                        {
                            return new CronToolUpdateResult(false, null, timezoneError);
                        }

                        var nextScheduleText = string.Equals(timezoneId, TimeZoneInfo.Local.Id, StringComparison.OrdinalIgnoreCase)
                            ? $"매일 {hour:D2}:{minute:D2}"
                            : $"매일 {hour:D2}:{minute:D2} ({timezoneId})";
                        if (routine.Hour != hour
                            || routine.Minute != minute
                            || !string.Equals(routine.TimezoneId, timezoneId, StringComparison.Ordinal)
                            || !string.Equals(routine.CronScheduleKind, "cron", StringComparison.OrdinalIgnoreCase)
                            || !string.Equals(routine.CronScheduleExpr ?? string.Empty, normalizedExpr ?? string.Empty, StringComparison.Ordinal)
                            || routine.CronScheduleAtMs.HasValue
                            || routine.CronScheduleEveryMs.HasValue
                            || routine.CronScheduleAnchorMs.HasValue
                            || !string.Equals(routine.ScheduleText, nextScheduleText, StringComparison.Ordinal))
                        {
                            routine.Hour = hour;
                            routine.Minute = minute;
                            routine.TimezoneId = timezoneId;
                            routine.ScheduleText = nextScheduleText;
                            routine.CronScheduleKind = "cron";
                            routine.CronScheduleExpr = normalizedExpr;
                            routine.CronScheduleAtMs = null;
                            routine.CronScheduleEveryMs = null;
                            routine.CronScheduleAnchorMs = null;
                            scheduleChanged = true;
                        }
                    }
                    else if (string.Equals(scheduleKind, "at", StringComparison.Ordinal))
                    {
                        if (!scheduleElement.TryGetProperty("at", out var scheduleAtElement)
                            || scheduleAtElement.ValueKind != JsonValueKind.String)
                        {
                            return new CronToolUpdateResult(false, null, "schedule.at is required for schedule.kind=at");
                        }

                        var scheduleAtRaw = scheduleAtElement.GetString();
                        if (string.IsNullOrWhiteSpace(scheduleAtRaw))
                        {
                            return new CronToolUpdateResult(false, null, "schedule.at is required for schedule.kind=at");
                        }

                        if (!TryParseCronAtSchedule(scheduleAtRaw, out var atUtc, out _, out var scheduleError))
                        {
                            return new CronToolUpdateResult(false, null, scheduleError);
                        }

                        var atMs = atUtc.ToUnixTimeMilliseconds();
                        var localAt = atUtc.ToLocalTime();
                        var nextScheduleText = BuildCronAtScheduleDisplay(atUtc);
                        if (!string.Equals(routine.CronScheduleKind, "at", StringComparison.OrdinalIgnoreCase)
                            || routine.CronScheduleAtMs != atMs
                            || routine.CronScheduleEveryMs.HasValue
                            || routine.CronScheduleAnchorMs.HasValue
                            || !string.Equals(routine.ScheduleText, nextScheduleText, StringComparison.Ordinal))
                        {
                            routine.CronScheduleKind = "at";
                            routine.CronScheduleExpr = null;
                            routine.CronScheduleAtMs = atMs;
                            routine.CronScheduleEveryMs = null;
                            routine.CronScheduleAnchorMs = null;
                            routine.TimezoneId = TimeZoneInfo.Utc.Id;
                            routine.Hour = localAt.Hour;
                            routine.Minute = localAt.Minute;
                            routine.ScheduleText = nextScheduleText;
                            scheduleChanged = true;
                        }
                    }
                    else if (string.Equals(scheduleKind, "every", StringComparison.Ordinal))
                    {
                        if (!TryParseCronEverySchedule(
                                scheduleElement,
                                out var everyMs,
                                out var anchorMs,
                                out var scheduleError
                            ))
                        {
                            return new CronToolUpdateResult(false, null, scheduleError);
                        }

                        var resolvedAnchorMs = ResolveCronEveryAnchorMs(
                            anchorMs,
                            string.Equals(routine.CronScheduleKind, "every", StringComparison.OrdinalIgnoreCase)
                                ? routine.CronScheduleAnchorMs ?? now.ToUnixTimeMilliseconds()
                                : now.ToUnixTimeMilliseconds()
                        );
                        var nextScheduleText = BuildCronEveryScheduleDisplay(everyMs, resolvedAnchorMs);
                        var nextRunUtc = ComputeNextCronEveryFromAnchorUtc(
                            everyMs,
                            resolvedAnchorMs,
                            now,
                            routine.LastRunUtc?.ToUnixTimeMilliseconds()
                        );
                        var localAnchor = TryConvertUnixMsToLocalTime(resolvedAnchorMs, out var parsedAnchorLocal)
                            ? parsedAnchorLocal
                            : now.ToLocalTime();
                        if (!string.Equals(routine.CronScheduleKind, "every", StringComparison.OrdinalIgnoreCase)
                            || routine.CronScheduleEveryMs != everyMs
                            || routine.CronScheduleAnchorMs != resolvedAnchorMs
                            || routine.CronScheduleExpr != null
                            || routine.CronScheduleAtMs.HasValue
                            || !string.Equals(routine.ScheduleText, nextScheduleText, StringComparison.Ordinal))
                        {
                            routine.CronScheduleKind = "every";
                            routine.CronScheduleExpr = null;
                            routine.CronScheduleAtMs = null;
                            routine.CronScheduleEveryMs = everyMs;
                            routine.CronScheduleAnchorMs = resolvedAnchorMs;
                            routine.TimezoneId = TimeZoneInfo.Utc.Id;
                            routine.Hour = localAnchor.Hour;
                            routine.Minute = localAnchor.Minute;
                            routine.ScheduleText = nextScheduleText;
                            if (routine.Enabled)
                            {
                                routine.NextRunUtc = nextRunUtc;
                            }

                            scheduleChanged = true;
                        }
                    }
                    else
                    {
                        return new CronToolUpdateResult(false, null, "schedule.kind must be one of: cron, at, every");
                    }
                }

                var payloadTextSpecified = false;
                if (patch.TryGetProperty("payload", out var payloadElement))
                {
                    if (payloadElement.ValueKind != JsonValueKind.Object)
                    {
                        return new CronToolUpdateResult(false, null, "payload must be object when provided");
                    }

                    if (payloadElement.TryGetProperty("kind", out var payloadKindElement))
                    {
                        if (payloadKindElement.ValueKind != JsonValueKind.String)
                        {
                            return new CronToolUpdateResult(false, null, "payload.kind must be string when provided");
                        }

                        if (!TryParseCronPayloadKind(payloadKindElement.GetString(), allowEmpty: false, out var parsedPayloadKind))
                        {
                            return new CronToolUpdateResult(false, null, "payload.kind must be one of: systemEvent, agentTurn");
                        }

                        if (!string.Equals(nextPayloadKind, parsedPayloadKind, StringComparison.Ordinal))
                        {
                            nextPayloadKind = parsedPayloadKind;
                            payloadKindChanged = true;
                        }
                    }

                    if (payloadElement.TryGetProperty("text", out var payloadTextTypeCheckElement)
                        && payloadTextTypeCheckElement.ValueKind != JsonValueKind.String)
                    {
                        return new CronToolUpdateResult(false, null, "payload.text must be string when provided");
                    }

                    if (payloadElement.TryGetProperty("message", out var payloadMessageTypeCheckElement)
                        && payloadMessageTypeCheckElement.ValueKind != JsonValueKind.String)
                    {
                        return new CronToolUpdateResult(false, null, "payload.message must be string when provided");
                    }

                    if (payloadElement.TryGetProperty("model", out var payloadModelElement))
                    {
                        if (payloadModelElement.ValueKind != JsonValueKind.String)
                        {
                            return new CronToolUpdateResult(false, null, "payload.model must be string when provided");
                        }

                        payloadModelSpecified = true;
                        nextPayloadModel = NormalizeOptionalCronPayloadString(payloadModelElement.GetString());
                    }

                    if (payloadElement.TryGetProperty("thinking", out var payloadThinkingElement))
                    {
                        if (payloadThinkingElement.ValueKind != JsonValueKind.String)
                        {
                            return new CronToolUpdateResult(false, null, "payload.thinking must be string when provided");
                        }

                        payloadThinkingSpecified = true;
                        nextPayloadThinking = NormalizeOptionalCronPayloadString(payloadThinkingElement.GetString());
                    }

                    if (payloadElement.TryGetProperty("timeoutSeconds", out var payloadTimeoutSecondsElement))
                    {
                        if (!TryReadCronPayloadTimeoutSeconds(payloadTimeoutSecondsElement, out var payloadTimeoutSeconds))
                        {
                            return new CronToolUpdateResult(false, null, "payload.timeoutSeconds must be non-negative integer when provided");
                        }

                        payloadTimeoutSecondsSpecified = true;
                        nextPayloadTimeoutSeconds = payloadTimeoutSeconds;
                    }

                    if (payloadElement.TryGetProperty("lightContext", out var payloadLightContextElement))
                    {
                        if (payloadLightContextElement.ValueKind == JsonValueKind.True)
                        {
                            payloadLightContextSpecified = true;
                            nextPayloadLightContext = true;
                        }
                        else if (payloadLightContextElement.ValueKind == JsonValueKind.False)
                        {
                            payloadLightContextSpecified = true;
                            nextPayloadLightContext = false;
                        }
                        else
                        {
                            return new CronToolUpdateResult(false, null, "payload.lightContext must be boolean when provided");
                        }
                    }

                    if (string.Equals(nextPayloadKind, "agentTurn", StringComparison.Ordinal))
                    {
                        if (payloadElement.TryGetProperty("message", out var payloadMessageElement))
                        {
                            var payloadMessage = (payloadMessageElement.GetString() ?? string.Empty).Trim();
                            if (string.IsNullOrWhiteSpace(payloadMessage))
                            {
                                return new CronToolUpdateResult(false, null, "payload.message must be non-empty when provided");
                            }

                            nextPayloadText = payloadMessage;
                            payloadTextSpecified = true;
                        }
                        else if (payloadElement.TryGetProperty("text", out var payloadTextElement))
                        {
                            var payloadText = (payloadTextElement.GetString() ?? string.Empty).Trim();
                            if (string.IsNullOrWhiteSpace(payloadText))
                            {
                                return new CronToolUpdateResult(false, null, "payload.text must be non-empty when provided");
                            }

                            nextPayloadText = payloadText;
                            payloadTextSpecified = true;
                        }
                    }
                    else
                    {
                        if (payloadElement.TryGetProperty("text", out var payloadTextElement))
                        {
                            var payloadText = (payloadTextElement.GetString() ?? string.Empty).Trim();
                            if (string.IsNullOrWhiteSpace(payloadText))
                            {
                                return new CronToolUpdateResult(false, null, "payload.text must be non-empty when provided");
                            }

                            nextPayloadText = payloadText;
                            payloadTextSpecified = true;
                        }
                        else if (payloadElement.TryGetProperty("message", out var payloadMessageElement))
                        {
                            var payloadMessage = (payloadMessageElement.GetString() ?? string.Empty).Trim();
                            if (string.IsNullOrWhiteSpace(payloadMessage))
                            {
                                return new CronToolUpdateResult(false, null, "payload.message must be non-empty when provided");
                            }

                            nextPayloadText = payloadMessage;
                            payloadTextSpecified = true;
                        }
                    }
                }

                string? rootText = null;
                var rootTextSpecified = false;
                if (patch.TryGetProperty("text", out var textElement))
                {
                    if (textElement.ValueKind != JsonValueKind.String)
                    {
                        return new CronToolUpdateResult(false, null, "text must be string when provided");
                    }

                    rootText = (textElement.GetString() ?? string.Empty).Trim();
                    if (string.IsNullOrWhiteSpace(rootText))
                    {
                        return new CronToolUpdateResult(false, null, "text must be non-empty when provided");
                    }

                    rootTextSpecified = true;
                }

                string? rootMessage = null;
                var rootMessageSpecified = false;
                if (patch.TryGetProperty("message", out var messageElement))
                {
                    if (messageElement.ValueKind != JsonValueKind.String)
                    {
                        return new CronToolUpdateResult(false, null, "message must be string when provided");
                    }

                    rootMessage = (messageElement.GetString() ?? string.Empty).Trim();
                    if (string.IsNullOrWhiteSpace(rootMessage))
                    {
                        return new CronToolUpdateResult(false, null, "message must be non-empty when provided");
                    }

                    rootMessageSpecified = true;
                }

                string? rootModel = null;
                var rootModelSpecified = false;
                if (patch.TryGetProperty("model", out var modelElement))
                {
                    if (modelElement.ValueKind != JsonValueKind.String)
                    {
                        return new CronToolUpdateResult(false, null, "model must be string when provided");
                    }

                    rootModel = NormalizeOptionalCronPayloadString(modelElement.GetString());
                    rootModelSpecified = true;
                }

                string? rootThinking = null;
                var rootThinkingSpecified = false;
                if (patch.TryGetProperty("thinking", out var thinkingElement))
                {
                    if (thinkingElement.ValueKind != JsonValueKind.String)
                    {
                        return new CronToolUpdateResult(false, null, "thinking must be string when provided");
                    }

                    rootThinking = NormalizeOptionalCronPayloadString(thinkingElement.GetString());
                    rootThinkingSpecified = true;
                }

                int? rootTimeoutSeconds = null;
                var rootTimeoutSecondsSpecified = false;
                if (patch.TryGetProperty("timeoutSeconds", out var timeoutSecondsElement))
                {
                    if (!TryReadCronPayloadTimeoutSeconds(timeoutSecondsElement, out var parsedTimeoutSeconds))
                    {
                        return new CronToolUpdateResult(false, null, "timeoutSeconds must be non-negative integer when provided");
                    }

                    rootTimeoutSeconds = parsedTimeoutSeconds;
                    rootTimeoutSecondsSpecified = true;
                }

                bool? rootLightContext = null;
                var rootLightContextSpecified = false;
                if (patch.TryGetProperty("lightContext", out var lightContextElement))
                {
                    if (lightContextElement.ValueKind == JsonValueKind.True)
                    {
                        rootLightContext = true;
                        rootLightContextSpecified = true;
                    }
                    else if (lightContextElement.ValueKind == JsonValueKind.False)
                    {
                        rootLightContext = false;
                        rootLightContextSpecified = true;
                    }
                    else
                    {
                        return new CronToolUpdateResult(false, null, "lightContext must be boolean when provided");
                    }
                }

                if (!payloadTextSpecified)
                {
                    if (string.Equals(nextPayloadKind, "agentTurn", StringComparison.Ordinal))
                    {
                        if (rootMessageSpecified)
                        {
                            nextPayloadText = rootMessage!;
                            payloadTextSpecified = true;
                        }
                        else if (rootTextSpecified)
                        {
                            nextPayloadText = rootText!;
                            payloadTextSpecified = true;
                        }
                    }
                    else
                    {
                        if (rootTextSpecified)
                        {
                            nextPayloadText = rootText!;
                            payloadTextSpecified = true;
                        }
                        else if (rootMessageSpecified)
                        {
                            nextPayloadText = rootMessage!;
                            payloadTextSpecified = true;
                        }
                    }
                }

                if (string.Equals(nextPayloadKind, "agentTurn", StringComparison.Ordinal))
                {
                    if (!payloadModelSpecified && rootModelSpecified)
                    {
                        nextPayloadModel = rootModel;
                    }

                    if (!payloadThinkingSpecified && rootThinkingSpecified)
                    {
                        nextPayloadThinking = rootThinking;
                    }

                    if (!payloadTimeoutSecondsSpecified && rootTimeoutSecondsSpecified)
                    {
                        nextPayloadTimeoutSeconds = rootTimeoutSeconds;
                    }

                    if (!payloadLightContextSpecified && rootLightContextSpecified)
                    {
                        nextPayloadLightContext = rootLightContext;
                    }
                }
                else
                {
                    nextPayloadModel = null;
                    nextPayloadThinking = null;
                    nextPayloadTimeoutSeconds = null;
                    nextPayloadLightContext = null;
                }

                if (payloadKindChanged && !payloadTextSpecified)
                {
                    var requiredField = string.Equals(nextPayloadKind, "agentTurn", StringComparison.Ordinal)
                        ? "payload.message"
                        : "payload.text";
                    return new CronToolUpdateResult(false, null, $"{requiredField} is required for payload.kind={nextPayloadKind}");
                }

                var payloadContractError = ValidateCronPayloadContract(nextSessionTarget, nextPayloadKind);
                if (!string.IsNullOrWhiteSpace(payloadContractError))
                {
                    return new CronToolUpdateResult(false, null, payloadContractError);
                }

                if (!string.Equals(routine.CronSessionTarget, nextSessionTarget, StringComparison.OrdinalIgnoreCase))
                {
                    routine.CronSessionTarget = nextSessionTarget;
                }

                if (!string.Equals(
                        NormalizeCronPayloadKindOrDefault(routine.CronPayloadKind),
                        nextPayloadKind,
                        StringComparison.Ordinal
                    ))
                {
                    routine.CronPayloadKind = nextPayloadKind;
                }

                if (!string.Equals(
                        NormalizeOptionalCronPayloadString(routine.CronPayloadModel),
                        nextPayloadModel,
                        StringComparison.Ordinal
                    ))
                {
                    routine.CronPayloadModel = nextPayloadModel;
                }

                if (!string.Equals(
                        NormalizeOptionalCronPayloadString(routine.CronPayloadThinking),
                        nextPayloadThinking,
                        StringComparison.Ordinal
                    ))
                {
                    routine.CronPayloadThinking = nextPayloadThinking;
                }

                if (routine.CronPayloadTimeoutSeconds != nextPayloadTimeoutSeconds)
                {
                    routine.CronPayloadTimeoutSeconds = nextPayloadTimeoutSeconds;
                }

                if (routine.CronPayloadLightContext != nextPayloadLightContext)
                {
                    routine.CronPayloadLightContext = nextPayloadLightContext;
                }

                if (payloadTextSpecified
                    && !string.Equals(routine.Request, nextPayloadText, StringComparison.Ordinal))
                {
                    routine.Request = nextPayloadText;
                    payloadTextChanged = true;
                }

                if (scheduleChanged && routine.Enabled)
                {
                    routine.NextRunUtc = ComputeNextCronBridgeRunUtc(routine, now);
                }

                if ((scheduleChanged || payloadTextChanged)
                    && string.Equals(routine.Planner, "cron-bridge", StringComparison.OrdinalIgnoreCase))
                {
                    var schedule = new RoutineSchedule(routine.Hour, routine.Minute, routine.ScheduleText);
                    var routineCode = BuildFallbackRoutineCode(routine.Request, schedule);
                    routine.Code = routineCode;
                    routine.Language = "bash";
                    routine.CoderModel = "local-fallback";

                    if (!string.IsNullOrWhiteSpace(routine.ScriptPath))
                    {
                        var scriptDir = Path.GetDirectoryName(routine.ScriptPath);
                        if (!string.IsNullOrWhiteSpace(scriptDir))
                        {
                            Directory.CreateDirectory(scriptDir);
                        }

                        File.WriteAllText(routine.ScriptPath, routineCode, Encoding.UTF8);
                        if (!OperatingSystem.IsWindows())
                        {
                            try
                            {
                                File.SetUnixFileMode(routine.ScriptPath,
                                    UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute |
                                    UnixFileMode.GroupRead | UnixFileMode.GroupExecute |
                                    UnixFileMode.OtherRead | UnixFileMode.OtherExecute);
                            }
                            catch
                            {
                            }
                        }
                    }
                }

                return new CronToolUpdateResult(true, ToCronToolJob(routine), null);
            });
        }
    }

    public async Task<CronToolRunResult> RunCronJobAsync(
        string? jobId,
        string? runMode,
        string source,
        CancellationToken cancellationToken
    )
    {
        var normalizedId = (jobId ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalizedId))
        {
            return new CronToolRunResult(false, false, null, "jobId is required");
        }

        var dueOnly = string.Equals((runMode ?? string.Empty).Trim(), "due", StringComparison.OrdinalIgnoreCase);
        var routineState = _routineRegistry.Read(normalizedId, routine =>
        {
            return (
                Exists: routine != null,
                Enabled: routine?.Enabled ?? false,
                Running: routine?.Running ?? false,
                DueAtUtc: routine?.NextRunUtc ?? DateTimeOffset.MinValue
            );
        });
        var exists = routineState.Exists;
        var enabled = routineState.Enabled;
        var running = routineState.Running;
        var dueAtUtc = routineState.DueAtUtc;

        if (!exists)
        {
            return new CronToolRunResult(false, false, null, $"job not found: {normalizedId}");
        }

        if (running)
        {
            return new CronToolRunResult(true, false, "already-running", null);
        }

        if (dueOnly)
        {
            if (!enabled)
            {
                return new CronToolRunResult(true, false, "disabled", null);
            }

            if (dueAtUtc > DateTimeOffset.UtcNow)
            {
                return new CronToolRunResult(true, false, "not-due", null);
            }
        }

        try
        {
            var result = await RoutineAppService.RunRoutineNowAsync(normalizedId, source, cancellationToken).ConfigureAwait(false);
            if (!result.Ok)
            {
                return new CronToolRunResult(false, false, null, result.Message);
            }

            return new CronToolRunResult(true, true, null, null);
        }
        catch (Exception ex)
        {
            return new CronToolRunResult(false, false, null, ex.Message);
        }
    }

    public CronToolWakeResult WakeCron(
        string? mode,
        string? text,
        string source
    )
    {
        var normalizedText = (text ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalizedText))
        {
            return new CronToolWakeResult(
                Ok: false,
                Mode: "next-heartbeat",
                TriggeredRuns: 0,
                Error: "text is required"
            );
        }

        var normalizedMode = (mode ?? string.Empty).Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(normalizedMode))
        {
            normalizedMode = "next-heartbeat";
        }

        if (normalizedMode is not ("next-heartbeat" or "now"))
        {
            return new CronToolWakeResult(
                Ok: false,
                Mode: normalizedMode,
                TriggeredRuns: 0,
                Error: "mode must be one of: next-heartbeat, now"
            );
        }

        var eventText = normalizedText
            .Replace('\r', ' ')
            .Replace('\n', ' ');
        if (eventText.Length > 180)
        {
            eventText = eventText[..180] + "...";
        }

        RecordEvent($"cron.wake mode={normalizedMode} source={source} text={eventText}");

        var triggeredRuns = 0;
        if (string.Equals(normalizedMode, "now", StringComparison.Ordinal))
        {
            triggeredRuns = TriggerDueRoutinesForWake("cron-wake");
        }

        return new CronToolWakeResult(
            Ok: true,
            Mode: normalizedMode,
            TriggeredRuns: triggeredRuns,
            Error: null
        );
    }

    public CronToolRemoveResult RemoveCronJob(string? jobId)
    {
        var normalizedId = (jobId ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalizedId))
        {
            return new CronToolRemoveResult(false, false, "jobId is required");
        }

        var result = RoutineAppService.DeleteRoutine(normalizedId);
        return new CronToolRemoveResult(
            Ok: result.Ok,
            Removed: result.Ok,
            Error: result.Ok ? null : result.Message
        );
    }

}
