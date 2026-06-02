using System.Text.Json;
using System.Text.Json.Serialization;

namespace Omnux.Middleware;

internal static class FileAgentSpawnActiveRunJson
{
    private static readonly AgentSpawnActiveRunJsonContext BaseContext = new(CreateOptions(indented: false));
    private static readonly AgentSpawnActiveRunJsonContext IndentedContext = new(CreateOptions(indented: true));

    public static string SerializeState(AgentSpawnActiveRunState state, bool indented = true)
    {
        return JsonSerializer.Serialize(state, (indented ? IndentedContext : BaseContext).AgentSpawnActiveRunState);
    }

    public static AgentSpawnActiveRunState? DeserializeState(string json)
    {
        return JsonSerializer.Deserialize(json, BaseContext.AgentSpawnActiveRunState);
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
