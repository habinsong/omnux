using System.Net.WebSockets;

namespace Omnux.Middleware;

internal sealed class WsAgentWorktreeCommandDispatcher
{
    private readonly AgentWorktreeSnapshotService _snapshotService;

    public WsAgentWorktreeCommandDispatcher(AgentWorktreeSnapshotService snapshotService)
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
        if (message.Type != "agent_worktree_snapshot_get")
        {
            return false;
        }

        var snapshot = _snapshotService.GetSnapshot();
        await WebSocketGateway.SendTextAsync(
            socket,
            sendLock,
            "{"
            + "\"type\":\"agent_worktree_snapshot\","
            + $"\"payload\":{AgentWorktreeSnapshotJson.SerializeSnapshot(snapshot)}"
            + "}",
            cancellationToken
        ).ConfigureAwait(false);
        return true;
    }
}
