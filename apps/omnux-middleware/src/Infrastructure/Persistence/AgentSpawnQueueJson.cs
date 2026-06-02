using System.Text.Json;
using System.Text.Json.Serialization;

namespace Omnux.Middleware;

internal static class FileAgentSpawnQueueJson
{
    private static readonly AgentSpawnQueueJsonContext BaseContext = new(CreateOptions(indented: false));
    private static readonly AgentSpawnQueueJsonContext IndentedContext = new(CreateOptions(indented: true));

    public static string SerializeState(AgentSpawnQueueState state, bool indented = true)
    {
        return JsonSerializer.Serialize(state, (indented ? IndentedContext : BaseContext).AgentSpawnQueueState);
    }

    public static AgentSpawnQueueState? DeserializeState(string json)
    {
        return JsonSerializer.Deserialize(json, BaseContext.AgentSpawnQueueState);
    }

    private static JsonSerializerOptions CreateOptions(bool indented)
    {
        return new JsonSerializerOptions(JsonSerializerDefaults.Web)
        {
            WriteIndented = indented,
            DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
        };
    }
}
