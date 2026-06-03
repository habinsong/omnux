using System.Text.Json;
using System.Text.Json.Serialization;

namespace Omnux.Middleware;

internal static class SemanticSearchReadinessJson
{
    private static readonly SemanticSearchReadinessJsonContext BaseContext = new(new JsonSerializerOptions(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    });

    public static string SerializeSnapshot(SemanticSearchReadinessSnapshot snapshot)
    {
        return JsonSerializer.Serialize(snapshot, BaseContext.SemanticSearchReadinessSnapshot);
    }
}
