using System.Globalization;
using System.Net.WebSockets;
using System.Text.Json;

namespace Omnux.Middleware;

internal sealed class WsMultiAgentTraceCommandDispatcher
{
    private readonly MultiAgentTraceSnapshotService _snapshotService;

    public WsMultiAgentTraceCommandDispatcher(MultiAgentTraceSnapshotService snapshotService)
    {
        _snapshotService = snapshotService;
    }

    public async Task<bool> TryHandleAsync(
        WebSocketGateway.ClientMessage message,
        WebSocket socket,
        SemaphoreSlim sendLock,
        CancellationToken cancellationToken
    )
    {
        if (message.Type != "multi_agent_trace_snapshot_get")
        {
            return false;
        }

        var snapshot = _snapshotService.GetSnapshot(BuildQuery(message.RawJson, message.Limit));
        await WebSocketGateway.SendTextAsync(
            socket,
            sendLock,
            "{"
            + "\"type\":\"multi_agent_trace_snapshot\","
            + $"\"payload\":{MultiAgentTraceJson.SerializeSnapshot(snapshot)}"
            + "}",
            cancellationToken
        ).ConfigureAwait(false);
        return true;
    }

    private static AgentCommunicationQuery BuildQuery(string rawJson, int? fallbackLimit)
    {
        try
        {
            using var document = JsonDocument.Parse(rawJson);
            if (document.RootElement.ValueKind != JsonValueKind.Object)
            {
                return new AgentCommunicationQuery(Limit: fallbackLimit);
            }

            var root = document.RootElement;
            return new AgentCommunicationQuery(
                GetString(root, "agentId"),
                GetString(root, "groupId", "agentGroupId"),
                GetString(root, "runId"),
                GetDateTimeOffset(root, "sinceUtc"),
                GetInt(root, "limit") ?? fallbackLimit
            );
        }
        catch (JsonException)
        {
            return new AgentCommunicationQuery(Limit: fallbackLimit);
        }
    }

    private static string? GetString(JsonElement root, params string[] names)
    {
        foreach (var name in names)
        {
            if (root.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String)
            {
                return value.GetString();
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

        return value.ValueKind == JsonValueKind.String
               && int.TryParse(value.GetString(), NumberStyles.Integer, CultureInfo.InvariantCulture, out parsed)
            ? parsed
            : null;
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
            DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal,
            out var parsed
        )
            ? parsed.ToUniversalTime()
            : null;
    }
}
