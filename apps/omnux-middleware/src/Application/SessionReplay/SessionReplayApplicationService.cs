namespace Omnux.Middleware;

public interface ISessionReplayApplicationService
{
    SessionReplayActionResult GetReplay(SessionReplayQuery? query = null);
}

public sealed class SessionReplayApplicationService : ISessionReplayApplicationService
{
    private const int DefaultLimit = 200;
    private const int MaxLimit = 500;

    private readonly IConversationStore _conversationStore;
    private readonly ITelemetryApplicationService _telemetryService;
    private readonly IAgentCommunicationApplicationService _agentCommunicationService;
    private readonly Func<DateTimeOffset> _utcNow;

    public SessionReplayApplicationService(
        IConversationStore conversationStore,
        ITelemetryApplicationService telemetryService,
        IAgentCommunicationApplicationService agentCommunicationService,
        Func<DateTimeOffset>? utcNow = null
    )
    {
        _conversationStore = conversationStore;
        _telemetryService = telemetryService;
        _agentCommunicationService = agentCommunicationService;
        _utcNow = utcNow ?? (() => DateTimeOffset.UtcNow);
    }

    public SessionReplayActionResult GetReplay(SessionReplayQuery? query = null)
    {
        var request = NormalizeQuery(query ?? new SessionReplayQuery());
        var hasAnchor = HasValue(request.ConversationId)
                        || HasValue(request.RunId)
                        || HasValue(request.AgentId)
                        || HasValue(request.GroupId);
        if (!hasAnchor)
        {
            return Failure("conversationId, runId, agentId, or groupId is required", request);
        }

        ConversationThreadView? conversation = null;
        if (HasValue(request.ConversationId))
        {
            conversation = _conversationStore.Get(request.ConversationId!);
            if (conversation == null)
            {
                return Failure("conversation not found", request);
            }
        }

        var events = new List<SessionReplayEvent>();
        if (conversation != null)
        {
            SessionReplayEventBuilder.AddConversationEvents(events, conversation, request);
            SessionReplayEventBuilder.AddCodingResultEvent(events, conversation, request);
        }

        if (request.IncludeAgentEvents)
        {
            var agentSnapshot = _agentCommunicationService.GetSnapshot(new AgentCommunicationQuery(
                request.AgentId,
                request.GroupId,
                request.RunId,
                request.SinceUtc,
                MaxLimit
            )).Snapshot;
            SessionReplayEventBuilder.AddAgentEvents(events, agentSnapshot, request);
        }

        if (request.IncludeTelemetry && conversation != null)
        {
            var telemetrySnapshot = _telemetryService.GetSnapshot(new TelemetryTraceQuery(
                SinceUtc: SessionReplayEventBuilder.ResolveTelemetrySince(conversation, request.SinceUtc),
                Limit: MaxLimit
            )).Snapshot;
            SessionReplayEventBuilder.AddTelemetryEvents(events, telemetrySnapshot.Events, conversation);
        }

        var filtered = events
            .Where(item => !request.SinceUtc.HasValue || item.TimestampUtc >= request.SinceUtc.Value)
            .OrderBy(item => item.TimestampUtc)
            .ThenBy(item => item.Source, StringComparer.Ordinal)
            .ThenBy(item => item.Id, StringComparer.Ordinal)
            .ToArray();
        var visible = filtered
            .OrderByDescending(item => item.TimestampUtc)
            .Take(request.Limit!.Value)
            .OrderBy(item => item.TimestampUtc)
            .ThenBy(item => item.Source, StringComparer.Ordinal)
            .ThenBy(item => item.Id, StringComparer.Ordinal)
            .ToArray();

        return new SessionReplayActionResult(
            true,
            "session replay loaded",
            BuildSnapshot(request, visible, filtered.Length)
        );
    }

    private SessionReplayActionResult Failure(string message, SessionReplayQuery query)
    {
        return new SessionReplayActionResult(false, message, BuildSnapshot(query, Array.Empty<SessionReplayEvent>(), 0));
    }

    private SessionReplaySnapshot BuildSnapshot(
        SessionReplayQuery query,
        IReadOnlyList<SessionReplayEvent> events,
        int totalEvents
    )
    {
        return new SessionReplaySnapshot(
            query.ConversationId ?? string.Empty,
            query.RunId ?? string.Empty,
            query.AgentId ?? string.Empty,
            query.GroupId ?? string.Empty,
            events,
            BuildSummary(events),
            Math.Max(0, totalEvents),
            events.Count,
            _utcNow()
        );
    }

    private static SessionReplaySummary BuildSummary(IReadOnlyList<SessionReplayEvent> events)
    {
        DateTimeOffset? first = events.Count == 0 ? null : events.Min(item => item.TimestampUtc);
        DateTimeOffset? last = events.Count == 0 ? null : events.Max(item => item.TimestampUtc);
        var telemetryTokenEvents = events
            .Where(item => item.Source == "telemetry"
                           && (item.TotalTokens > 0 || item.PromptTokens > 0 || item.CompletionTokens > 0))
            .ToArray();
        var tokenEvents = telemetryTokenEvents.Length > 0
            ? telemetryTokenEvents
            : events.Where(item => item.TotalTokens > 0 || item.PromptTokens > 0 || item.CompletionTokens > 0).ToArray();
        return new SessionReplaySummary(
            events.Count,
            events.Count(item => item.Source == "conversation"),
            events.Count(item => item.Source == "telemetry"),
            events.Count(item => item.Source.StartsWith("agent_", StringComparison.Ordinal)),
            events.Count(item => item.Severity == "error"),
            events.Count(item => item.Severity == "warning"),
            tokenEvents.Sum(item => Math.Max(0L, item.PromptTokens)),
            tokenEvents.Sum(item => Math.Max(0L, item.CompletionTokens)),
            tokenEvents.Sum(item => Math.Max(0L, item.TotalTokens)),
            first,
            last
        );
    }

    private static SessionReplayQuery NormalizeQuery(SessionReplayQuery query)
    {
        return query with
        {
            ConversationId = NormalizeOptionalToken(query.ConversationId),
            RunId = NormalizeOptionalToken(query.RunId),
            AgentId = NormalizeOptionalToken(query.AgentId),
            GroupId = NormalizeOptionalToken(query.GroupId),
            Limit = Math.Clamp(query.Limit ?? DefaultLimit, 1, MaxLimit)
        };
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
}
