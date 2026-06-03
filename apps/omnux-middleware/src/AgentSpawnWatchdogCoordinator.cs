namespace Omnux.Middleware;

internal sealed class AgentSpawnWatchdogCoordinator
{
    private readonly FileAgentSpawnActiveRunStore _activeRunStore;
    private readonly ConversationStore _conversationStore;

    public AgentSpawnWatchdogCoordinator(
        FileAgentSpawnActiveRunStore activeRunStore,
        ConversationStore conversationStore
    )
    {
        _activeRunStore = activeRunStore;
        _conversationStore = conversationStore;
    }

    public AgentSpawnWatchdogSnapshot Evaluate(DateTimeOffset nowUtc)
    {
        var snapshot = _activeRunStore.EvaluateWatchdog(nowUtc);
        if (snapshot.EventCount == 0)
        {
            return snapshot;
        }

        Console.Error.WriteLine($"[agent-spawn-watchdog] marked {snapshot.EventCount} active run(s) terminal.");
        foreach (var item in snapshot.Events)
        {
            AppendTranscriptEvent(item);
        }

        return snapshot;
    }

    private void AppendTranscriptEvent(AgentSpawnWatchdogEvent item)
    {
        if (_conversationStore.Get(item.ChildSessionKey) == null)
        {
            Console.Error.WriteLine($"[agent-spawn-watchdog] skipped transcript audit for missing child session: {item.ChildSessionKey}");
            return;
        }

        _ = _conversationStore.AppendMessage(
            item.ChildSessionKey,
            "system",
            $"agent_spawn_watchdog.{item.State} runId={item.RunId} runtime={item.Runtime} mode={item.Mode} backend={item.Backend} previousState={item.PreviousState} reason={item.Reason} ageSeconds={item.AgeSeconds} heartbeatAgeSeconds={item.HeartbeatAgeSeconds} message={NormalizeSingleLine(item.Message) ?? item.State}",
            "sessions_spawn_watchdog"
        );
        _ = _conversationStore.AppendMessage(
            item.ChildSessionKey,
            "assistant",
            BuildClosedReply(item),
            "sessions_spawn_watchdog_closed"
        );
        _ = _conversationStore.UpdateMetadata(
            item.ChildSessionKey,
            project: null,
            category: null,
            tags: new[] { "sessions_spawn", item.Runtime, item.Mode, item.State }
        );
    }

    private static string BuildClosedReply(AgentSpawnWatchdogEvent item)
    {
        var killAction = ResolveKillAction(item.Backend);
        var recoveryAction = item.State == "timeout" || item.State == "stale"
            ? "inspect_child_session_then_restart_if_needed"
            : "manual_check_required";
        return $"sessions_spawn watchdog closed this child session. runId={item.RunId} state={item.State} reason={item.Reason} backend={item.Backend} process_kill={killAction} recovery={recoveryAction} age_seconds={item.AgeSeconds} heartbeat_age_seconds={item.HeartbeatAgeSeconds}. Further sessions_send follow-ups are disabled until an operator starts a new run.";
    }

    private static string ResolveKillAction(string? backend)
    {
        var normalized = (backend ?? string.Empty).Trim().ToLowerInvariant();
        if (normalized.Contains("codex", StringComparison.Ordinal)
            || normalized.Contains("command", StringComparison.Ordinal)
            || normalized.Contains("exec", StringComparison.Ordinal))
        {
            return "handled_by_command_adapter";
        }

        if (normalized is "staged" or "fake" or "subagent" or "acp_dispatch")
        {
            return "not_applicable_no_process";
        }

        return "unknown_manual_check_required";
    }

    private static string? NormalizeSingleLine(string? value)
    {
        var normalized = (value ?? string.Empty)
            .Replace("\r", " ", StringComparison.Ordinal)
            .Replace("\n", " ", StringComparison.Ordinal)
            .Trim();
        return string.IsNullOrWhiteSpace(normalized) ? null : normalized;
    }
}
