using System.Globalization;
using System.Net.WebSockets;
using System.Text.Json;

namespace Omnux.Middleware;

internal sealed class WsTelemetryCommandDispatcher
{
    private readonly ITelemetryApplicationService _telemetryService;

    public WsTelemetryCommandDispatcher(ITelemetryApplicationService telemetryService)
    {
        _telemetryService = telemetryService;
    }

    public async Task<bool> TryHandleAsync(
        WebSocketGateway.ClientMessage message,
        WebSocket socket,
        SemaphoreSlim sendLock,
        CancellationToken cancellationToken
    )
    {
        if (message.Type != "telemetry_snapshot_get")
        {
            return false;
        }

        if (!TryParseRoot(message.RawJson, out var root, out var document))
        {
            await SendResultAsync(
                socket,
                sendLock,
                new TelemetryActionResult(
                    false,
                    "invalid telemetry payload",
                    _telemetryService.GetSnapshot().Snapshot
                ),
                cancellationToken
            );
            return true;
        }

        using (document)
        {
            var result = _telemetryService.GetSnapshot(BuildQuery(root));
            await SendSnapshotAsync(socket, sendLock, result.Snapshot, cancellationToken);
            return true;
        }
    }

    private static Task SendSnapshotAsync(
        WebSocket socket,
        SemaphoreSlim sendLock,
        TelemetrySnapshot snapshot,
        CancellationToken cancellationToken
    )
    {
        return WebSocketGateway.SendTextAsync(
            socket,
            sendLock,
            "{"
            + "\"type\":\"telemetry_snapshot\","
            + $"\"payload\":{TelemetryTraceJson.SerializeSnapshot(snapshot)}"
            + "}",
            cancellationToken
        );
    }

    private static Task SendResultAsync(
        WebSocket socket,
        SemaphoreSlim sendLock,
        TelemetryActionResult result,
        CancellationToken cancellationToken
    )
    {
        return WebSocketGateway.SendTextAsync(
            socket,
            sendLock,
            "{"
            + "\"type\":\"telemetry_snapshot_result\","
            + $"\"payload\":{TelemetryTraceJson.SerializeActionResult(result)}"
            + "}",
            cancellationToken
        );
    }

    private static TelemetryTraceQuery BuildQuery(JsonElement root)
    {
        return new TelemetryTraceQuery(
            GetString(root, "provider"),
            GetString(root, "model"),
            GetString(root, "status"),
            GetString(root, "source"),
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

    private static string? GetString(JsonElement root, string name)
    {
        if (!root.TryGetProperty(name, out var value))
        {
            return null;
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

        return null;
    }

    private static int? GetInt(JsonElement root, string name)
    {
        if (!root.TryGetProperty(name, out var value))
        {
            return null;
        }

        if (value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var intValue))
        {
            return intValue;
        }

        if (value.ValueKind == JsonValueKind.String
            && int.TryParse(value.GetString(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed))
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
