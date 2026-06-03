using System.Net.WebSockets;

namespace Omnux.Middleware;

internal sealed class WsGitTimeMachineCommandDispatcher
{
    private readonly GitTimeMachineSnapshotService _snapshotService;

    public WsGitTimeMachineCommandDispatcher(GitTimeMachineSnapshotService snapshotService)
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
        if (message.Type != "git_time_machine_snapshot_get")
        {
            return false;
        }

        var snapshot = await _snapshotService.GetSnapshotAsync(message.Limit, cancellationToken)
            .ConfigureAwait(false);
        await WebSocketGateway.SendTextAsync(
            socket,
            sendLock,
            "{"
            + "\"type\":\"git_time_machine_snapshot\","
            + $"\"payload\":{GitTimeMachineJson.SerializeSnapshot(snapshot)}"
            + "}",
            cancellationToken
        ).ConfigureAwait(false);
        return true;
    }
}
