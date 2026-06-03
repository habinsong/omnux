using System.Text.Json.Serialization;

namespace Omnux.Middleware;

[JsonSourceGenerationOptions(
    PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
)]
[JsonSerializable(typeof(GitAutomationSnapshot))]
[JsonSerializable(typeof(GitAutomationChangedFile))]
[JsonSerializable(typeof(GitAutomationReadiness))]
internal partial class GitAutomationJsonContext : JsonSerializerContext
{
}
