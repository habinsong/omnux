using System.Text.Json.Serialization;

namespace Omnux.Middleware;

[JsonSourceGenerationOptions(
    PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
)]
[JsonSerializable(typeof(McpDiscoverySnapshot))]
[JsonSerializable(typeof(McpConfigFileDiscovery))]
[JsonSerializable(typeof(McpServerDiscovery))]
[JsonSerializable(typeof(McpServerReadiness))]
[JsonSerializable(typeof(McpServerReadinessCheck))]
[JsonSerializable(typeof(McpDiscoveryError))]
internal partial class McpDiscoveryJsonContext : JsonSerializerContext
{
}
