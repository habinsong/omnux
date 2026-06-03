using System.Net.WebSockets;

namespace Omnux.Middleware;

internal sealed class WsGitAutomationCommandDispatcher
{
    private readonly GitAutomationSnapshotService _snapshotService;

    public WsGitAutomationCommandDispatcher(GitAutomationSnapshotService snapshotService)
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
        if (message.Type != "git_automation_snapshot_get")
        {
            return false;
        }

        var snapshot = await _snapshotService.GetSnapshotAsync(message.Limit, cancellationToken)
            .ConfigureAwait(false);
        await WebSocketGateway.SendTextAsync(
            socket,
            sendLock,
            "{"
            + "\"type\":\"git_automation_snapshot\","
            + $"\"payload\":{GitAutomationJson.SerializeSnapshot(snapshot)}"
            + "}",
            cancellationToken
        ).ConfigureAwait(false);
        return true;
    }
}
