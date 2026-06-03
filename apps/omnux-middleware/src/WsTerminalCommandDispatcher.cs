using System.Net.WebSockets;

namespace Omnux.Middleware;

internal sealed class WsTerminalCommandDispatcher
{
    private readonly TerminalCapabilitySnapshotService _snapshotService;

    public WsTerminalCommandDispatcher(TerminalCapabilitySnapshotService snapshotService)
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
        if (message.Type != "terminal_capabilities_get")
        {
            return false;
        }

        var snapshot = _snapshotService.GetSnapshot();
        await WebSocketGateway.SendTextAsync(
            socket,
            sendLock,
            "{"
            + "\"type\":\"terminal_capabilities_snapshot\","
            + $"\"payload\":{TerminalCapabilityJson.SerializeSnapshot(snapshot)}"
            + "}",
            cancellationToken
        ).ConfigureAwait(false);
        return true;
    }
}
