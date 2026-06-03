using System.Text.Json.Serialization;

namespace Omnux.Middleware;

[JsonSourceGenerationOptions(
    PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
)]
[JsonSerializable(typeof(LocalLlmDiscoverySnapshot))]
[JsonSerializable(typeof(LocalLlmEndpointSnapshot))]
[JsonSerializable(typeof(LocalLlmModelInfo))]
[JsonSerializable(typeof(LocalLlmOfflineModeReadiness))]
[JsonSerializable(typeof(LocalLlmOfflineModeCheck))]
internal partial class LocalLlmDiscoveryJsonContext : JsonSerializerContext
{
}
