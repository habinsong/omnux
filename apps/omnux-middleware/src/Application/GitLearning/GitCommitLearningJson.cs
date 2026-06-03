using System.Text.Json;
using System.Text.Json.Serialization;

namespace Omnux.Middleware;

internal static class GitCommitLearningJson
{
    private static readonly GitCommitLearningJsonContext BaseContext = new(new JsonSerializerOptions(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    });

    public static string SerializeSnapshot(GitCommitLearningSnapshot snapshot)
    {
        return JsonSerializer.Serialize(snapshot, BaseContext.GitCommitLearningSnapshot);
    }
}
