using System.Net.WebSockets;

namespace Omnux.Middleware;

internal sealed class WsSemanticSearchCommandDispatcher
{
    private readonly SemanticSearchReadinessService _readinessService;

    public WsSemanticSearchCommandDispatcher(SemanticSearchReadinessService readinessService)
    {
        _readinessService = readinessService;
    }

    public async Task<bool> TryHandleAsync(
        WebSocketGateway.ClientMessage message,
        WebSocket socket,
        SemaphoreSlim sendLock,
        CancellationToken cancellationToken
    )
    {
        if (message.Type != "semantic_search_readiness_get")
        {
            return false;
        }

        var snapshot = await _readinessService.GetSnapshotAsync(cancellationToken)
            .ConfigureAwait(false);
        await WebSocketGateway.SendTextAsync(
            socket,
            sendLock,
            "{"
            + "\"type\":\"semantic_search_readiness_snapshot\","
            + $"\"payload\":{SemanticSearchReadinessJson.SerializeSnapshot(snapshot)}"
            + "}",
            cancellationToken
        ).ConfigureAwait(false);
        return true;
    }
}
