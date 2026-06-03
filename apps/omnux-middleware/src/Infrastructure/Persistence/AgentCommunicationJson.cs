using System.Text.Json;
using System.Text.Json.Serialization;

namespace Omnux.Middleware;

internal static class AgentCommunicationJson
{
    private static readonly AgentCommunicationJsonContext BaseContext = new(CreateOptions(indented: false));
    private static readonly AgentCommunicationJsonContext IndentedContext = new(CreateOptions(indented: true));

    public static string SerializeState(AgentCommunicationState state, bool indented = true)
    {
        return JsonSerializer.Serialize(state, (indented ? IndentedContext : BaseContext).AgentCommunicationState);
    }

    public static string SerializeSnapshot(AgentCommunicationSnapshot snapshot, bool indented = false)
    {
        return JsonSerializer.Serialize(snapshot, (indented ? IndentedContext : BaseContext).AgentCommunicationSnapshot);
    }

    public static string SerializeActionResult(AgentCommunicationActionResult result, bool indented = false)
    {
        return JsonSerializer.Serialize(result, (indented ? IndentedContext : BaseContext).AgentCommunicationActionResult);
    }

    public static AgentCommunicationState? DeserializeState(string json)
    {
        return JsonSerializer.Deserialize(json, BaseContext.AgentCommunicationState);
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
