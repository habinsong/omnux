namespace Omnux.Middleware;

internal sealed record AgentWatchdogInventorySnapshot(
    string Status,
    bool ReadOnly,
    int ActiveCount,
    int TerminalHistoryCount,
    int Limit,
    bool RunsTruncated,
    IReadOnlyList<AgentWatchdogRunItem> Runs,
    IReadOnlyList<AgentWatchdogInventoryCheck> Checks,
    IReadOnlyList<string> Skipped,
    DateTimeOffset SnapshotUtc
);

internal sealed record AgentWatchdogRunItem(
    string Id,
    string RunId,
    string ChildSessionKey,
    string Runtime,
    string Mode,
    string Backend,
    string State,
    bool Active,
    string Health,
    DateTimeOffset StartedUtc,
    DateTimeOffset LastHeartbeatUtc,
    DateTimeOffset? CompletedUtc,
    int AgeSeconds,
    int HeartbeatAgeSeconds,
    int RunTimeoutSeconds,
    int? TimeoutInSeconds,
    int? StaleInSeconds,
    DateTimeOffset? TimeoutDueUtc,
    DateTimeOffset StaleDueUtc,
    string? LastError,
    string? WorkspaceRollbackId,
    string? WorkspaceRollbackPath,
    int WorkspaceRollbackChangedFiles,
    bool WorkspaceRollbackPartial
);

internal sealed record AgentWatchdogInventoryCheck(
    string Name,
    string Status,
    string Detail
);
