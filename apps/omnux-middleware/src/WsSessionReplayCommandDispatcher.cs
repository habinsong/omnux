using System.Globalization;
using System.Net.WebSockets;
using System.Text.Json;

namespace Omnux.Middleware;

internal sealed class WsSessionReplayCommandDispatcher
{
    private readonly ISessionReplayApplicationService _sessionReplayService;

    public WsSessionReplayCommandDispatcher(ISessionReplayApplicationService sessionReplayService)
    {
        _sessionReplayService = sessionReplayService;
    }

    public async Task<bool> TryHandleAsync(
        WebSocketGateway.ClientMessage message,
        WebSocket socket,
        SemaphoreSlim sendLock,
        CancellationToken cancellationToken
    )
    {
        if (message.Type != "session_replay_get")
        {
            return false;
        }

        if (!TryParseRoot(message.RawJson, out var root, out var document))
        {
            await SendResultAsync(
                socket,
                sendLock,
                new SessionReplayActionResult(
                    false,
                    "invalid session replay payload",
                    new SessionReplaySnapshot(
                        string.Empty,
                        string.Empty,
                        string.Empty,
                        string.Empty,
                        Array.Empty<SessionReplayEvent>(),
                        new SessionReplaySummary(0, 0, 0, 0, 0, 0, 0, 0, 0, null, null),
                        0,
                        0,
                        DateTimeOffset.UtcNow
                    )
                ),
                cancellationToken
            );
            return true;
        }

        using (document)
        {
            var result = _sessionReplayService.GetReplay(BuildQuery(root));
            if (result.Ok)
            {
                await SendSnapshotAsync(socket, sendLock, result.Snapshot, cancellationToken);
            }
            else
            {
                await SendResultAsync(socket, sendLock, result, cancellationToken);
            }

            return true;
        }
    }

    private static Task SendSnapshotAsync(
        WebSocket socket,
        SemaphoreSlim sendLock,
        SessionReplaySnapshot snapshot,
        CancellationToken cancellationToken
    )
    {
        return WebSocketGateway.SendTextAsync(
            socket,
            sendLock,
            "{"
            + "\"type\":\"session_replay_snapshot\","
            + $"\"payload\":{SessionReplayJson.SerializeSnapshot(snapshot)}"
            + "}",
            cancellationToken
        );
    }

    private static Task SendResultAsync(
        WebSocket socket,
        SemaphoreSlim sendLock,
        SessionReplayActionResult result,
        CancellationToken cancellationToken
    )
    {
        return WebSocketGateway.SendTextAsync(
            socket,
            sendLock,
            "{"
            + "\"type\":\"session_replay_result\","
            + $"\"payload\":{SessionReplayJson.SerializeActionResult(result)}"
            + "}",
            cancellationToken
        );
    }

    private static SessionReplayQuery BuildQuery(JsonElement root)
    {
        return new SessionReplayQuery(
            GetString(root, "conversationId", "sessionId", "threadId"),
            GetString(root, "runId"),
            GetString(root, "agentId"),
            GetString(root, "groupId", "agentGroupId"),
            GetDateTimeOffset(root, "sinceUtc"),
            GetInt(root, "limit"),
            GetBool(root, "includeText") ?? false,
            GetBool(root, "includeTelemetry") ?? true,
            GetBool(root, "includeAgentEvents") ?? true
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

    private static bool? GetBool(JsonElement root, string name)
    {
        if (!root.TryGetProperty(name, out var value))
        {
            return null;
        }

        if (value.ValueKind == JsonValueKind.True)
        {
            return true;
        }

        if (value.ValueKind == JsonValueKind.False)
        {
            return false;
        }

        if (value.ValueKind == JsonValueKind.String
            && bool.TryParse(value.GetString(), out var parsed))
        {
            return parsed;
        }

        return null;
    }

    private static DateTimeOffset? GetDateTimeOffset(JsonElement root, string name)
    {
        if (!root.TryGetProperty(name, out var value))
        {
            return null;
        }

        if (value.ValueKind == JsonValueKind.String
            && DateTimeOffset.TryParse(
                value.GetString(),
                CultureInfo.InvariantCulture,
                DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal,
                out var parsed))
        {
            return parsed;
        }

        return null;
    }
}
