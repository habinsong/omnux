namespace Omnux.Middleware;

public sealed class AgentSpawnActiveRunEntry
{
    public string Id { get; set; } = string.Empty;
    public string RunId { get; set; } = string.Empty;
    public string ChildSessionKey { get; set; } = string.Empty;
    public string Runtime { get; set; } = "subagent";
    public string Mode { get; set; } = "run";
    public string Backend { get; set; } = "unknown";
    public string? BackendSessionId { get; set; }
    public int RunTimeoutSeconds { get; set; }
    public DateTimeOffset StartedUtc { get; set; }
    public DateTimeOffset LastHeartbeatUtc { get; set; }
    public DateTimeOffset? CompletedUtc { get; set; }
    public string State { get; set; } = "active";
    public string? LastError { get; set; }
    public string? WorkspaceRollbackId { get; set; }
    public string? WorkspaceRollbackPath { get; set; }
    public int WorkspaceRollbackChangedFiles { get; set; }
    public bool WorkspaceRollbackPartial { get; set; }
}

public sealed record AgentSpawnActiveSnapshot(
    int ActiveCount,
    string? OldestRunId,
    string? OldestRuntime,
    string? OldestMode,
    string? OldestBackend,
    DateTimeOffset? OldestStartedUtc,
    int? OldestAgeSeconds,
    int CompletedHistoryCount
);

public sealed record AgentSpawnWatchdogEvent(
    string RunId,
    string ChildSessionKey,
    string Runtime,
    string Mode,
    string Backend,
    string PreviousState,
    string State,
    string Reason,
    string Message,
    DateTimeOffset StartedUtc,
    DateTimeOffset CompletedUtc,
    int AgeSeconds,
    int HeartbeatAgeSeconds
);

public sealed record AgentSpawnWatchdogSnapshot(
    int ActiveCount,
    int TimedOutCount,
    int StaleCount,
    int EventCount,
    DateTimeOffset CheckedUtc,
    IReadOnlyList<AgentSpawnWatchdogEvent> Events
);

public sealed record AgentSpawnBlockedActiveRun(
    string RunId,
    string ChildSessionKey,
    string Runtime,
    string Mode,
    string Backend,
    string Reason,
    string Message,
    string? WorkspaceRollbackId = null,
    string? WorkspaceRollbackPath = null,
    int WorkspaceRollbackChangedFiles = 0,
    bool WorkspaceRollbackPartial = false
);

internal sealed class AgentSpawnActiveRunState
{
    public List<AgentSpawnActiveRunEntry> Runs { get; set; } = new();
}
