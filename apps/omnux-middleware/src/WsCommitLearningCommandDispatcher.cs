using System.Net.WebSockets;

namespace Omnux.Middleware;

internal sealed class WsCommitLearningCommandDispatcher
{
    private readonly GitCommitHistoryScanner _scanner;

    public WsCommitLearningCommandDispatcher(GitCommitHistoryScanner scanner)
    {
        _scanner = scanner;
    }

    public async Task<bool> TryHandleAsync(
        WebSocketGateway.ClientMessage message,
        WebSocket socket,
        SemaphoreSlim sendLock,
        CancellationToken cancellationToken
    )
    {
        if (message.Type != "commit_learning_snapshot_get")
        {
            return false;
        }

        var snapshot = await _scanner.GetSnapshotAsync(message.Limit, cancellationToken).ConfigureAwait(false);
        await WebSocketGateway.SendTextAsync(
            socket,
            sendLock,
            "{"
            + "\"type\":\"commit_learning_snapshot\","
            + $"\"payload\":{GitCommitLearningJson.SerializeSnapshot(snapshot)}"
            + "}",
            cancellationToken
        ).ConfigureAwait(false);
        return true;
    }
}
