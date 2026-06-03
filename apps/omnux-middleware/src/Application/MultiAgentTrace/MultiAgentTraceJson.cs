using System.Text.Json;
using System.Text.Json.Serialization;

namespace Omnux.Middleware;

internal static class MultiAgentTraceJson
{
    private static readonly MultiAgentTraceJsonContext BaseContext = new(new JsonSerializerOptions(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    });

    public static string SerializeSnapshot(MultiAgentTraceSnapshot snapshot)
    {
        return JsonSerializer.Serialize(snapshot, BaseContext.MultiAgentTraceSnapshot);
    }
}
