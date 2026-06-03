namespace Omnux.Middleware;

public sealed record AgentCommunicationMessage(
    string Id,
    string FromAgentId,
    string ToAgentId,
    string GroupId,
    string RunId,
    string ConversationId,
    string Kind,
    string Body,
    string CorrelationId,
    DateTimeOffset CreatedUtc
);

public sealed record AgentBoardEntry(
    string Id,
    string AgentId,
    string Key,
    string Value,
    string RunId,
    string GroupId,
    string Status,
    string Priority,
    int Version,
    DateTimeOffset CreatedUtc,
    DateTimeOffset UpdatedUtc
);

public sealed record AgentLifecycleEvent(
    string Id,
    string AgentId,
    string RunId,
    string GroupId,
    string ConversationId,
    string State,
    string Detail,
    DateTimeOffset CreatedUtc
);

public sealed record AgentCommunicationQuery(
    string? AgentId = null,
    string? GroupId = null,
    string? RunId = null,
    DateTimeOffset? SinceUtc = null,
    int? Limit = null
);

public sealed record AgentCommunicationPostRequest(
    string? FromAgentId,
    string? ToAgentId,
    string? GroupId,
    string? RunId,
    string? ConversationId,
    string? Kind,
    string? Body,
    string? CorrelationId
);

public sealed record AgentBoardWriteRequest(
    string? AgentId,
    string? Key,
    string? Value,
    string? RunId,
    string? GroupId,
    string? Status,
    string? Priority
);

public sealed record AgentLifecycleWriteRequest(
    string? AgentId,
    string? RunId,
    string? GroupId,
    string? ConversationId,
    string? State,
    string? Detail
);

public sealed record AgentCommunicationSnapshot(
    IReadOnlyList<AgentCommunicationMessage> Messages,
    IReadOnlyList<AgentBoardEntry> Board,
    IReadOnlyList<AgentLifecycleEvent> Lifecycle,
    int TotalMessages,
    int TotalBoardEntries,
    int TotalLifecycleEvents,
    DateTimeOffset SnapshotUtc
);

public sealed record AgentCommunicationActionResult(
    bool Ok,
    string Message,
    AgentCommunicationSnapshot Snapshot,
    AgentCommunicationMessage? MessageItem = null,
    AgentBoardEntry? BoardEntry = null,
    AgentLifecycleEvent? LifecycleEvent = null
);

public sealed class AgentCommunicationState
{
    public int Version { get; set; } = 1;
    public List<AgentCommunicationMessage> Messages { get; set; } = new();
    public List<AgentBoardEntry> Board { get; set; } = new();
    public List<AgentLifecycleEvent> Lifecycle { get; set; } = new();
}
