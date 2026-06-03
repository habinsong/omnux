using System.Net.WebSockets;

namespace Omnux.Middleware;

internal sealed class WsSelfImprovementCommandDispatcher
{
    private readonly SelfImprovementSnapshotService _snapshotService;

    public WsSelfImprovementCommandDispatcher(SelfImprovementSnapshotService snapshotService)
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
        if (message.Type != "self_improvement_snapshot_get")
        {
            return false;
        }

        var snapshot = await _snapshotService.GetSnapshotAsync(message.Limit, cancellationToken)
            .ConfigureAwait(false);
        await WebSocketGateway.SendTextAsync(
            socket,
            sendLock,
            "{"
            + "\"type\":\"self_improvement_snapshot\","
            + $"\"payload\":{SelfImprovementJson.SerializeSnapshot(snapshot)}"
            + "}",
            cancellationToken
        ).ConfigureAwait(false);
        return true;
    }
}
