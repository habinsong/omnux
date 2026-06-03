using System.Text.Json;
using System.Text.Json.Serialization;

namespace Omnux.Middleware;

internal static class GitTimeMachineJson
{
    private static readonly GitTimeMachineJsonContext BaseContext = new(new JsonSerializerOptions(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    });

    public static string SerializeSnapshot(GitTimeMachineSnapshot snapshot)
    {
        return JsonSerializer.Serialize(snapshot, BaseContext.GitTimeMachineSnapshot);
    }
}
