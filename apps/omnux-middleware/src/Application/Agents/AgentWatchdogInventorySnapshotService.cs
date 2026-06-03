namespace Omnux.Middleware;

internal sealed class AgentWatchdogInventorySnapshotService
{
    private const int DefaultLimit = 100;
    private const int MaxLimit = 300;

    private static readonly string[] SkippedActions =
    {
        "watchdog_evaluate_and_close",
        "process_kill",
        "automatic_restart",
        "rollback_execution"
    };

    private readonly FileAgentSpawnActiveRunStore _activeRunStore;
    private readonly Func<DateTimeOffset> _utcNow;

    public AgentWatchdogInventorySnapshotService(
        FileAgentSpawnActiveRunStore activeRunStore,
        Func<DateTimeOffset>? utcNow = null
    )
    {
        _activeRunStore = activeRunStore;
        _utcNow = utcNow ?? (() => DateTimeOffset.UtcNow);
    }

    public AgentWatchdogInventorySnapshot GetSnapshot(int? requestedLimit)
    {
        var nowUtc = _utcNow();
        var limit = Math.Clamp(requestedLimit ?? DefaultLimit, 1, MaxLimit);
        var allRuns = _activeRunStore.ReadEntriesSnapshot()
            .Select(entry => BuildItem(entry, nowUtc))
            .ToArray();
        var visibleRuns = allRuns.Take(limit).ToArray();
        var activeCount = allRuns.Count(item => item.Active);
        var terminalHistoryCount = allRuns.Length - activeCount;
        var attentionCount = allRuns.Count(item => item.Active && item.Health is "timeout_due" or "heartbeat_stale");

        return new AgentWatchdogInventorySnapshot(
            ResolveStatus(activeCount, attentionCount),
            true,
            activeCount,
            terminalHistoryCount,
            limit,
            allRuns.Length > visibleRuns.Length,
            visibleRuns,
            BuildChecks(activeCount, attentionCount),
            SkippedActions,
            nowUtc
        );
    }

    private static AgentWatchdogRunItem BuildItem(AgentSpawnActiveRunEntry entry, DateTimeOffset nowUtc)
    {
        var startedUtc = entry.StartedUtc == default ? nowUtc : entry.StartedUtc;
        var heartbeatUtc = entry.LastHeartbeatUtc == default ? startedUtc : entry.LastHeartbeatUtc;
        var ageSeconds = Math.Max(0, (int)(nowUtc - startedUtc).TotalSeconds);
        var heartbeatAgeSeconds = Math.Max(0, (int)(nowUtc - heartbeatUtc).TotalSeconds);
        var staleSeconds = (int)FileAgentSpawnActiveRunStore.WatchdogHeartbeatStaleWindow.TotalSeconds;
        var staleInSeconds = Math.Max(0, staleSeconds - heartbeatAgeSeconds);
        var timeoutInSeconds = entry.RunTimeoutSeconds > 0
            ? Math.Max(0, entry.RunTimeoutSeconds - ageSeconds)
            : (int?)null;
        var active = IsActive(entry);

        return new AgentWatchdogRunItem(
            entry.Id,
            entry.RunId,
            entry.ChildSessionKey,
            entry.Runtime,
            entry.Mode,
            entry.Backend,
            entry.State,
            active,
            ResolveHealth(entry, active, ageSeconds, heartbeatAgeSeconds),
            startedUtc,
            heartbeatUtc,
            entry.CompletedUtc,
            ageSeconds,
            heartbeatAgeSeconds,
            entry.RunTimeoutSeconds,
            timeoutInSeconds,
            staleInSeconds,
            entry.RunTimeoutSeconds > 0 ? startedUtc.AddSeconds(entry.RunTimeoutSeconds) : null,
            heartbeatUtc.Add(FileAgentSpawnActiveRunStore.WatchdogHeartbeatStaleWindow),
            entry.LastError,
            entry.WorkspaceRollbackId,
            entry.WorkspaceRollbackPath,
            entry.WorkspaceRollbackChangedFiles,
            entry.WorkspaceRollbackPartial
        );
    }

    private static IReadOnlyList<AgentWatchdogInventoryCheck> BuildChecks(int activeCount, int attentionCount)
    {
        return new[]
        {
            new AgentWatchdogInventoryCheck(
                "active_runs",
                activeCount > 0 ? "monitoring" : "idle",
                activeCount > 0
                    ? $"{activeCount} active run(s) are being monitored"
                    : "no active agent runs"
            ),
            new AgentWatchdogInventoryCheck(
                "attention_required",
                attentionCount > 0 ? "warning" : "ok",
                attentionCount > 0
                    ? $"{attentionCount} active run(s) are past timeout or heartbeat windows"
                    : "no active run is past watchdog thresholds"
            ),
            new AgentWatchdogInventoryCheck(
                "read_only",
                "ok",
                "snapshot does not evaluate watchdog, close runs, kill processes, restart agents, or execute rollback"
            )
        };
    }

    private static string ResolveStatus(int activeCount, int attentionCount)
    {
        if (attentionCount > 0)
        {
            return "attention_required";
        }

        return activeCount > 0 ? "monitoring" : "idle";
    }

    private static string ResolveHealth(
        AgentSpawnActiveRunEntry entry,
        bool active,
        int ageSeconds,
        int heartbeatAgeSeconds
    )
    {
        if (!active)
        {
            return NormalizeToken(entry.State, "terminal");
        }

        if (entry.RunTimeoutSeconds > 0 && ageSeconds > entry.RunTimeoutSeconds)
        {
            return "timeout_due";
        }

        if (heartbeatAgeSeconds > (int)FileAgentSpawnActiveRunStore.WatchdogHeartbeatStaleWindow.TotalSeconds)
        {
            return "heartbeat_stale";
        }

        return entry.RunTimeoutSeconds > 0 ? "ok" : "no_run_timeout";
    }

    private static bool IsActive(AgentSpawnActiveRunEntry entry)
    {
        return !entry.CompletedUtc.HasValue
            && !entry.State.Equals("completed", StringComparison.OrdinalIgnoreCase)
            && !entry.State.Equals("failed", StringComparison.OrdinalIgnoreCase)
            && !entry.State.Equals("timeout", StringComparison.OrdinalIgnoreCase)
            && !entry.State.Equals("stale", StringComparison.OrdinalIgnoreCase)
            && !entry.State.Equals("blocked_by_breaker", StringComparison.OrdinalIgnoreCase);
    }

    private static string NormalizeToken(string? value, string fallback)
    {
        var normalized = (value ?? string.Empty).Trim();
        return string.IsNullOrWhiteSpace(normalized) ? fallback : normalized;
    }
}
