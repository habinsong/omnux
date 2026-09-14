using System.Diagnostics;
using System.Globalization;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Xml.Linq;

namespace Omnux.Middleware;

public sealed partial class CommandService
{

    public SessionListToolResult ListSessions(
        IReadOnlyList<string>? kinds = null,
        int? limit = null,
        int? activeMinutes = null,
        int? messageLimit = null,
        string? search = null,
        string? scope = null,
        string? mode = null
    ) => _toolAppService.ListSessions(kinds, limit, activeMinutes, messageLimit, search, scope, mode);

    public SessionHistoryToolResult GetSessionHistory(
        string? sessionKey,
        int? limit = null,
        bool includeTools = false
    ) => _toolAppService.GetSessionHistory(sessionKey, limit, includeTools);

    public SessionSendToolResult SendToSession(
        string? sessionKey,
        string? message,
        int? timeoutSeconds = null
    ) => _toolAppService.SendToSession(sessionKey, message, timeoutSeconds);

    public SessionSpawnToolResult SpawnSession(
        string? task,
        string? label = null,
        string? runtime = null,
        int? runTimeoutSeconds = null,
        int? timeoutSeconds = null,
        bool? thread = null,
        string? mode = null,
        string? commandPriority = null
    ) => _toolAppService.SpawnSession(task, label, runtime, runTimeoutSeconds, timeoutSeconds, thread, mode, commandPriority);

    public SessionSpawnQueueStatus GetSessionSpawnStatus()
        => _toolAppService.GetSessionSpawnStatus();

    public Task<WebFetchToolResult> FetchWebAsync(
        string url,
        string? extractMode = null,
        int? maxChars = null,
        CancellationToken cancellationToken = default
    ) => _toolAppService.FetchWebAsync(url, extractMode, maxChars, cancellationToken);

    public BrowserToolResult ExecuteBrowser(
        string? action,
        string? targetUrl = null,
        string? profile = null,
        string? targetId = null,
        int? limit = null
    ) => _toolAppService.ExecuteBrowser(action, targetUrl, profile, targetId, limit);

    public CanvasToolResult ExecuteCanvas(
        string? action,
        string? profile = null,
        string? target = null,
        string? targetUrl = null,
        string? javaScript = null,
        string? jsonl = null,
        string? outputFormat = null,
        int? maxWidth = null
    ) => _toolAppService.ExecuteCanvas(action, profile, target, targetUrl, javaScript, jsonl, outputFormat, maxWidth);

    public NodesToolResult ExecuteNodes(
        string? action,
        string? profile = null,
        string? node = null,
        string? requestId = null,
        string? title = null,
        string? body = null,
        string? priority = null,
        string? delivery = null,
        string? invokeCommand = null,
        string? invokeParamsJson = null
    )
    {
        return _toolAppService.ExecuteNodes(
            action,
            profile,
            node,
            requestId,
            title,
            body,
            priority,
            delivery,
            invokeCommand,
            invokeParamsJson
        );
    }

    private int TriggerDueRoutinesForWake(string source)
    {
        var dueIds = _routineRegistry.ReadAll(routines =>
        {
            var now = DateTimeOffset.UtcNow;
            return routines
                .Where(x => x.Enabled && !x.Running && x.NextRunUtc <= now)
                .Select(x => x.Id)
                .ToList();
        });

        foreach (var id in dueIds)
        {
            _ = Task.Run(async () =>
            {
                try
                {
                    var result = await RoutineAppService.RunRoutineNowAsync(id, source, CancellationToken.None).ConfigureAwait(false);
                    if (!result.Ok)
                    {
                        Console.Error.WriteLine($"[routine] wake run skipped ({id}): {result.Message}");
                    }
                }
                catch (Exception ex)
                {
                    Console.Error.WriteLine($"[routine] wake run failed ({id}): {ex.Message}");
                }
            }, CancellationToken.None);
        }

        return dueIds.Count;
    }

    private static CronToolJob ToCronToolJob(RoutineDefinition routine)
    {
        var createdAtMs = routine.CreatedUtc.ToUnixTimeMilliseconds();
        var updatedAtMs = (routine.LastRunUtc ?? routine.CreatedUtc).ToUnixTimeMilliseconds();
        var requestText = ResolveRoutineExecutionRequestText(routine.Request, routine.Title, routine.ScheduleSourceMode);
        var payloadKind = NormalizeCronPayloadKindOrDefault(routine.CronPayloadKind);
        var payloadText = string.Equals(payloadKind, "agentTurn", StringComparison.Ordinal)
            ? null
            : requestText;
        var payloadMessage = string.Equals(payloadKind, "agentTurn", StringComparison.Ordinal)
            ? requestText
            : null;
        var payloadModel = string.Equals(payloadKind, "agentTurn", StringComparison.Ordinal)
            ? NormalizeOptionalCronPayloadString(routine.CronPayloadModel)
            : null;
        var payloadThinking = string.Equals(payloadKind, "agentTurn", StringComparison.Ordinal)
            ? NormalizeOptionalCronPayloadString(routine.CronPayloadThinking)
            : null;
        var payloadTimeoutSeconds = string.Equals(payloadKind, "agentTurn", StringComparison.Ordinal)
            ? routine.CronPayloadTimeoutSeconds
            : null;
        var payloadLightContext = string.Equals(payloadKind, "agentTurn", StringComparison.Ordinal)
            ? routine.CronPayloadLightContext
            : null;
        var status = NormalizeCronRunStatus(routine.LastStatus);
        var lastError = status == "error"
            ? TrimForCronError(routine.LastOutput)
            : null;
        var scheduleKind = NormalizeCronScheduleKind(routine.CronScheduleKind);
        var scheduleExpr = scheduleKind == "cron"
            ? (string.IsNullOrWhiteSpace(routine.CronScheduleExpr) ? $"{routine.Minute} {routine.Hour} * * *" : routine.CronScheduleExpr.Trim())
            : null;
        var scheduleTz = scheduleKind == "cron"
            ? (string.IsNullOrWhiteSpace(routine.TimezoneId) ? TimeZoneInfo.Local.Id : routine.TimezoneId)
            : null;
        var scheduleAt = scheduleKind == "at"
            ? FormatCronAtSchedule(routine.CronScheduleAtMs)
            : null;
        var scheduleEveryMs = scheduleKind == "every"
            ? NormalizeCronEveryMs(routine.CronScheduleEveryMs)
            : null;
        var scheduleAnchorMs = scheduleKind == "every"
            ? routine.CronScheduleAnchorMs
            : null;

        return new CronToolJob(
            Id: routine.Id,
            Name: string.IsNullOrWhiteSpace(routine.Title) ? routine.Id : routine.Title,
            Enabled: routine.Enabled,
            CreatedAtMs: createdAtMs,
            UpdatedAtMs: updatedAtMs,
            SessionTarget: NormalizeCronSessionTargetOrDefault(routine.CronSessionTarget),
            WakeMode: string.IsNullOrWhiteSpace(routine.CronWakeMode) ? "next-heartbeat" : routine.CronWakeMode,
            Schedule: new CronToolSchedule(
                Kind: scheduleKind,
                Expr: scheduleExpr,
                Tz: scheduleTz,
                At: scheduleAt,
                EveryMs: scheduleEveryMs,
                AnchorMs: scheduleAnchorMs
            ),
            Payload: new CronToolPayload(
                payloadKind,
                payloadText,
                payloadMessage,
                payloadModel,
                payloadThinking,
                payloadTimeoutSeconds,
                payloadLightContext
            ),
            State: new CronToolJobState(
                NextRunAtMs: routine.Enabled ? routine.NextRunUtc.ToUnixTimeMilliseconds() : null,
                RunningAtMs: routine.Running ? DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() : null,
                LastRunAtMs: routine.LastRunUtc?.ToUnixTimeMilliseconds(),
                LastRunStatus: status,
                LastError: lastError,
                LastDurationMs: routine.LastDurationMs
            ),
            Description: string.IsNullOrWhiteSpace(routine.CronDescription) ? routine.ScheduleText : routine.CronDescription
        );
    }

    private static IReadOnlyList<CronToolRunLogEntry> BuildCronRunEntries(RoutineDefinition routine)
    {
        var entries = new List<CronToolRunLogEntry>();
        if (routine.CronRunLog != null)
        {
            foreach (var raw in routine.CronRunLog)
            {
                if (raw is null || raw.Ts <= 0)
                {
                    continue;
                }

                var action = string.IsNullOrWhiteSpace(raw.Action)
                    ? "finished"
                    : raw.Action.Trim().ToLowerInvariant();
                if (!string.Equals(action, "finished", StringComparison.Ordinal))
                {
                    continue;
                }

                var status = NormalizeCronRunStatus(raw.Status);
                entries.Add(new CronToolRunLogEntry(
                    Ts: raw.Ts,
                    JobId: routine.Id,
                    Action: "finished",
                    Status: status,
                    Source: string.IsNullOrWhiteSpace(raw.Source) ? null : raw.Source,
                    AttemptCount: Math.Max(1, raw.AttemptCount),
                    Error: status == "error" ? TrimForCronError(raw.Error) : null,
                    Summary: BuildCronRunEntrySummary(raw.Summary ?? string.Empty),
                    TelegramStatus: string.IsNullOrWhiteSpace(raw.TelegramStatus) ? null : raw.TelegramStatus,
                    ArtifactPath: string.IsNullOrWhiteSpace(raw.ArtifactPath) ? null : raw.ArtifactPath,
                    RunAtMs: raw.RunAtMs,
                    DurationMs: raw.DurationMs,
                    NextRunAtMs: raw.NextRunAtMs,
                    JobName: string.IsNullOrWhiteSpace(routine.Title) ? null : routine.Title
                ));
            }
        }

        if (entries.Count > 0 || !routine.LastRunUtc.HasValue)
        {
            return entries;
        }

        var fallbackStatus = NormalizeCronRunStatus(routine.LastStatus);
        entries.Add(new CronToolRunLogEntry(
            Ts: routine.LastRunUtc.Value.ToUnixTimeMilliseconds(),
            JobId: routine.Id,
            Action: "finished",
            Status: fallbackStatus,
            Source: null,
            AttemptCount: 1,
            Error: fallbackStatus == "error" ? TrimForCronError(routine.LastOutput) : null,
            Summary: BuildCronRunEntrySummary(routine.LastOutput),
            TelegramStatus: null,
            ArtifactPath: null,
            RunAtMs: routine.LastRunUtc.Value.ToUnixTimeMilliseconds(),
            DurationMs: routine.LastDurationMs,
            NextRunAtMs: routine.Enabled ? routine.NextRunUtc.ToUnixTimeMilliseconds() : null,
            JobName: string.IsNullOrWhiteSpace(routine.Title) ? null : routine.Title
        ));
        return entries;
    }

    private static bool IsCronRunLogJobIdSafe(string candidate)
    {
        return candidate.IndexOf('/') < 0
            && candidate.IndexOf('\\') < 0
            && !candidate.Contains('\0');
    }

    private static string? ReadJsonString(JsonElement obj, string propertyName)
    {
        if (!obj.TryGetProperty(propertyName, out var element))
        {
            return null;
        }

        if (element.ValueKind != JsonValueKind.String)
        {
            return null;
        }

        var value = element.GetString();
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }

    internal static string? NormalizeOptionalCronPayloadString(string? value)
    {
        var normalized = (value ?? string.Empty).Trim();
        return normalized.Length == 0 ? null : normalized;
    }

    private static bool TryReadCronPayloadTimeoutSeconds(JsonElement element, out int timeoutSeconds)
    {
        timeoutSeconds = 0;
        if (element.ValueKind == JsonValueKind.Number)
        {
            if (!element.TryGetInt32(out timeoutSeconds))
            {
                return false;
            }

            return timeoutSeconds >= 0;
        }

        if (element.ValueKind == JsonValueKind.String)
        {
            var raw = (element.GetString() ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(raw)
                || !int.TryParse(raw, NumberStyles.Integer, CultureInfo.InvariantCulture, out timeoutSeconds))
            {
                return false;
            }

            return timeoutSeconds >= 0;
        }

        return false;
    }

    private static bool TryParseDailyCronExpression(
        string expr,
        out int hour,
        out int minute,
        out string normalizedExpr,
        out string error
    )
    {
        hour = 0;
        minute = 0;
        normalizedExpr = string.Empty;
        error = "invalid cron expression";

        var tokens = (expr ?? string.Empty)
            .Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (tokens.Length != 5)
        {
            error = "schedule.expr must use 5-field cron syntax (m h dom mon dow)";
            return false;
        }

        if (!int.TryParse(tokens[0], NumberStyles.Integer, CultureInfo.InvariantCulture, out minute)
            || minute < 0 || minute > 59)
        {
            error = "schedule.expr minute must be 0-59";
            return false;
        }

        if (!int.TryParse(tokens[1], NumberStyles.Integer, CultureInfo.InvariantCulture, out hour)
            || hour < 0 || hour > 23)
        {
            error = "schedule.expr hour must be 0-23";
            return false;
        }

        if (!string.Equals(tokens[2], "*", StringComparison.Ordinal)
            || !string.Equals(tokens[3], "*", StringComparison.Ordinal)
            || !string.Equals(tokens[4], "*", StringComparison.Ordinal))
        {
            error = "routine bridge only supports daily cron expressions: '<minute> <hour> * * *'";
            return false;
        }

        normalizedExpr = $"{minute} {hour} * * *";
        return true;
    }

    private static bool TryResolveCronTimeZone(string? timezoneRaw, out string timezoneId, out string error)
    {
        error = string.Empty;
        if (string.IsNullOrWhiteSpace(timezoneRaw))
        {
            timezoneId = TimeZoneInfo.Local.Id;
            return true;
        }

        var candidate = timezoneRaw.Trim();
        try
        {
            timezoneId = TimeZoneInfo.FindSystemTimeZoneById(candidate).Id;
            return true;
        }
        catch
        {
            timezoneId = TimeZoneInfo.Local.Id;
            error = $"unsupported timezone: {candidate}";
            return false;
        }
    }

    private static bool TryReadJsonLong(JsonElement element, out long value)
    {
        value = 0L;
        if (element.ValueKind == JsonValueKind.Number)
        {
            return element.TryGetInt64(out value);
        }

        if (element.ValueKind != JsonValueKind.String)
        {
            return false;
        }

        var raw = (element.GetString() ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(raw))
        {
            return false;
        }

        return long.TryParse(raw, NumberStyles.Integer, CultureInfo.InvariantCulture, out value);
    }

    private static bool TryConvertUnixMsToLocalTime(long unixMs, out DateTimeOffset localTime)
    {
        localTime = DateTimeOffset.MinValue;
        try
        {
            localTime = DateTimeOffset.FromUnixTimeMilliseconds(unixMs).ToLocalTime();
            return true;
        }
        catch
        {
            return false;
        }
    }

    private static bool TryParseCronEverySchedule(
        JsonElement scheduleElement,
        out long everyMs,
        out long? anchorMs,
        out string error
    )
    {
        everyMs = 0L;
        anchorMs = null;
        error = string.Empty;

        if (!scheduleElement.TryGetProperty("everyMs", out var everyElement))
        {
            error = "schedule.everyMs is required for schedule.kind=every";
            return false;
        }

        if (!TryReadJsonLong(everyElement, out everyMs) || everyMs < 1)
        {
            error = "schedule.everyMs must be integer >= 1";
            return false;
        }

        if (!scheduleElement.TryGetProperty("anchorMs", out var anchorElement))
        {
            return true;
        }

        if (!TryReadJsonLong(anchorElement, out var parsedAnchorMs) || parsedAnchorMs < 0)
        {
            error = "schedule.anchorMs must be integer >= 0 when provided";
            return false;
        }

        if (!TryConvertUnixMsToLocalTime(parsedAnchorMs, out _))
        {
            error = "schedule.anchorMs is out of range";
            return false;
        }

        anchorMs = parsedAnchorMs;
        return true;
    }

    private static long ResolveCronEveryAnchorMs(long? anchorMs, long fallbackAnchorMs)
    {
        if (anchorMs.HasValue)
        {
            return Math.Max(0L, anchorMs.Value);
        }

        return Math.Max(0L, fallbackAnchorMs);
    }

    private static long? NormalizeCronEveryMs(long? everyMs)
    {
        if (!everyMs.HasValue)
        {
            return null;
        }

        return everyMs.Value < 1 ? 1 : everyMs.Value;
    }

    private static long ComputeNextCronEveryFromAnchorMs(
        long everyMsRaw,
        long anchorMsRaw,
        long nowMs,
        long? lastRunAtMs
    )
    {
        var everyMs = Math.Max(1L, everyMsRaw);
        if (lastRunAtMs.HasValue && lastRunAtMs.Value >= 0)
        {
            var nextFromLastRun = lastRunAtMs.Value + everyMs;
            if (nextFromLastRun > nowMs && nextFromLastRun > 0)
            {
                return nextFromLastRun;
            }
        }

        var anchorMs = Math.Max(0L, anchorMsRaw);
        if (nowMs < anchorMs)
        {
            return anchorMs;
        }

        var elapsed = nowMs - anchorMs;
        var steps = Math.Max(1L, (elapsed + everyMs - 1L) / everyMs);
        if (steps > (long.MaxValue / everyMs))
        {
            return long.MaxValue;
        }

        var next = anchorMs + (steps * everyMs);
        if (next <= nowMs)
        {
            if (everyMs > long.MaxValue - next)
            {
                return long.MaxValue;
            }

            next += everyMs;
        }

        return next;
    }

    private static DateTimeOffset ComputeNextCronEveryFromAnchorUtc(
        long everyMs,
        long anchorMs,
        DateTimeOffset nowUtc,
        long? lastRunAtMs
    )
    {
        var nowMs = nowUtc.ToUnixTimeMilliseconds();
        var nextMs = ComputeNextCronEveryFromAnchorMs(everyMs, anchorMs, nowMs, lastRunAtMs);
        try
        {
            return DateTimeOffset.FromUnixTimeMilliseconds(nextMs).ToUniversalTime();
        }
        catch
        {
            return nowUtc;
        }
    }

    private static string FormatCronEveryInterval(long everyMsRaw)
    {
        var everyMs = Math.Max(1L, everyMsRaw);
        if (everyMs % (60L * 60L * 1000L) == 0)
        {
            return $"매 {everyMs / (60L * 60L * 1000L)}시간마다";
        }

        if (everyMs % (60L * 1000L) == 0)
        {
            return $"매 {everyMs / (60L * 1000L)}분마다";
        }

        if (everyMs % 1000L == 0)
        {
            return $"매 {everyMs / 1000L}초마다";
        }

        return $"매 {everyMs}ms마다";
    }

    private static string BuildCronEveryScheduleDisplay(long everyMs, long? anchorMs)
    {
        var intervalText = FormatCronEveryInterval(everyMs);
        if (!anchorMs.HasValue)
        {
            return intervalText;
        }

        try
        {
            var anchorLocal = DateTimeOffset.FromUnixTimeMilliseconds(anchorMs.Value).ToLocalTime();
            return $"{intervalText} (기준 {anchorLocal:yyyy-MM-dd HH:mm:ss} local)";
        }
        catch
        {
            return intervalText;
        }
    }

    private static bool TryParseCronSessionTarget(string? sessionTargetRaw, bool allowEmpty, out string normalized)
    {
        normalized = "main";
        var candidate = (sessionTargetRaw ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(candidate))
        {
            return allowEmpty;
        }

        var lower = candidate.ToLowerInvariant();
        if (lower is "main" or "isolated")
        {
            normalized = lower;
            return true;
        }

        return false;
    }

    private static bool TryParseCronPayloadKind(string? payloadKindRaw, bool allowEmpty, out string normalized)
    {
        normalized = "systemEvent";
        var candidate = (payloadKindRaw ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(candidate))
        {
            return allowEmpty;
        }

        var compact = candidate.Replace("-", string.Empty, StringComparison.Ordinal)
            .Replace("_", string.Empty, StringComparison.Ordinal)
            .ToLowerInvariant();
        if (compact == "systemevent")
        {
            normalized = "systemEvent";
            return true;
        }

        if (compact == "agentturn")
        {
            normalized = "agentTurn";
            return true;
        }

        return false;
    }

    internal static string NormalizeCronPayloadKindOrDefault(string? payloadKindRaw)
    {
        return TryParseCronPayloadKind(payloadKindRaw, allowEmpty: true, out var normalized)
            ? normalized
            : "systemEvent";
    }

    private static string? ValidateCronPayloadContract(string sessionTarget, string payloadKind)
    {
        if (string.Equals(sessionTarget, "main", StringComparison.Ordinal)
            && !string.Equals(payloadKind, "systemEvent", StringComparison.Ordinal))
        {
            return "main cron jobs require payload.kind=\"systemEvent\"";
        }

        if (string.Equals(sessionTarget, "isolated", StringComparison.Ordinal)
            && !string.Equals(payloadKind, "agentTurn", StringComparison.Ordinal))
        {
            return "isolated cron jobs require payload.kind=\"agentTurn\"";
        }

        return null;
    }

    internal static string NormalizeCronSessionTargetOrDefault(string? sessionTargetRaw)
    {
        return TryParseCronSessionTarget(sessionTargetRaw, allowEmpty: true, out var normalized)
            ? normalized
            : "main";
    }

    internal static string NormalizeCronScheduleKind(string? kind)
    {
        var normalized = (kind ?? string.Empty).Trim().ToLowerInvariant();
        return normalized switch
        {
            "at" => "at",
            "every" => "every",
            _ => "cron"
        };
    }

    internal static DateTimeOffset ComputeNextCronBridgeRunUtc(RoutineDefinition routine, DateTimeOffset nowUtc)
    {
        var scheduleKind = NormalizeCronScheduleKind(routine.CronScheduleKind);
        if (string.Equals(scheduleKind, "at", StringComparison.Ordinal))
        {
            if (routine.CronScheduleAtMs.HasValue)
            {
                try
                {
                    return DateTimeOffset.FromUnixTimeMilliseconds(routine.CronScheduleAtMs.Value).ToUniversalTime();
                }
                catch
                {
                }
            }

            return nowUtc;
        }

        if (string.Equals(scheduleKind, "every", StringComparison.Ordinal))
        {
            var everyMs = NormalizeCronEveryMs(routine.CronScheduleEveryMs) ?? 1L;
            var fallbackAnchorMs = nowUtc.ToUnixTimeMilliseconds();
            if (routine.CreatedUtc != DateTimeOffset.MinValue)
            {
                try
                {
                    fallbackAnchorMs = routine.CreatedUtc.ToUnixTimeMilliseconds();
                }
                catch
                {
                }
            }

            var anchorMs = ResolveCronEveryAnchorMs(routine.CronScheduleAnchorMs, fallbackAnchorMs);
            return ComputeNextCronEveryFromAnchorUtc(
                everyMs,
                anchorMs,
                nowUtc,
                routine.LastRunUtc?.ToUnixTimeMilliseconds()
            );
        }

        return ComputeNextSupportedRoutineCronUtc(
            routine.CronScheduleExpr,
            routine.TimezoneId,
            routine.Hour,
            routine.Minute,
            nowUtc
        );
    }

    private static DateTimeOffset ComputeNextSupportedRoutineCronUtc(
        string? cronExpr,
        string timezoneId,
        int fallbackHour,
        int fallbackMinute,
        DateTimeOffset nowUtc
    )
    {
        if (!RoutineSchedulePolicy.TryParseSupportedCronExpression(
                cronExpr,
                out var kind,
                out var hour,
                out var minute,
                out var dayOfMonth,
                out var weekdays,
                out _,
                out _
            ))
        {
            return ComputeNextDailyRunUtc(fallbackHour, fallbackMinute, timezoneId, nowUtc);
        }

        var tz = RoutineSchedulePolicy.ResolveTimeZone(timezoneId);
        var nowLocal = TimeZoneInfo.ConvertTime(nowUtc, tz);
        var startDate = nowLocal.Date;
        for (var offsetDays = 0; offsetDays <= 800; offsetDays += 1)
        {
            var candidateDate = startDate.AddDays(offsetDays);
            if (string.Equals(kind, "weekly", StringComparison.Ordinal)
                && Array.IndexOf(weekdays, (int)candidateDate.DayOfWeek) < 0)
            {
                continue;
            }

            if (string.Equals(kind, "monthly", StringComparison.Ordinal)
                && candidateDate.Day != dayOfMonth.GetValueOrDefault())
            {
                continue;
            }

            var candidateLocal = new DateTime(
                candidateDate.Year,
                candidateDate.Month,
                candidateDate.Day,
                hour,
                minute,
                0,
                DateTimeKind.Unspecified
            );
            var candidateOffset = tz.GetUtcOffset(candidateLocal);
            var candidateUtc = new DateTimeOffset(candidateLocal, candidateOffset).ToUniversalTime();
            if (candidateUtc > nowUtc)
            {
                return candidateUtc;
            }
        }

        return ComputeNextDailyRunUtc(fallbackHour, fallbackMinute, timezoneId, nowUtc);
    }

    private static string? FormatCronAtSchedule(long? atMs)
    {
        if (!atMs.HasValue)
        {
            return null;
        }

        try
        {
            return DateTimeOffset.FromUnixTimeMilliseconds(atMs.Value)
                .ToUniversalTime()
                .ToString("O", CultureInfo.InvariantCulture);
        }
        catch
        {
            return null;
        }
    }

    private static string BuildCronAtScheduleDisplay(DateTimeOffset atUtc)
    {
        var local = atUtc.ToLocalTime();
        return $"한 번 실행 {local:yyyy-MM-dd HH:mm:ss} (local)";
    }

    private static bool TryParseCronAtSchedule(
        string atRaw,
        out DateTimeOffset atUtc,
        out string normalizedAt,
        out string error
    )
    {
        atUtc = DateTimeOffset.MinValue;
        normalizedAt = string.Empty;
        error = "schedule.at must be an ISO-8601 timestamp or epoch milliseconds";

        var candidate = (atRaw ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(candidate))
        {
            return false;
        }

        if (long.TryParse(candidate, NumberStyles.Integer, CultureInfo.InvariantCulture, out var epochMs)
            && epochMs > 0)
        {
            try
            {
                atUtc = DateTimeOffset.FromUnixTimeMilliseconds(epochMs).ToUniversalTime();
                normalizedAt = atUtc.ToString("O", CultureInfo.InvariantCulture);
                return true;
            }
            catch
            {
                return false;
            }
        }

        var normalizedInput = candidate;
        if (Regex.IsMatch(candidate, @"^\d{4}-\d{2}-\d{2}$", RegexOptions.CultureInvariant))
        {
            normalizedInput = $"{candidate}T00:00:00Z";
        }
        else if (Regex.IsMatch(candidate, @"^\d{4}-\d{2}-\d{2}T", RegexOptions.CultureInvariant)
            && !Regex.IsMatch(candidate, @"(Z|[+-]\d{2}:?\d{2})$", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant))
        {
            normalizedInput = $"{candidate}Z";
        }

        if (!DateTimeOffset.TryParse(
                normalizedInput,
                CultureInfo.InvariantCulture,
                DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal,
                out var parsed))
        {
            return false;
        }

        atUtc = parsed.ToUniversalTime();
        normalizedAt = atUtc.ToString("O", CultureInfo.InvariantCulture);
        return true;
    }

    internal static string ResolveRoutineExecutionRequestText(string? request, string? title, string? scheduleSourceMode)
    {
        var normalizedTask = NormalizeRoutineTaskRequest(request);
        if (!string.IsNullOrWhiteSpace(normalizedTask))
        {
            return normalizedTask;
        }

        var raw = (request ?? string.Empty).Trim();
        if (!string.IsNullOrWhiteSpace(raw))
        {
            return raw;
        }

        return string.IsNullOrWhiteSpace(title)
            ? "scheduled routine"
            : title.Trim();
    }

    internal static string NormalizeRoutineScheduleSourceMode(string? mode, string? request)
    {
        var normalized = (mode ?? string.Empty).Trim().ToLowerInvariant();
        if (normalized is "auto" or "manual")
        {
            return normalized;
        }

        return RoutineSchedulePolicy.ContainsScheduleExpression(request)
            ? "auto"
            : "manual";
    }


    private static string NormalizeRoutineTaskRequest(string? request)
    {
        var normalized = Regex.Replace(
                (request ?? string.Empty).Replace("\r", " ", StringComparison.Ordinal).Replace("\n", " ", StringComparison.Ordinal),
                @"\s+",
                " ",
                RegexOptions.CultureInvariant
            )
            .Trim();
        if (normalized.Length == 0)
        {
            return string.Empty;
        }

        for (var i = 0; i < 4; i += 1)
        {
            var updated = StripLeadingRoutineScheduleDirective(normalized);
            if (string.Equals(updated, normalized, StringComparison.Ordinal))
            {
                break;
            }

            normalized = updated;
        }

        normalized = Regex.Replace(
            normalized,
            @"\s+(?:매일|매주|매월|(?:월|화|수|목|금|토|일)요일(?:마다)?|(?:아침|오전|오후|저녁|밤|새벽)?\s*\d{1,2}(?::\d{2})?\s*(?:시(?:\s*\d{1,2}\s*분)?|분)?(?:\s*반)?)(?:에|마다)?(?=\s*(?:알려줘|보내줘|전송해줘|정리해줘|요약해줘|브리핑해줘|말해줘|공유해줘))",
            string.Empty,
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant
        );
        normalized = Regex.Replace(
            normalized,
            @"\s+(?:보내줘|전송해줘|공유해줘|알려줘|말해줘|보여줘)(?:[.!?]+)?$",
            string.Empty,
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant
        );
        normalized = Regex.Replace(
            normalized,
            @"\s+정리해줘(?:[.!?]+)?$",
            " 정리",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant
        );
        normalized = Regex.Replace(
            normalized,
            @"\s+요약해줘(?:[.!?]+)?$",
            " 요약",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant
        );
        normalized = Regex.Replace(
            normalized,
            @"\s+브리핑해줘(?:[.!?]+)?$",
            " 브리핑",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant
        );
        normalized = Regex.Replace(normalized, @"^\s*[-,:;·/]+\s*", string.Empty, RegexOptions.CultureInvariant).Trim();
        normalized = Regex.Replace(normalized, @"\s{2,}", " ", RegexOptions.CultureInvariant).Trim();
        return normalized;
    }

    private static string StripLeadingRoutineScheduleDirective(string text)
    {
        var normalized = (text ?? string.Empty).Trim();
        if (normalized.Length == 0)
        {
            return string.Empty;
        }

        var options = RegexOptions.IgnoreCase | RegexOptions.CultureInvariant;
        normalized = Regex.Replace(normalized, @"^(?:매일|매주|매월)\s+", string.Empty, options);
        normalized = Regex.Replace(normalized, @"^(?:매주\s*)?(?:월|화|수|목|금|토|일)(?:요일)?(?:\s*(?:,|/|·|및)\s*(?:월|화|수|목|금|토|일)(?:요일)?)*(?:마다)?\s+", string.Empty, options);
        normalized = Regex.Replace(normalized, @"^(?:월|화|수|목|금|토|일)(?:요일)?(?:마다)?\s+", string.Empty, options);
        normalized = Regex.Replace(normalized, @"^매월\s*\d{1,2}\s*일(?:마다)?\s+", string.Empty, options);
        normalized = Regex.Replace(normalized, @"^(?:아침|오전|오후|저녁|밤|새벽)?\s*\d{1,2}(?::\d{2})?\s*(?:시(?:\s*\d{1,2}\s*분)?|분)?(?:\s*반)?(?:에|마다)?\s+", string.Empty, options);
        normalized = Regex.Replace(normalized, @"^(?:마다|에)\s+", string.Empty, options);
        return normalized.Trim();
    }

    internal static string? NormalizeCronRunStatus(string? status)
    {
        var normalized = (status ?? string.Empty).Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return null;
        }

        if (normalized.Contains("error", StringComparison.Ordinal)
            || normalized.Contains("fail", StringComparison.Ordinal))
        {
            return "error";
        }

        if (normalized.Contains("skip", StringComparison.Ordinal))
        {
            return "skipped";
        }

        if (normalized is "ok" or "success" or "completed")
        {
            return "ok";
        }

        return null;
    }

    internal static string? TrimForCronError(string? text)
    {
        var normalized = (text ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return null;
        }

        const int maxChars = 400;
        if (normalized.Length <= maxChars)
        {
            return normalized;
        }

        return normalized[..maxChars] + "...";
    }
}
