using System.Net.WebSockets;

namespace Omnux.Middleware;

internal sealed class WsCodeRepomapCommandDispatcher
{
    private readonly CodeRepomapSnapshotService _snapshotService;

    public WsCodeRepomapCommandDispatcher(CodeRepomapSnapshotService snapshotService)
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
        if (message.Type != "code_repomap_snapshot_get")
        {
            return false;
        }

        var snapshot = _snapshotService.GetSnapshot(message.Limit);
        await WebSocketGateway.SendTextAsync(
            socket,
            sendLock,
            "{"
            + "\"type\":\"code_repomap_snapshot\","
            + $"\"payload\":{CodeRepomapJson.SerializeSnapshot(snapshot)}"
            + "}",
            cancellationToken
        ).ConfigureAwait(false);
        return true;
    }
}
