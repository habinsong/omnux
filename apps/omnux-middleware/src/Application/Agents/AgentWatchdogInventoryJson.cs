using System.Text.Json;
using System.Text.Json.Serialization;

namespace Omnux.Middleware;

internal static class AgentWatchdogInventoryJson
{
    private static readonly AgentWatchdogInventoryJsonContext BaseContext = new(new JsonSerializerOptions(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    });

    public static string SerializeSnapshot(AgentWatchdogInventorySnapshot snapshot)
    {
        return JsonSerializer.Serialize(snapshot, BaseContext.AgentWatchdogInventorySnapshot);
    }
}
