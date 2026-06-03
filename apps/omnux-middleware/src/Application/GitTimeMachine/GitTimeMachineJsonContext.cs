using System.Text.Json.Serialization;

namespace Omnux.Middleware;

[JsonSourceGenerationOptions(
    PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
)]
[JsonSerializable(typeof(GitTimeMachineSnapshot))]
[JsonSerializable(typeof(GitTimeMachineCheckpoint))]
[JsonSerializable(typeof(GitTimeMachineReadiness))]
[JsonSerializable(typeof(GitTimeMachineCheck))]
internal partial class GitTimeMachineJsonContext : JsonSerializerContext
{
}
