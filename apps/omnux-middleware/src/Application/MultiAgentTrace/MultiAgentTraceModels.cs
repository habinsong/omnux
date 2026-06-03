namespace Omnux.Middleware;

internal sealed record MultiAgentTraceSnapshot(
    string Status,
    bool ReadOnly,
    IReadOnlyList<MultiAgentTraceAgent> Agents,
    IReadOnlyList<MultiAgentTraceThread> Threads,
    IReadOnlyList<MultiAgentTraceEdge> Edges,
    IReadOnlyList<MultiAgentTraceIntervention> Interventions,
    int MessageCount,
    int BoardEntryCount,
    int LifecycleEventCount,
    DateTimeOffset SnapshotUtc
);

internal sealed record MultiAgentTraceAgent(
    string AgentId,
    string Role,
    string State,
    string GroupId,
    string RunId,
    int MessageCount,
    int BoardEntryCount,
    int LifecycleEventCount,
    DateTimeOffset LastSeenUtc
);

internal sealed record MultiAgentTraceThread(
    string ThreadId,
    string GroupId,
    string RunId,
    string CorrelationId,
    string Title,
    int MessageCount,
    IReadOnlyList<MultiAgentTraceMessage> Messages,
    DateTimeOffset FirstMessageUtc,
    DateTimeOffset LastMessageUtc
);

internal sealed record MultiAgentTraceMessage(
    string Id,
    string FromAgentId,
    string ToAgentId,
    string Kind,
    string Role,
    string BodyPreview,
    DateTimeOffset CreatedUtc
);

internal sealed record MultiAgentTraceEdge(
    string FromAgentId,
    string ToAgentId,
    string GroupId,
    string RunId,
    string Kind,
    int MessageCount,
    DateTimeOffset LastMessageUtc
);

internal sealed record MultiAgentTraceIntervention(
    string SourceId,
    string Source,
    string Severity,
    string Reason,
    string AgentId,
    string GroupId,
    string RunId,
    string Message,
    DateTimeOffset CreatedUtc
);
