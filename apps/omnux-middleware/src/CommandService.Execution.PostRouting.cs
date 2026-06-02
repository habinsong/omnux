namespace Omnux.Middleware;

public sealed partial class CommandService
{
    private async Task<string> ExecutePostUnifiedRoutingAsync(
        string source,
        string text,
        IReadOnlyList<InputAttachment>? attachments,
        IReadOnlyList<string>? webUrls,
        bool webSearchEnabled,
        Action<string>? streamCallback,
        CancellationToken cancellationToken
    )
    {
        var naturalResult = await TryHandleNonSlashNaturalRoutingAsync(
            source,
            text,
            attachments,
            webUrls,
            webSearchEnabled,
            cancellationToken
        );
        if (naturalResult != null)
        {
            return naturalResult;
        }

        var routineCommandResult = await TryHandleRoutineCommandAsync(text, source, cancellationToken);
        if (routineCommandResult != null)
        {
            return routineCommandResult;
        }

        var localSystemResult = await TryHandleLocalSystemCommandAsync(text, source, cancellationToken);
        if (localSystemResult != null)
        {
            return localSystemResult;
        }

        var telegramChatResult = await TryHandleTelegramChatFallbackAsync(
            source,
            text,
            attachments,
            webUrls,
            webSearchEnabled,
            streamCallback,
            cancellationToken
        );
        if (telegramChatResult != null)
        {
            return telegramChatResult;
        }

        return await ExecuteClassifiedIntentFallbackAsync(source, text, cancellationToken);
    }

    private async Task<string?> TryHandleNonSlashNaturalRoutingAsync(
        string source,
        string text,
        IReadOnlyList<InputAttachment>? attachments,
        IReadOnlyList<string>? webUrls,
        bool webSearchEnabled,
        CancellationToken cancellationToken
    )
    {
        if (text.StartsWith("/", StringComparison.Ordinal))
        {
            return null;
        }

        if (source.Equals("telegram", StringComparison.OrdinalIgnoreCase))
        {
            var skillNaturalResult = await TryHandleTelegramNaturalSkillCommandAsync(text, cancellationToken);
            if (skillNaturalResult != null)
            {
                return skillNaturalResult;
            }
        }

        var naturalByLlmResult = await TryHandleNaturalCommandByLlmAsync(
            source,
            text,
            attachments,
            webUrls,
            webSearchEnabled,
            cancellationToken
        );
        if (naturalByLlmResult != null)
        {
            return naturalByLlmResult;
        }

        if (!source.Equals("telegram", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        return await TryHandleTelegramNaturalControlCommandAsync(
            text,
            attachments,
            webUrls,
            webSearchEnabled,
            cancellationToken
        );
    }

    private async Task<string?> TryHandleLocalSystemCommandAsync(
        string text,
        string source,
        CancellationToken cancellationToken
    )
    {
        if (text.Equals("/metrics", StringComparison.OrdinalIgnoreCase))
        {
            var metrics = await _coreClient.GetMetricsAsync(cancellationToken);
            RecordEvent($"{source}:core:{metrics}");
            _auditLogger.Log(source, "metrics", "ok", metrics);
            return metrics;
        }

        if (!KillCommandPolicy.TryParse(text, out var pid))
        {
            return null;
        }

        var guard = await ValidateKillTargetAsync(pid, source, cancellationToken);
        if (!guard.Allowed)
        {
            _auditLogger.Log(source, "kill", "deny", $"pid={pid} reason={guard.Reason}");
            return $"kill denied: {guard.Reason}";
        }

        var result = await _coreClient.KillAsync(pid, cancellationToken);
        RecordEvent($"{source}:core:{result}");
        _auditLogger.Log(source, "kill", "ok", $"pid={pid}");
        return result;
    }

    private async Task<string?> TryHandleTelegramChatFallbackAsync(
        string source,
        string text,
        IReadOnlyList<InputAttachment>? attachments,
        IReadOnlyList<string>? webUrls,
        bool webSearchEnabled,
        Action<string>? streamCallback,
        CancellationToken cancellationToken
    )
    {
        if (!source.Equals("telegram", StringComparison.OrdinalIgnoreCase)
            || text.StartsWith("/", StringComparison.Ordinal))
        {
            return null;
        }

        var naturalRoutineResult = await TryHandleNaturalRoutineRequestAsync(text, source, cancellationToken);
        if (naturalRoutineResult != null)
        {
            return naturalRoutineResult;
        }

        var routed = await ExecuteTelegramLlmMessageAsync(
            text,
            attachments,
            webUrls,
            webSearchEnabled,
            streamCallback,
            cancellationToken
        );
        _auditLogger.Log(source, "telegram_llm_route", "ok", "mode_routed");
        return routed;
    }

    private async Task<string> ExecuteClassifiedIntentFallbackAsync(
        string source,
        string text,
        CancellationToken cancellationToken
    )
    {
        var intent = await _llmRouter.ClassifyIntentAsync(text, cancellationToken);
        _auditLogger.Log(source, "intent_classified", "ok", intent.ToString());

        if (intent == RouterIntent.DynamicCode)
        {
            return await ExecuteDynamicCodeIntentAsync(source, text, cancellationToken);
        }

        if (intent == RouterIntent.QuerySystem)
        {
            var metrics = await _coreClient.GetMetricsAsync(cancellationToken);
            RecordEvent($"{source}:core:{metrics}");
            _auditLogger.Log(source, "query_system", "ok", metrics);
            return metrics;
        }

        if (intent == RouterIntent.OsControl)
        {
            _auditLogger.Log(source, "os_control", "deny", text);
            return "os control intent detected. use explicit allowlisted command (/kill <pid>) only.";
        }

        _auditLogger.Log(source, "unknown", "ok", intent.ToString());
        if (source.Equals("telegram", StringComparison.OrdinalIgnoreCase))
        {
            var fallback = await ChatFallbackForUnknownAsync(BuildTelegramConcisePrompt(text), cancellationToken);
            _auditLogger.Log(source, "telegram_unknown_fallback", "ok", "llm_chat");
            return FormatTelegramResponse(fallback, TelegramMaxResponseChars);
        }

        return $"intent={intent}";
    }

    private async Task<string> ExecuteDynamicCodeIntentAsync(
        string source,
        string text,
        CancellationToken cancellationToken
    )
    {
        if (!IsDynamicCodeExecutionEnabled())
        {
            return BuildDynamicCodeDisabledMessage();
        }

        var copilotStatus = await _copilotWrapper.GetStatusAsync(cancellationToken);
        if (!copilotStatus.Installed)
        {
            return "copilot cli not installed";
        }

        if (!copilotStatus.Authenticated)
        {
            return "copilot cli is not authenticated. run `gh auth login` and copilot sign-in first.";
        }

        var metrics = await _coreClient.GetMetricsAsync(cancellationToken);
        RecordEvent($"{source}:core:{metrics}");
        var context = BuildContextSnapshot(metrics);
        var plan = await _llmRouter.BuildExecutionPlanAsync(text, context, cancellationToken);
        RecordEvent($"{source}:plan:{plan}");
        var code = await _copilotWrapper.SuggestCodeAsync(plan, cancellationToken);
        if (string.IsNullOrWhiteSpace(code))
        {
            _auditLogger.Log(source, "dynamic_code", "fail", "empty code");
            return "no code generated from copilot cli";
        }

        var result = await _sandboxClient.ExecuteCodeAsync(code, cancellationToken);
        RecordEvent($"{source}:sandbox:{result}");
        _auditLogger.Log(source, "dynamic_code", "ok", result);
        return TrimForOutput(result);
    }
}
