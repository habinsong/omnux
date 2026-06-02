using System.Text.RegularExpressions;

namespace Omnux.Middleware;

public sealed partial class RoutineApplicationService
{
    private const int TelegramMaxResponseChars = 60000;
    private const string LogicGraphExecutionMode = "logic_graph";

    private static string ResolveRoutineExecutionRequestText(string? request, string? title, string? scheduleSourceMode)
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

    private static string NormalizeRoutineScheduleSourceMode(string? mode, string? request)
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

    private static string NormalizeCronScheduleKind(string? kind)
    {
        var normalized = (kind ?? string.Empty).Trim().ToLowerInvariant();
        return normalized switch
        {
            "at" => "at",
            "every" => "every",
            _ => "cron"
        };
    }

    private static DateTimeOffset ComputeNextCronBridgeRunUtc(RoutineDefinition routine, DateTimeOffset nowUtc)
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

    private static string NormalizeCronPayloadKindOrDefault(string? payloadKindRaw)
    {
        return TryParseCronPayloadKind(payloadKindRaw, allowEmpty: true, out var normalized)
            ? normalized
            : "systemEvent";
    }

    private static string NormalizeCronSessionTargetOrDefault(string? sessionTargetRaw)
    {
        return TryParseCronSessionTarget(sessionTargetRaw, allowEmpty: true, out var normalized)
            ? normalized
            : "main";
    }

    private static string? NormalizeOptionalCronPayloadString(string? value)
    {
        var normalized = (value ?? string.Empty).Trim();
        return normalized.Length == 0 ? null : normalized;
    }

    private static string? NormalizeCronRunStatus(string? status)
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

    private static string? TrimForCronError(string? text)
    {
        var normalized = (text ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return null;
        }

        const int maxChars = 400;
        return normalized.Length <= maxChars ? normalized : normalized[..maxChars] + "...";
    }

    private IReadOnlyList<string> ResolveWebUrls(string input, IReadOnlyList<string>? requestUrls, bool webSearchEnabled)
    {
        var set = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        if (requestUrls != null)
        {
            foreach (var raw in requestUrls)
            {
                var normalized = NormalizeWebUrl(raw);
                if (!string.IsNullOrWhiteSpace(normalized))
                {
                    set.Add(normalized);
                }
            }
        }

        foreach (Match match in Regex.Matches(input ?? string.Empty, "https?://[^\\s<>()\\\"'`]+", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant))
        {
            var normalized = NormalizeWebUrl(match.Value);
            if (!string.IsNullOrWhiteSpace(normalized))
            {
                set.Add(normalized);
            }
        }

        return set.Take(3).ToArray();
    }

    private static string NormalizeWebUrl(string? raw)
    {
        var value = (raw ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri))
        {
            return string.Empty;
        }

        if (!uri.Scheme.Equals("http", StringComparison.OrdinalIgnoreCase)
            && !uri.Scheme.Equals("https", StringComparison.OrdinalIgnoreCase))
        {
            return string.Empty;
        }

        return uri.AbsoluteUri;
    }

    private static bool IsGroundedWebAnswerFailureText(string text)
    {
        var normalized = (text ?? string.Empty).Trim();
        if (normalized.Length == 0)
        {
            return true;
        }

        return SearchPromptPolicy.IsGeminiWebFailureText(normalized)
            || normalized.StartsWith("요청하신 최신 정보를 생성하지 못했습니다.", StringComparison.Ordinal)
            || normalized.StartsWith("요청하신 목록을 생성하지 못했습니다.", StringComparison.Ordinal)
            || normalized.StartsWith("검색 실패:", StringComparison.Ordinal);
    }

    private static bool ContainsHttpUrl(string? input)
    {
        return Regex.IsMatch(input ?? string.Empty, "https?://[^\\s<>()\\\"'`]+", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
    }

    private static bool IsLogicGraphRoutine(RoutineDefinition routine)
    {
        return string.Equals(
                   NormalizeRoutineExecutionMode(routine.ExecutionMode),
                   LogicGraphExecutionMode,
                   StringComparison.Ordinal
               )
               && routine.LogicGraph != null;
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

    private static bool ContainsAny(string text, params string[] patterns)
    {
        if (string.IsNullOrEmpty(text))
        {
            return false;
        }

        foreach (var pattern in patterns)
        {
            if (!string.IsNullOrEmpty(pattern) && text.Contains(pattern, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        return false;
    }

    private bool IsGroqRateLimitImminent(string model, int expectedOutputTokens)
    {
        var rates = _llmRouter.GetGroqRateLimitSnapshot();
        if (!rates.TryGetValue(model, out var rate))
        {
            return false;
        }

        if (rate.CooldownUntilUtc.HasValue && rate.CooldownUntilUtc.Value > DateTimeOffset.UtcNow)
        {
            return true;
        }

        if (rate.RemainingRequests.HasValue && rate.RemainingRequests.Value <= 1)
        {
            return true;
        }

        if (rate.RemainingTokens.HasValue)
        {
            var safeReserve = Math.Max(1200, expectedOutputTokens + 500);
            if (rate.RemainingTokens.Value <= safeReserve)
            {
                return true;
            }
        }

        return false;
    }

    private string ResolveSearchLlmModel()
    {
        var configured = NormalizeModelSelection(_providers.GeminiSearchModel);
        if (!string.IsNullOrWhiteSpace(configured))
        {
            return configured!;
        }

        return _providers.GeminiModel;
    }

    private string ResolveUrlContextLlmModel()
    {
        var configured = NormalizeModelSelection(_providers.GeminiFlashModel);
        if (!string.IsNullOrWhiteSpace(configured))
        {
            return configured!;
        }

        return _providers.GeminiModel;
    }

    private static string? NormalizeModelSelection(string? model)
    {
        if (string.IsNullOrWhiteSpace(model))
        {
            return null;
        }

        var trimmed = model.Trim();
        if (trimmed.Equals(LegacyCerebrasLlamaModel, StringComparison.OrdinalIgnoreCase))
        {
            return DefaultCerebrasModel;
        }

        return string.Equals(trimmed, "none", StringComparison.OrdinalIgnoreCase) ? null : trimmed;
    }

    private bool IsDynamicCodeExecutionEnabled()
    {
        return _security.EnableDynamicCode;
    }

    private static string BuildDynamicCodeDisabledMessage()
    {
        return "dynamic code is disabled. set OMNUX_ENABLE_DYNAMIC_CODE=true";
    }

    private static string FormatTelegramResponse(string text, int maxChars)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return "응답이 비어 있습니다.";
        }

        const bool keepMarkdownTables = true;
        var sanitized = ChatOutputSanitizerPolicy.Sanitize(text, keepMarkdownTables: keepMarkdownTables);
        return TelegramResponseFormatterPolicy.FormatSanitizedResponse(
            sanitized,
            maxChars,
            ChatOutputSanitizerPolicy.NormalizeStructuredLabelBlocks,
            ChatOutputSanitizerPolicy.IsStandaloneNumberedHeadlineLine,
            ChatOutputSanitizerPolicy.IsMarkdownTableRow
        );
    }

    private string ResolveWorkspaceRoot()
    {
        return string.IsNullOrWhiteSpace(_paths.WorkspaceRootDir)
            ? Path.Combine(AppContext.BaseDirectory, "workspace")
            : Path.GetFullPath(_paths.WorkspaceRootDir);
    }

    private Task<LogicRunSnapshot> ExecuteLogicGraphRunCoreAsync(
        string graphId,
        string runId,
        string source,
        string runInput,
        Action<LogicRunEvent>? eventCallback,
        CancellationToken cancellationToken
    )
    {
        return _logicGraphRunner.ExecuteLogicGraphRunCoreAsync(
            graphId,
            runId,
            source,
            runInput,
            eventCallback,
            cancellationToken
        );
    }
}
