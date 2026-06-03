using System.Text.Json.Serialization;

namespace Omnux.Middleware;

[JsonSourceGenerationOptions(
    PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
)]
[JsonSerializable(typeof(GitAutomationSnapshot))]
[JsonSerializable(typeof(GitAutomationChangedFile))]
[JsonSerializable(typeof(GitAutomationReadiness))]
[JsonSerializable(typeof(GitAutomationRemoteSnapshot))]
[JsonSerializable(typeof(GitAutomationToolchainSnapshot))]
[JsonSerializable(typeof(GitAutomationToolSnapshot))]
[JsonSerializable(typeof(GitAutomationPublishReadiness))]
internal partial class GitAutomationJsonContext : JsonSerializerContext
{
}
