namespace Omnux.Middleware;

public interface IAgentCommunicationApplicationService
{
    AgentCommunicationActionResult GetSnapshot(AgentCommunicationQuery? query = null);
    AgentCommunicationActionResult PostMessage(AgentCommunicationPostRequest request);
    AgentCommunicationActionResult PutBoard(AgentBoardWriteRequest request);
    AgentCommunicationActionResult EmitLifecycle(AgentLifecycleWriteRequest request);
    AgentCommunicationActionResult PostGroupCommand(
        string? fromAgentId,
        string? groupId,
        string? runId,
        string? command,
        string? body,
        string? correlationId
    );
}

public sealed class AgentCommunicationApplicationService : IAgentCommunicationApplicationService
{
    private readonly FileAgentCommunicationStore _store;
    private readonly AuditLogger _auditLogger;

    public AgentCommunicationApplicationService(
        FileAgentCommunicationStore store,
        AuditLogger auditLogger
    )
    {
        _store = store;
        _auditLogger = auditLogger;
    }

    public AgentCommunicationActionResult GetSnapshot(AgentCommunicationQuery? query = null)
    {
        return Success("agent communication snapshot loaded", _store.GetSnapshot(query));
    }

    public AgentCommunicationActionResult PostMessage(AgentCommunicationPostRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.FromAgentId))
        {
            return Failure("fromAgentId is required");
        }

        if (string.IsNullOrWhiteSpace(request.ToAgentId)
            && string.IsNullOrWhiteSpace(request.GroupId)
            && string.IsNullOrWhiteSpace(request.RunId))
        {
            return Failure("one of toAgentId, groupId, or runId is required");
        }

        if (string.IsNullOrWhiteSpace(request.Body))
        {
            return Failure("body is required");
        }

        var message = _store.PostMessage(request);
        _auditLogger.Log(
            "agent-communication",
            "message_post",
            "ok",
            $"from={message.FromAgentId} to={message.ToAgentId} group={message.GroupId} run={message.RunId} kind={message.Kind}"
        );

        return new AgentCommunicationActionResult(
            true,
            "agent message posted",
            _store.GetSnapshot(BuildFollowUpQuery(message)),
            MessageItem: message
        );
    }

    public AgentCommunicationActionResult PutBoard(AgentBoardWriteRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.AgentId))
        {
            return Failure("agentId is required");
        }

        if (string.IsNullOrWhiteSpace(request.Key))
        {
            return Failure("key is required");
        }

        var entry = _store.UpsertBoard(request);
        _auditLogger.Log(
            "agent-communication",
            "board_put",
            "ok",
            $"agent={entry.AgentId} key={entry.Key} group={entry.GroupId} run={entry.RunId} version={entry.Version}"
        );

        return new AgentCommunicationActionResult(
            true,
            "agent board entry saved",
            _store.GetSnapshot(new AgentCommunicationQuery(entry.AgentId, entry.GroupId, entry.RunId)),
            BoardEntry: entry
        );
    }

    public AgentCommunicationActionResult EmitLifecycle(AgentLifecycleWriteRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.AgentId))
        {
            return Failure("agentId is required");
        }

        if (string.IsNullOrWhiteSpace(request.State))
        {
            return Failure("state is required");
        }

        var item = _store.AddLifecycleEvent(request);
        _auditLogger.Log(
            "agent-communication",
            "lifecycle_emit",
            "ok",
            $"agent={item.AgentId} state={item.State} group={item.GroupId} run={item.RunId}"
        );

        return new AgentCommunicationActionResult(
            true,
            "agent lifecycle event saved",
            _store.GetSnapshot(new AgentCommunicationQuery(item.AgentId, item.GroupId, item.RunId)),
            LifecycleEvent: item
        );
    }

    public AgentCommunicationActionResult PostGroupCommand(
        string? fromAgentId,
        string? groupId,
        string? runId,
        string? command,
        string? body,
        string? correlationId
    )
    {
        if (string.IsNullOrWhiteSpace(fromAgentId))
        {
            return Failure("fromAgentId is required");
        }

        if (string.IsNullOrWhiteSpace(groupId) && string.IsNullOrWhiteSpace(runId))
        {
            return Failure("groupId or runId is required");
        }

        if (string.IsNullOrWhiteSpace(command))
        {
            return Failure("command is required");
        }

        var commandBody = string.IsNullOrWhiteSpace(body)
            ? command.Trim()
            : $"{command.Trim()}\n\n{body.Trim()}";
        return PostMessage(new AgentCommunicationPostRequest(
            fromAgentId,
            null,
            groupId,
            runId,
            null,
            "command",
            commandBody,
            correlationId
        ));
    }

    private AgentCommunicationActionResult Failure(string message)
    {
        return new AgentCommunicationActionResult(false, message, _store.GetSnapshot());
    }

    private static AgentCommunicationActionResult Success(
        string message,
        AgentCommunicationSnapshot snapshot
    )
    {
        return new AgentCommunicationActionResult(true, message, snapshot);
    }

    private static AgentCommunicationQuery BuildFollowUpQuery(AgentCommunicationMessage message)
    {
        return new AgentCommunicationQuery(
            string.IsNullOrWhiteSpace(message.ToAgentId) ? message.FromAgentId : message.ToAgentId,
            message.GroupId,
            message.RunId,
            null,
            100
        );
    }
}
