using System.Net.WebSockets;

namespace Omnux.Middleware;

internal sealed class WsMcpCommandDispatcher
{
    private readonly McpConfigDiscoveryService _discoveryService;

    public WsMcpCommandDispatcher(McpConfigDiscoveryService discoveryService)
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
        if (message.Type != "mcp_servers_list")
        {
            return false;
        }

        var snapshot = _discoveryService.Discover();
        await WebSocketGateway.SendTextAsync(
            socket,
            sendLock,
            "{"
            + "\"type\":\"mcp_servers_snapshot\","
            + $"\"payload\":{McpDiscoveryJson.SerializeSnapshot(snapshot)}"
            + "}",
            cancellationToken
        );
        return true;
    }
}
