using System.Text.Json;
using System.Text.Json.Serialization;

namespace Omnux.Middleware;

internal static class LocalLlmDiscoveryJson
{
    private static readonly LocalLlmDiscoveryJsonContext BaseContext = new(new JsonSerializerOptions(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    });

    public static string SerializeSnapshot(LocalLlmDiscoverySnapshot snapshot)
    {
        return JsonSerializer.Serialize(snapshot, BaseContext.LocalLlmDiscoverySnapshot);
    }
}
