using System.Net.WebSockets;

namespace Omnux.Middleware;

internal sealed class WsLocalLlmCommandDispatcher
{
    private readonly LocalLlmDiscoveryService _discoveryService;

    public WsLocalLlmCommandDispatcher(LocalLlmDiscoveryService discoveryService)
    {
        _discoveryService = discoveryService;
    }

    public async Task<bool> TryHandleAsync(
        WebSocketGateway.ClientMessage message,
        WebSocket socket,
        SemaphoreSlim sendLock,
        CancellationToken cancellationToken
    )
    {
        if (message.Type != "local_llm_snapshot_get")
        {
            return false;
        }

        var snapshot = await _discoveryService.DiscoverAsync(cancellationToken).ConfigureAwait(false);
        await WebSocketGateway.SendTextAsync(
            socket,
            sendLock,
            "{"
            + "\"type\":\"local_llm_snapshot\","
            + $"\"payload\":{LocalLlmDiscoveryJson.SerializeSnapshot(snapshot)}"
            + "}",
            cancellationToken
        ).ConfigureAwait(false);
        return true;
    }
}
