namespace Omnux.Middleware;

internal static class SessionReplayEventBuilder
{
    private const int MaxSummaryChars = 240;
    private const int MaxBodyChars = 4_000;
    private const int TelemetryWindowPaddingMinutes = 5;

    public static void AddConversationEvents(
        List<SessionReplayEvent> events,
        ConversationThreadView conversation,
        SessionReplayQuery query
    )
    {
        for (var i = 0; i < conversation.Messages.Count; i++)
        {
            var message = conversation.Messages[i];
            var kind = ResolveConversationKind(message);
            var severity = ResolveConversationSeverity(message);
            var usage = message.TokenUsage == null
                ? null
                : TokenUsageEstimator.Normalize(message.TokenUsage);
            var summary = BuildMessageSummary(message);

            events.Add(new SessionReplayEvent(
                $"conversation_{conversation.Id}_{i}",
                "conversation",
                kind,
                severity,
                "exact",
                conversation.Id,
                string.Empty,
                string.Empty,
                string.Empty,
                BuildConversationTitle(message.Role, kind),
                summary,
                query.IncludeText ? Trim(message.Text, MaxBodyChars) : null,
                EmptyToNull(message.Meta),
                null,
                null,
                null,
                null,
                null,
                usage?.PromptTokens ?? 0,
                usage?.CompletionTokens ?? 0,
                usage?.TotalTokens ?? 0,
                0,
                EnsureUtc(message.CreatedUtc)
            ));
        }
    }

    public static void AddCodingResultEvent(
        List<SessionReplayEvent> events,
        ConversationThreadView conversation,
        SessionReplayQuery query
    )
    {
        var result = conversation.LatestCodingResult;
        if (result == null)
        {
            return;
        }

        var execution = result.Execution;
        var failed = execution.ExitCode != 0
                     || ContainsAny(execution.Status, "error", "failed", "timeout", "오류", "실패");
        var changed = result.ChangedFiles == null || result.ChangedFiles.Count == 0
            ? string.Empty
            : string.Join("\n", result.ChangedFiles.Take(40));

        events.Add(new SessionReplayEvent(
            $"coding_result_{conversation.Id}",
            "coding_result",
            "tool_execution",
            failed ? "error" : "info",
            "conversation_latest_result",
            conversation.Id,
            string.Empty,
            string.Empty,
            string.Empty,
            "coding result",
            Trim(result.Summary, MaxSummaryChars),
            query.IncludeText ? Trim(changed, MaxBodyChars) : null,
            execution.Status,
            EmptyToNull(result.Provider),
            EmptyToNull(result.Model),
            execution.ExitCode == 0 ? "ok" : "failed",
            null,
            null,
            0,
            0,
            0,
            0,
            EnsureUtc(conversation.UpdatedUtc)
        ));
    }

    public static void AddAgentEvents(
        List<SessionReplayEvent> events,
        AgentCommunicationSnapshot snapshot,
        SessionReplayQuery query
    )
    {
        foreach (var message in snapshot.Messages)
        {
            if (!MatchesConversation(query.ConversationId, message.ConversationId))
            {
                continue;
            }

            var severity = ResolveAgentMessageSeverity(message);
            events.Add(new SessionReplayEvent(
                message.Id,
                "agent_message",
                NormalizeKind(message.Kind, "message"),
                severity,
                "agent_bus",
                message.ConversationId,
                message.RunId,
                message.FromAgentId,
                message.GroupId,
                BuildAgentMessageTitle(message),
                Trim(message.Body, MaxSummaryChars),
                query.IncludeText ? Trim(message.Body, MaxBodyChars) : null,
                EmptyToNull(message.CorrelationId),
                null,
                null,
                severity == "error" ? "failed" : "ok",
                null,
                null,
                0,
                0,
                0,
                0,
                EnsureUtc(message.CreatedUtc)
            ));
        }

        foreach (var item in snapshot.Lifecycle)
        {
            if (!MatchesConversation(query.ConversationId, item.ConversationId))
            {
                continue;
            }

            var severity = ResolveStateSeverity(item.State);
            events.Add(new SessionReplayEvent(
                item.Id,
                "agent_lifecycle",
                "lifecycle",
                severity,
                "agent_bus",
                item.ConversationId,
                item.RunId,
                item.AgentId,
                item.GroupId,
                $"agent {item.State}",
                Trim(item.Detail, MaxSummaryChars),
                query.IncludeText ? Trim(item.Detail, MaxBodyChars) : null,
                null,
                null,
                null,
                item.State,
                null,
                null,
                0,
                0,
                0,
                0,
                EnsureUtc(item.CreatedUtc)
            ));
        }

        if (HasValue(query.RunId) || HasValue(query.GroupId) || HasValue(query.AgentId))
        {
            foreach (var entry in snapshot.Board)
            {
                var severity = ResolveStateSeverity(entry.Status);
                events.Add(new SessionReplayEvent(
                    entry.Id,
                    "agent_board",
                    "board",
                    severity,
                    "agent_bus",
                    string.Empty,
                    entry.RunId,
                    entry.AgentId,
                    entry.GroupId,
                    $"board {entry.Key}",
                    Trim(entry.Value, MaxSummaryChars),
                    query.IncludeText ? Trim(entry.Value, MaxBodyChars) : null,
                    entry.Priority,
                    null,
                    null,
                    entry.Status,
                    null,
                    null,
                    0,
                    0,
                    0,
                    0,
                    EnsureUtc(entry.UpdatedUtc)
                ));
            }
        }
    }

    public static DateTimeOffset? ResolveTelemetrySince(
        ConversationThreadView conversation,
        DateTimeOffset? requestedSinceUtc
    )
    {
        var windowStart = EnsureUtc(conversation.CreatedUtc).AddMinutes(-TelemetryWindowPaddingMinutes);
        return requestedSinceUtc.HasValue && requestedSinceUtc.Value > windowStart
            ? requestedSinceUtc
            : windowStart;
    }

    public static void AddTelemetryEvents(
        List<SessionReplayEvent> events,
        IReadOnlyList<TelemetryTraceEvent> telemetryEvents,
        ConversationThreadView conversation
    )
    {
        var windowStart = EnsureUtc(conversation.CreatedUtc).AddMinutes(-TelemetryWindowPaddingMinutes);
        var windowEnd = EnsureUtc(conversation.UpdatedUtc).AddMinutes(TelemetryWindowPaddingMinutes);

        foreach (var item in telemetryEvents)
        {
            var started = EnsureUtc(item.StartedUtc);
            var completed = EnsureUtc(item.CompletedUtc);
            if (completed < windowStart || started > windowEnd)
            {
                continue;
            }

            var severity = ResolveTelemetrySeverity(item.Status);
            events.Add(new SessionReplayEvent(
                item.Id,
                "telemetry",
                item.Operation,
                severity,
                "conversation_window",
                conversation.Id,
                string.Empty,
                string.Empty,
                string.Empty,
                $"{item.Provider}/{item.Model}",
                BuildTelemetrySummary(item),
                string.IsNullOrWhiteSpace(item.Error) ? null : Trim(item.Error, MaxBodyChars),
                item.Source,
                EmptyToNull(item.Provider),
                EmptyToNull(item.Model),
                item.Status,
                EmptyToNull(item.TraceId),
                EmptyToNull(item.SpanId),
                Math.Max(0L, item.PromptTokens),
                Math.Max(0L, item.CompletionTokens),
                Math.Max(0L, item.TotalTokens),
                Math.Max(0L, item.DurationMs),
                completed,
                started,
                completed
            ));
        }
    }

    private static bool MatchesConversation(string? requestedConversationId, string? eventConversationId)
    {
        return !HasValue(requestedConversationId)
               || string.Equals(
                   requestedConversationId,
                   eventConversationId,
                   StringComparison.Ordinal
               );
    }

    private static string ResolveConversationKind(ConversationMessageView message)
    {
        var meta = message.Meta ?? string.Empty;
        var text = message.Text ?? string.Empty;
        if (ContainsAny(meta, "auto-compress"))
        {
            return "context_compression";
        }

        if (ContainsAny(meta, "watchdog", "sessions_spawn_watchdog")
            || ContainsAny(text, "sessions_spawn_watchdog", "watchdog"))
        {
            return "watchdog";
        }

        if (ContainsAny(meta, "agent_spawn_breaker", "breaker.blocked")
            || ContainsAny(text, "agent_spawn_breaker", "breaker.blocked"))
        {
            return "run_breaker";
        }

        return message.Role switch
        {
            "user" => "user_input",
            "system" => "system_event",
            _ => "assistant_response"
        };
    }

    private static string ResolveConversationSeverity(ConversationMessageView message)
    {
        var meta = message.Meta ?? string.Empty;
        var text = message.Text ?? string.Empty;
        if (ContainsAny(meta, "watchdog_closed", "breaker.blocked")
            || ContainsAny(text, "timeout", "timed out", "응답 시간이 초과", "오류", "exception", "failed"))
        {
            return "error";
        }

        if (ContainsAny(meta, "auto-compress", "watchdog", "breaker")
            || ContainsAny(text, "warning", "주의", "stale"))
        {
            return "warning";
        }

        return "info";
    }

    private static string ResolveAgentMessageSeverity(AgentCommunicationMessage message)
    {
        if (ContainsAny(message.Kind, "command", "stop", "cancel")
            || ContainsAny(message.Body, "stop", "cancel", "중단"))
        {
            return "warning";
        }

        return ResolveStateSeverity(message.Kind);
    }

    private static string ResolveStateSeverity(string? state)
    {
        if (ContainsAny(state, "error", "failed", "timeout", "stale", "blocked", "오류", "실패"))
        {
            return "error";
        }

        if (ContainsAny(state, "warning", "retry", "cancel", "stop", "pending", "주의"))
        {
            return "warning";
        }

        return "info";
    }

    private static string ResolveTelemetrySeverity(string? status)
    {
        if (ContainsAny(status, "error", "timeout", "empty", "failed", "exception"))
        {
            return "error";
        }

        return string.Equals(status, "ok", StringComparison.OrdinalIgnoreCase) ? "info" : "warning";
    }

    private static string BuildMessageSummary(ConversationMessageView message)
    {
        var text = Trim(message.Text, MaxSummaryChars);
        return string.IsNullOrWhiteSpace(text) ? $"[{message.Role}] empty message" : text;
    }

    private static string BuildConversationTitle(string role, string kind)
    {
        return kind switch
        {
            "context_compression" => "context compressed",
            "watchdog" => "watchdog event",
            "run_breaker" => "run breaker event",
            _ => $"{role} message"
        };
    }

    private static string BuildAgentMessageTitle(AgentCommunicationMessage message)
    {
        if (!string.IsNullOrWhiteSpace(message.ToAgentId))
        {
            return $"{message.FromAgentId} -> {message.ToAgentId}";
        }

        if (!string.IsNullOrWhiteSpace(message.GroupId))
        {
            return $"{message.FromAgentId} -> group";
        }

        return $"{message.FromAgentId} message";
    }

    private static string BuildTelemetrySummary(TelemetryTraceEvent item)
    {
        return $"{item.Status} {Math.Max(0L, item.TotalTokens)} tokens {Math.Max(0L, item.DurationMs)}ms";
    }

    private static string NormalizeKind(string? value, string fallback)
    {
        var normalized = NormalizeOptionalToken(value);
        return string.IsNullOrWhiteSpace(normalized) ? fallback : normalized.ToLowerInvariant();
    }

    private static string? NormalizeOptionalToken(string? value)
    {
        var normalized = (value ?? string.Empty).Trim();
        if (normalized.Length == 0)
        {
            return null;
        }

        return normalized.Length <= 160 ? normalized : normalized[..160];
    }

    private static string? EmptyToNull(string? value)
    {
        var normalized = (value ?? string.Empty).Trim();
        return normalized.Length == 0 ? null : normalized;
    }

    private static bool HasValue(string? value)
    {
        return !string.IsNullOrWhiteSpace(value);
    }

    private static bool ContainsAny(string? value, params string[] needles)
    {
        var text = value ?? string.Empty;
        return needles.Any(needle => text.Contains(needle, StringComparison.OrdinalIgnoreCase));
    }

    private static string Trim(string? value, int maxChars)
    {
        var normalized = (value ?? string.Empty).Trim();
        if (normalized.Length <= maxChars)
        {
            return normalized;
        }

        return normalized[..maxChars];
    }

    private static DateTimeOffset EnsureUtc(DateTimeOffset value)
    {
        return value == default ? DateTimeOffset.UtcNow : value.ToUniversalTime();
    }
}
