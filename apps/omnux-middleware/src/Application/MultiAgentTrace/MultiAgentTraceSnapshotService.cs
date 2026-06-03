namespace Omnux.Middleware;

internal sealed class MultiAgentTraceSnapshotService
{
    private const int ThreadMessagePreviewLimit = 20;
    private const int BodyPreviewChars = 240;
    private const int InterventionLimit = 50;

    private readonly IAgentCommunicationApplicationService _agentCommunicationService;

    public MultiAgentTraceSnapshotService(IAgentCommunicationApplicationService agentCommunicationService)
    {
        _agentCommunicationService = agentCommunicationService;
    }

    public MultiAgentTraceSnapshot GetSnapshot(AgentCommunicationQuery? query = null)
    {
        var agentSnapshot = _agentCommunicationService.GetSnapshot(query).Snapshot;
        var agents = BuildAgents(agentSnapshot);
        var threads = BuildThreads(agentSnapshot.Messages);
        var edges = BuildEdges(agentSnapshot.Messages);
        var interventions = BuildInterventions(agentSnapshot);
        var status = agentSnapshot.Messages.Count == 0
                     && agentSnapshot.Board.Count == 0
                     && agentSnapshot.Lifecycle.Count == 0
            ? "no_activity"
            : "ok";

        return new MultiAgentTraceSnapshot(
            status,
            ReadOnly: true,
            agents,
            threads,
            edges,
            interventions,
            agentSnapshot.Messages.Count,
            agentSnapshot.Board.Count,
            agentSnapshot.Lifecycle.Count,
            agentSnapshot.SnapshotUtc
        );
    }

    private static IReadOnlyList<MultiAgentTraceAgent> BuildAgents(AgentCommunicationSnapshot snapshot)
    {
        var map = new Dictionary<string, AgentAccumulator>(StringComparer.Ordinal);
        foreach (var message in snapshot.Messages)
        {
            TouchAgent(map, message.FromAgentId, message.GroupId, message.RunId, message.CreatedUtc, messageDelta: 1);
            if (!string.IsNullOrWhiteSpace(message.ToAgentId))
            {
                TouchAgent(map, message.ToAgentId, message.GroupId, message.RunId, message.CreatedUtc, messageDelta: 1);
            }
        }

        foreach (var board in snapshot.Board)
        {
            TouchAgent(map, board.AgentId, board.GroupId, board.RunId, board.UpdatedUtc, boardDelta: 1);
        }

        foreach (var lifecycle in snapshot.Lifecycle)
        {
            var agent = TouchAgent(
                map,
                lifecycle.AgentId,
                lifecycle.GroupId,
                lifecycle.RunId,
                lifecycle.CreatedUtc,
                lifecycleDelta: 1
            );
            agent.State = NormalizeState(lifecycle.State);
        }

        return map.Values
            .OrderByDescending(agent => agent.LastSeenUtc)
            .ThenBy(agent => agent.AgentId, StringComparer.Ordinal)
            .Select(agent => new MultiAgentTraceAgent(
                agent.AgentId,
                ResolveRole(agent.AgentId),
                agent.State,
                agent.GroupId,
                agent.RunId,
                agent.MessageCount,
                agent.BoardEntryCount,
                agent.LifecycleEventCount,
                agent.LastSeenUtc
            ))
            .ToArray();
    }

    private static IReadOnlyList<MultiAgentTraceThread> BuildThreads(IReadOnlyList<AgentCommunicationMessage> messages)
    {
        return messages
            .GroupBy(BuildThreadKey, StringComparer.Ordinal)
            .Select(group =>
            {
                var ordered = group.OrderBy(message => message.CreatedUtc).ToArray();
                var first = ordered[0];
                var last = ordered[^1];
                return new MultiAgentTraceThread(
                    group.Key,
                    first.GroupId,
                    first.RunId,
                    first.CorrelationId,
                    BuildThreadTitle(first),
                    ordered.Length,
                    ordered
                        .TakeLast(ThreadMessagePreviewLimit)
                        .Select(ToTraceMessage)
                        .ToArray(),
                    first.CreatedUtc,
                    last.CreatedUtc
                );
            })
            .OrderByDescending(thread => thread.LastMessageUtc)
            .ThenBy(thread => thread.ThreadId, StringComparer.Ordinal)
            .ToArray();
    }

    private static IReadOnlyList<MultiAgentTraceEdge> BuildEdges(IReadOnlyList<AgentCommunicationMessage> messages)
    {
        return messages
            .Where(message => !string.IsNullOrWhiteSpace(message.FromAgentId))
            .GroupBy(message => new EdgeKey(
                message.FromAgentId,
                ResolveEdgeTarget(message),
                message.GroupId,
                message.RunId,
                NormalizeKind(message.Kind)
            ))
            .Select(group =>
            {
                var last = group.Max(message => message.CreatedUtc);
                return new MultiAgentTraceEdge(
                    group.Key.FromAgentId,
                    group.Key.ToAgentId,
                    group.Key.GroupId,
                    group.Key.RunId,
                    group.Key.Kind,
                    group.Count(),
                    last
                );
            })
            .OrderByDescending(edge => edge.LastMessageUtc)
            .ThenBy(edge => edge.FromAgentId, StringComparer.Ordinal)
            .ThenBy(edge => edge.ToAgentId, StringComparer.Ordinal)
            .ToArray();
    }

    private static IReadOnlyList<MultiAgentTraceIntervention> BuildInterventions(AgentCommunicationSnapshot snapshot)
    {
        var items = new List<MultiAgentTraceIntervention>();
        foreach (var message in snapshot.Messages)
        {
            if (IsCommand(message) || LooksLikeInterventionText(message.Body))
            {
                items.Add(new MultiAgentTraceIntervention(
                    message.Id,
                    "message",
                    IsCommand(message) ? "warning" : "info",
                    IsCommand(message) ? "group_command" : "intervention_signal",
                    message.FromAgentId,
                    message.GroupId,
                    message.RunId,
                    TrimPreview(message.Body),
                    message.CreatedUtc
                ));
            }
        }

        foreach (var lifecycle in snapshot.Lifecycle)
        {
            var state = NormalizeState(lifecycle.State);
            if (state is "failed" or "error" or "timeout" or "stale" or "blocked")
            {
                items.Add(new MultiAgentTraceIntervention(
                    lifecycle.Id,
                    "lifecycle",
                    "error",
                    $"lifecycle_{state}",
                    lifecycle.AgentId,
                    lifecycle.GroupId,
                    lifecycle.RunId,
                    TrimPreview(lifecycle.Detail),
                    lifecycle.CreatedUtc
                ));
            }
        }

        foreach (var board in snapshot.Board)
        {
            var status = NormalizeState(board.Status);
            if (status is "blocked" or "needs_review" or "waiting" or "failed")
            {
                items.Add(new MultiAgentTraceIntervention(
                    board.Id,
                    "board",
                    status == "failed" || status == "blocked" ? "error" : "warning",
                    $"board_{status}",
                    board.AgentId,
                    board.GroupId,
                    board.RunId,
                    $"{board.Key}: {TrimPreview(board.Value)}",
                    board.UpdatedUtc
                ));
            }
        }

        return items
            .OrderByDescending(item => item.CreatedUtc)
            .Take(InterventionLimit)
            .ToArray();
    }

    private static AgentAccumulator TouchAgent(
        IDictionary<string, AgentAccumulator> map,
        string agentId,
        string groupId,
        string runId,
        DateTimeOffset seenUtc,
        int messageDelta = 0,
        int boardDelta = 0,
        int lifecycleDelta = 0
    )
    {
        var normalizedAgentId = string.IsNullOrWhiteSpace(agentId) ? "unknown-agent" : agentId.Trim();
        if (!map.TryGetValue(normalizedAgentId, out var agent))
        {
            agent = new AgentAccumulator(normalizedAgentId);
            map[normalizedAgentId] = agent;
        }

        agent.GroupId = PreferLatest(groupId, agent.GroupId);
        agent.RunId = PreferLatest(runId, agent.RunId);
        agent.LastSeenUtc = seenUtc > agent.LastSeenUtc ? seenUtc : agent.LastSeenUtc;
        agent.MessageCount += messageDelta;
        agent.BoardEntryCount += boardDelta;
        agent.LifecycleEventCount += lifecycleDelta;
        return agent;
    }

    private static MultiAgentTraceMessage ToTraceMessage(AgentCommunicationMessage message)
    {
        return new MultiAgentTraceMessage(
            message.Id,
            message.FromAgentId,
            message.ToAgentId,
            NormalizeKind(message.Kind),
            ResolveRole(message.FromAgentId),
            TrimPreview(message.Body),
            message.CreatedUtc
        );
    }

    private static string BuildThreadKey(AgentCommunicationMessage message)
    {
        if (!string.IsNullOrWhiteSpace(message.CorrelationId))
        {
            return $"corr:{message.CorrelationId}";
        }

        if (!string.IsNullOrWhiteSpace(message.RunId))
        {
            return $"run:{message.RunId}";
        }

        if (!string.IsNullOrWhiteSpace(message.GroupId))
        {
            return $"group:{message.GroupId}";
        }

        if (!string.IsNullOrWhiteSpace(message.ConversationId))
        {
            return $"conversation:{message.ConversationId}";
        }

        return $"message:{message.Id}";
    }

    private static string BuildThreadTitle(AgentCommunicationMessage first)
    {
        var kind = NormalizeKind(first.Kind);
        var target = string.IsNullOrWhiteSpace(first.ToAgentId)
            ? (string.IsNullOrWhiteSpace(first.GroupId) ? "broadcast" : $"group:{first.GroupId}")
            : first.ToAgentId;
        return $"{kind}: {first.FromAgentId} -> {target}";
    }

    private static string ResolveEdgeTarget(AgentCommunicationMessage message)
    {
        if (!string.IsNullOrWhiteSpace(message.ToAgentId))
        {
            return message.ToAgentId;
        }

        if (!string.IsNullOrWhiteSpace(message.GroupId))
        {
            return $"group:{message.GroupId}";
        }

        if (!string.IsNullOrWhiteSpace(message.RunId))
        {
            return $"run:{message.RunId}";
        }

        return "broadcast";
    }

    private static bool IsCommand(AgentCommunicationMessage message)
    {
        return NormalizeKind(message.Kind) == "command";
    }

    private static bool LooksLikeInterventionText(string text)
    {
        var lower = (text ?? string.Empty).ToLowerInvariant();
        return lower.Contains("human", StringComparison.Ordinal)
               || lower.Contains("approval", StringComparison.Ordinal)
               || lower.Contains("blocked", StringComparison.Ordinal)
               || lower.Contains("conflict", StringComparison.Ordinal)
               || lower.Contains("rollback", StringComparison.Ordinal)
               || lower.Contains("needs review", StringComparison.Ordinal)
               || lower.Contains("사용자 승인", StringComparison.Ordinal)
               || lower.Contains("차단", StringComparison.Ordinal)
               || lower.Contains("충돌", StringComparison.Ordinal);
    }

    private static string ResolveRole(string agentId)
    {
        var lower = (agentId ?? string.Empty).ToLowerInvariant();
        if (lower.Contains("human", StringComparison.Ordinal) || lower.Contains("user", StringComparison.Ordinal))
        {
            return "human";
        }

        if (lower.Contains("planner", StringComparison.Ordinal) || lower.Contains("plan", StringComparison.Ordinal))
        {
            return "planner";
        }

        if (lower.Contains("review", StringComparison.Ordinal) || lower.Contains("critic", StringComparison.Ordinal))
        {
            return "reviewer";
        }

        if (lower.Contains("qa", StringComparison.Ordinal) || lower.Contains("test", StringComparison.Ordinal))
        {
            return "qa";
        }

        if (lower.Contains("supervisor", StringComparison.Ordinal) || lower.Contains("lead", StringComparison.Ordinal))
        {
            return "supervisor";
        }

        if (lower.Contains("code", StringComparison.Ordinal) || lower.Contains("coder", StringComparison.Ordinal))
        {
            return "coder";
        }

        return "agent";
    }

    private static string NormalizeKind(string kind)
    {
        return string.IsNullOrWhiteSpace(kind) ? "message" : kind.Trim().ToLowerInvariant();
    }

    private static string NormalizeState(string state)
    {
        return string.IsNullOrWhiteSpace(state) ? "unknown" : state.Trim().ToLowerInvariant();
    }

    private static string PreferLatest(string next, string current)
    {
        return string.IsNullOrWhiteSpace(next) ? current : next.Trim();
    }

    private static string TrimPreview(string text)
    {
        var normalized = (text ?? string.Empty)
            .Replace("\r\n", "\n", StringComparison.Ordinal)
            .Replace('\r', '\n')
            .Trim();
        return normalized.Length <= BodyPreviewChars
            ? normalized
            : normalized[..BodyPreviewChars] + "...";
    }

    private sealed class AgentAccumulator
    {
        public AgentAccumulator(string agentId)
        {
            AgentId = agentId;
        }

        public string AgentId { get; }
        public string Role => ResolveRole(AgentId);
        public string State { get; set; } = "unknown";
        public string GroupId { get; set; } = string.Empty;
        public string RunId { get; set; } = string.Empty;
        public int MessageCount { get; set; }
        public int BoardEntryCount { get; set; }
        public int LifecycleEventCount { get; set; }
        public DateTimeOffset LastSeenUtc { get; set; } = DateTimeOffset.MinValue;
    }

    private sealed record EdgeKey(
        string FromAgentId,
        string ToAgentId,
        string GroupId,
        string RunId,
        string Kind
    );
}
