using System.Net.WebSockets;

namespace Omnux.Middleware;

internal sealed class WsAgentWatchdogCommandDispatcher
{
    private readonly AgentWatchdogInventorySnapshotService _snapshotService;

    public WsAgentWatchdogCommandDispatcher(AgentWatchdogInventorySnapshotService snapshotService)
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
        if (message.Type != "agent_watchdog_snapshot_get")
        {
            return false;
        }

        var snapshot = _snapshotService.GetSnapshot(message.Limit);
        await WebSocketGateway.SendTextAsync(
            socket,
            sendLock,
            "{"
            + "\"type\":\"agent_watchdog_snapshot\","
            + $"\"payload\":{AgentWatchdogInventoryJson.SerializeSnapshot(snapshot)}"
            + "}",
            cancellationToken
        ).ConfigureAwait(false);
        return true;
    }
}
