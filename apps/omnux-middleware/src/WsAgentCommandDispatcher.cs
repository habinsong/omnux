using System.Globalization;
using System.Net.WebSockets;
using System.Text.Json;

namespace Omnux.Middleware;

internal sealed class WsAgentCommandDispatcher
{
    private readonly IAgentCommunicationApplicationService _agentCommunicationService;

    public WsAgentCommandDispatcher(IAgentCommunicationApplicationService agentCommunicationService)
    {
        _agentCommunicationService = agentCommunicationService;
    }

    public async Task<bool> TryHandleAsync(
        WebSocketGateway.ClientMessage message,
        WebSocket socket,
        SemaphoreSlim sendLock,
        CancellationToken cancellationToken
    )
    {
        if (message.Type is not ("agent_bus_get"
            or "agent_message_post"
            or "agent_board_put"
            or "agent_lifecycle_emit"
            or "agent_group_command"))
        {
            return false;
        }

        if (!TryParseRoot(message.RawJson, out var root, out var document))
        {
            await SendResultAsync(
                socket,
                sendLock,
                "agent_bus_result",
                new AgentCommunicationActionResult(
                    false,
                    "invalid agent message payload",
                    _agentCommunicationService.GetSnapshot().Snapshot
                ),
                cancellationToken
            );
            return true;
        }

        using (document)
        {
            switch (message.Type)
            {
                case "agent_bus_get":
                {
                    var result = _agentCommunicationService.GetSnapshot(BuildQuery(root));
                    await SendSnapshotAsync(socket, sendLock, result.Snapshot, cancellationToken);
                    return true;
                }
                case "agent_message_post":
                {
                    var result = _agentCommunicationService.PostMessage(new AgentCommunicationPostRequest(
                        GetString(root, "fromAgentId", "agentId", "sourceAgentId"),
                        GetString(root, "toAgentId", "targetAgentId", "target"),
                        GetString(root, "groupId", "agentGroupId"),
                        GetString(root, "runId"),
                        GetString(root, "conversationId"),
                        GetString(root, "kind"),
                        GetString(root, "body", "text", "message"),
                        GetString(root, "correlationId", "requestId")
                    ));
                    await SendResultAsync(socket, sendLock, "agent_message_result", result, cancellationToken);
                    return true;
                }
                case "agent_board_put":
                {
                    var result = _agentCommunicationService.PutBoard(new AgentBoardWriteRequest(
                        GetString(root, "agentId", "fromAgentId"),
                        GetString(root, "key", "name"),
                        GetString(root, "value", "body", "text"),
                        GetString(root, "runId"),
                        GetString(root, "groupId", "agentGroupId"),
                        GetString(root, "status", "state"),
                        GetString(root, "priority")
                    ));
                    await SendResultAsync(socket, sendLock, "agent_board_result", result, cancellationToken);
                    return true;
                }
                case "agent_lifecycle_emit":
                {
                    var result = _agentCommunicationService.EmitLifecycle(new AgentLifecycleWriteRequest(
                        GetString(root, "agentId", "fromAgentId"),
                        GetString(root, "runId"),
                        GetString(root, "groupId", "agentGroupId"),
                        GetString(root, "conversationId"),
                        GetString(root, "state", "status"),
                        GetString(root, "detail", "body", "text", "message")
                    ));
                    await SendResultAsync(socket, sendLock, "agent_lifecycle_result", result, cancellationToken);
                    return true;
                }
                case "agent_group_command":
                {
                    var result = _agentCommunicationService.PostGroupCommand(
                        GetString(root, "fromAgentId", "agentId", "parentAgentId"),
                        GetString(root, "groupId", "agentGroupId"),
                        GetString(root, "runId"),
                        GetString(root, "command", "action"),
                        GetString(root, "body", "text", "message"),
                        GetString(root, "correlationId", "requestId")
                    );
                    await SendResultAsync(socket, sendLock, "agent_group_command_result", result, cancellationToken);
                    return true;
                }
                default:
                    return false;
            }
        }
    }

    private static Task SendSnapshotAsync(
        WebSocket socket,
        SemaphoreSlim sendLock,
        AgentCommunicationSnapshot snapshot,
        CancellationToken cancellationToken
    )
    {
        return WebSocketGateway.SendTextAsync(
            socket,
            sendLock,
            "{"
            + "\"type\":\"agent_bus_snapshot\","
            + $"\"payload\":{AgentCommunicationJson.SerializeSnapshot(snapshot)}"
            + "}",
            cancellationToken
        );
    }

    private static Task SendResultAsync(
        WebSocket socket,
        SemaphoreSlim sendLock,
        string type,
        AgentCommunicationActionResult result,
        CancellationToken cancellationToken
    )
    {
        return WebSocketGateway.SendTextAsync(
            socket,
            sendLock,
            "{"
            + $"\"type\":\"{WebSocketGateway.EscapeJson(type)}\","
            + $"\"payload\":{AgentCommunicationJson.SerializeActionResult(result)}"
            + "}",
            cancellationToken
        );
    }

    private static AgentCommunicationQuery BuildQuery(JsonElement root)
    {
        return new AgentCommunicationQuery(
            GetString(root, "agentId"),
            GetString(root, "groupId", "agentGroupId"),
            GetString(root, "runId"),
            GetDateTimeOffset(root, "sinceUtc"),
            GetInt(root, "limit")
        );
    }

    private static bool TryParseRoot(
        string rawJson,
        out JsonElement root,
        out JsonDocument document
    )
    {
        root = default;
        document = null!;
        try
        {
            document = JsonDocument.Parse(rawJson);
            if (document.RootElement.ValueKind != JsonValueKind.Object)
            {
                document.Dispose();
                document = null!;
                return false;
            }

            root = document.RootElement;
            return true;
        }
        catch
        {
            return false;
        }
    }

    private static string? GetString(JsonElement root, params string[] names)
    {
        foreach (var name in names)
        {
            if (!root.TryGetProperty(name, out var value))
            {
                continue;
            }

            if (value.ValueKind == JsonValueKind.String)
            {
                return value.GetString();
            }

            if (value.ValueKind == JsonValueKind.Number
                || value.ValueKind == JsonValueKind.True
                || value.ValueKind == JsonValueKind.False)
            {
                return value.ToString();
            }
        }

        return null;
    }

    private static int? GetInt(JsonElement root, string name)
    {
        if (!root.TryGetProperty(name, out var value))
        {
            return null;
        }

        if (value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var parsed))
        {
            return parsed;
        }

        if (value.ValueKind == JsonValueKind.String
            && int.TryParse(value.GetString(), NumberStyles.Integer, CultureInfo.InvariantCulture, out parsed))
        {
            return parsed;
        }

        return null;
    }

    private static DateTimeOffset? GetDateTimeOffset(JsonElement root, string name)
    {
        if (!root.TryGetProperty(name, out var value) || value.ValueKind != JsonValueKind.String)
        {
            return null;
        }

        return DateTimeOffset.TryParse(
            value.GetString(),
            CultureInfo.InvariantCulture,
            DateTimeStyles.AssumeUniversal,
            out var parsed
        )
            ? parsed
            : null;
    }
}
