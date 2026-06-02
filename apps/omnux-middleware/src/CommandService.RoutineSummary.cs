namespace Omnux.Middleware;

public sealed partial class CommandService
{
    private static RoutineSummary ToRoutineSummary(RoutineDefinition routine)
    {
        var localNext = routine.NextRunUtc.ToLocalTime().ToString("yyyy-MM-dd HH:mm:ss");
        var localLast = routine.LastRunUtc?.ToLocalTime().ToString("yyyy-MM-dd HH:mm:ss") ?? "-";
        var scheduleSourceMode = NormalizeRoutineScheduleSourceMode(routine.ScheduleSourceMode, routine.Request);
        var executionRequest = ResolveRoutineExecutionRequestText(routine.Request, routine.Title, routine.ScheduleSourceMode);
        var explicitExecutionMode = NormalizeRoutineExecutionMode(routine.ExecutionMode);
        var resolvedExecutionMode = ResolveRoutineExecutionMode(executionRequest, explicitExecutionMode);
        var scheduleKind = "daily";
        var timeOfDay = $"{routine.Hour:D2}:{routine.Minute:D2}";
        int? dayOfMonth = null;
        var weekdays = Array.Empty<int>();
        if (RoutineSchedulePolicy.TryParseSupportedCronExpression(
                routine.CronScheduleExpr,
                out var parsedKind,
                out var parsedHour,
                out var parsedMinute,
                out var parsedDayOfMonth,
                out var parsedWeekdays,
                out _,
                out _
            ))
        {
            scheduleKind = parsedKind;
            timeOfDay = $"{parsedHour:D2}:{parsedMinute:D2}";
            dayOfMonth = parsedDayOfMonth;
            weekdays = parsedWeekdays;
        }

        return new RoutineSummary(
            routine.Id,
            routine.Title,
            routine.Request,
            explicitExecutionMode,
            resolvedExecutionMode,
            resolvedExecutionMode == "browser_agent" ? NormalizeRoutineAgentProvider(routine.AgentProvider, routine.AgentModel) : null,
            resolvedExecutionMode == "browser_agent" ? NormalizeRoutineAgentModel(routine.AgentModel) : null,
            resolvedExecutionMode == "browser_agent" ? NormalizeOptionalAgentMetaValue(routine.AgentStartUrl) : null,
            resolvedExecutionMode == "browser_agent" ? NormalizeRoutineAgentTimeoutSeconds(routine.AgentTimeoutSeconds) : null,
            resolvedExecutionMode == "browser_agent" ? NormalizeRoutineAgentToolProfile(routine.AgentToolProfile, routine.AgentUsePlaywright) : null,
            resolvedExecutionMode == "browser_agent" && NormalizeRoutineAgentUsePlaywright(routine.AgentUsePlaywright),
            routine.ScheduleText,
            scheduleSourceMode,
            RoutineSchedulePolicy.NormalizeRetryCount(routine.MaxRetries),
            RoutineSchedulePolicy.NormalizeRetryDelaySeconds(routine.RetryDelaySeconds),
            RoutineSchedulePolicy.NormalizeNotifyPolicy(routine.NotifyPolicy),
            routine.NotifyTelegram,
            routine.Enabled,
            localNext,
            localLast,
            routine.LastStatus,
            routine.LastOutput,
            routine.ScriptPath,
            routine.Language,
            routine.CoderModel,
            scheduleKind,
            routine.CronScheduleExpr,
            routine.TimezoneId,
            timeOfDay,
            dayOfMonth,
            weekdays,
            string.IsNullOrWhiteSpace(routine.QualityStatus) ? "unknown" : routine.QualityStatus,
            routine.QualityWarnings ?? new List<string>(),
            BuildRoutineRunCommand(routine),
            BuildRoutineRunSummaries(routine)
        );
    }

    private static string BuildRoutineRunCommand(RoutineDefinition routine)
    {
        var resolvedMode = ResolveRoutineExecutionMode(
            ResolveRoutineExecutionRequestText(routine.Request, routine.Title, routine.ScheduleSourceMode),
            routine.ExecutionMode
        );
        if (resolvedMode == "browser_agent")
        {
            return "브라우저 에이전트 테스트 버튼으로 실행";
        }

        if (resolvedMode == "web" || resolvedMode == "url")
        {
            return "웹 테스트 버튼으로 실행";
        }

        if (ShouldRunCronAgentTurnBridge(routine))
        {
            return "cron agentTurn bridge";
        }

        if (string.IsNullOrWhiteSpace(routine.ScriptPath))
        {
            return "실행 파일 없음";
        }

        var quoted = routine.ScriptPath.Contains(' ')
            ? $"\"{routine.ScriptPath}\""
            : routine.ScriptPath;
        return NormalizeRoutineScriptLanguage(routine.Language) == "python"
            ? $"python3 {quoted}"
            : $"bash {quoted}";
    }

    private static bool TryResolveRoutineScheduleConfig(
        string request,
        string scheduleSourceMode,
        string? scheduleKind,
        string? scheduleTime,
        IReadOnlyList<int>? weekdays,
        int? dayOfMonth,
        string? timezoneId,
        out RoutineScheduleConfig config,
        out string error
    )
    {
        if (string.Equals(scheduleSourceMode, "manual", StringComparison.Ordinal))
        {
            return RoutineSchedulePolicy.TryBuildConfig(
                scheduleKind,
                scheduleTime,
                weekdays,
                dayOfMonth,
                timezoneId,
                out config,
                out error
            );
        }

        config = RoutineSchedulePolicy.ResolveConfigFromRequest(request, timezoneId);
        error = string.Empty;
        return true;
    }

    private static bool RoutineMatchesSchedule(RoutineDefinition routine, RoutineScheduleConfig config)
    {
        return string.Equals(routine.ScheduleText, config.Display, StringComparison.Ordinal)
            && string.Equals(routine.TimezoneId, config.TimezoneId, StringComparison.Ordinal)
            && routine.Hour == config.Hour
            && routine.Minute == config.Minute
            && string.Equals(routine.CronScheduleExpr ?? string.Empty, config.CronExpr, StringComparison.Ordinal)
            && string.Equals(NormalizeCronScheduleKind(routine.CronScheduleKind), "cron", StringComparison.Ordinal);
    }

    private static IReadOnlyList<RoutineRunSummary> BuildRoutineRunSummaries(RoutineDefinition routine)
    {
        return (routine.CronRunLog ?? new List<RoutineRunLogEntry>())
            .OrderByDescending(static entry => entry.Ts)
            .Take(20)
            .Select(entry => new RoutineRunSummary(
                entry.Ts,
                entry.RunAtMs.HasValue
                    ? DateTimeOffset.FromUnixTimeMilliseconds(entry.RunAtMs.Value).ToLocalTime().ToString("yyyy-MM-dd HH:mm:ss")
                    : "-",
                string.IsNullOrWhiteSpace(entry.Status) ? "-" : entry.Status!,
                string.IsNullOrWhiteSpace(entry.Source) ? (entry.Action ?? "-") : entry.Source!,
                Math.Max(1, entry.AttemptCount),
                entry.Summary ?? string.Empty,
                string.IsNullOrWhiteSpace(entry.Error) ? null : entry.Error,
                string.IsNullOrWhiteSpace(entry.TelegramStatus) ? null : entry.TelegramStatus,
                string.IsNullOrWhiteSpace(entry.ArtifactPath) ? null : entry.ArtifactPath,
                string.IsNullOrWhiteSpace(entry.AgentSessionId) ? null : entry.AgentSessionId,
                string.IsNullOrWhiteSpace(entry.AgentRunId) ? null : entry.AgentRunId,
                string.IsNullOrWhiteSpace(entry.AgentProvider) ? null : entry.AgentProvider,
                string.IsNullOrWhiteSpace(entry.AgentModel) ? null : entry.AgentModel,
                string.IsNullOrWhiteSpace(entry.ToolProfile) ? null : entry.ToolProfile,
                string.IsNullOrWhiteSpace(entry.StartUrl) ? null : entry.StartUrl,
                string.IsNullOrWhiteSpace(entry.FinalUrl) ? null : entry.FinalUrl,
                string.IsNullOrWhiteSpace(entry.PageTitle) ? null : entry.PageTitle,
                string.IsNullOrWhiteSpace(entry.ScreenshotPath) ? null : entry.ScreenshotPath,
                (entry.DownloadPaths ?? new List<string>())
                    .Where(static path => !string.IsNullOrWhiteSpace(path))
                    .ToArray(),
                entry.DurationMs,
                FormatRoutineDuration(entry.DurationMs),
                entry.NextRunAtMs.HasValue
                    ? DateTimeOffset.FromUnixTimeMilliseconds(entry.NextRunAtMs.Value).ToLocalTime().ToString("yyyy-MM-dd HH:mm:ss")
                    : null
            ))
            .ToArray();
    }

    private static string FormatRoutineDuration(long? durationMs)
    {
        if (!durationMs.HasValue || durationMs.Value < 0)
        {
            return "-";
        }

        if (durationMs.Value < 1000)
        {
            return $"{durationMs.Value}ms";
        }

        var seconds = durationMs.Value / 1000d;
        if (seconds < 60d)
        {
            return $"{seconds:0.0}s";
        }

        var minutes = seconds / 60d;
        return $"{minutes:0.0}m";
    }

    private static string BuildRoutineTitle(string request)
    {
        var text = (request ?? string.Empty)
            .Replace("\r", " ", StringComparison.Ordinal)
            .Replace("\n", " ", StringComparison.Ordinal)
            .Trim();
        if (string.IsNullOrWhiteSpace(text))
        {
            return "새 루틴";
        }

        var title = text.Length <= 26 ? text : text[..26].TrimEnd() + "...";
        return title;
    }

    private static DateTimeOffset ComputeNextDailyRunUtc(int hour, int minute, string timezoneId, DateTimeOffset nowUtc)
    {
        var tz = RoutineSchedulePolicy.ResolveTimeZone(timezoneId);
        var nowLocal = TimeZoneInfo.ConvertTime(nowUtc, tz);
        var nextLocal = new DateTime(nowLocal.Year, nowLocal.Month, nowLocal.Day, hour, minute, 0, DateTimeKind.Unspecified);
        if (nextLocal <= nowLocal.DateTime)
        {
            nextLocal = nextLocal.AddDays(1);
        }

        var offset = tz.GetUtcOffset(nextLocal);
        return new DateTimeOffset(nextLocal, offset).ToUniversalTime();
    }
}
