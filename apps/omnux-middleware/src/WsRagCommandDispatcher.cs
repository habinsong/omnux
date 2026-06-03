using System.Net.WebSockets;

namespace Omnux.Middleware;

internal sealed class WsRagCommandDispatcher
{
    private readonly RagRetrievalPreflightPolicy _preflightPolicy;

    public WsRagCommandDispatcher(RagRetrievalPreflightPolicy preflightPolicy)
    {
        _preflightPolicy = preflightPolicy;
    }

    public async Task<bool> TryHandleAsync(
        WebSocketGateway.ClientMessage message,
        WebSocket socket,
        SemaphoreSlim sendLock,
        CancellationToken cancellationToken
    )
    {
        if (message.Type != "rag_retrieval_preflight")
        {
            return false;
        }

        var query = string.IsNullOrWhiteSpace(message.Query)
            ? string.IsNullOrWhiteSpace(message.Text) ? message.Message : message.Text
            : message.Query;
        var snapshot = _preflightPolicy.Evaluate(query);
        await WebSocketGateway.SendTextAsync(
            socket,
            sendLock,
            "{"
            + "\"type\":\"rag_retrieval_preflight_snapshot\","
            + $"\"payload\":{RagRetrievalPreflightJson.SerializeSnapshot(snapshot)}"
            + "}",
            cancellationToken
        ).ConfigureAwait(false);
        return true;
    }
}
