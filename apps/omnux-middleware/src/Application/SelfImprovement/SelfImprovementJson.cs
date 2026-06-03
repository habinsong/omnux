using System.Text.Json;
using System.Text.Json.Serialization;

namespace Omnux.Middleware;

internal static class SelfImprovementJson
{
    private static readonly SelfImprovementJsonContext BaseContext = new(new JsonSerializerOptions(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    });

    public static string SerializeSnapshot(SelfImprovementSnapshot snapshot)
    {
        return JsonSerializer.Serialize(snapshot, BaseContext.SelfImprovementSnapshot);
    }
}
