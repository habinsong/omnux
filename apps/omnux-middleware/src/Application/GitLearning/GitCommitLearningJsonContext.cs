using System.Text.Json.Serialization;

namespace Omnux.Middleware;

[JsonSourceGenerationOptions(
    PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
)]
[JsonSerializable(typeof(GitCommitLearningSnapshot))]
[JsonSerializable(typeof(GitCommitLearningEntry))]
[JsonSerializable(typeof(GitCommitIntentRollup))]
[JsonSerializable(typeof(GitCommitFileHotspot))]
internal partial class GitCommitLearningJsonContext : JsonSerializerContext
{
}
