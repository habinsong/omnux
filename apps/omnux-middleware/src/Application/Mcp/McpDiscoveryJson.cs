using System.Text.Json;
using System.Text.Json.Serialization;

namespace Omnux.Middleware;

internal static class McpDiscoveryJson
{
    private static readonly McpDiscoveryJsonContext BaseContext = new(new JsonSerializerOptions(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    });

    public static string SerializeSnapshot(McpDiscoverySnapshot snapshot)
    {
        return JsonSerializer.Serialize(snapshot, BaseContext.McpDiscoverySnapshot);
    }
}
