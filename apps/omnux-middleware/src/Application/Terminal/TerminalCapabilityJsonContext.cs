using System.Text.Json.Serialization;

namespace Omnux.Middleware;

[JsonSourceGenerationOptions(
    PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
)]
[JsonSerializable(typeof(TerminalCapabilitySnapshot))]
[JsonSerializable(typeof(TerminalCapabilityItem))]
[JsonSerializable(typeof(TerminalCapabilityCheck))]
internal partial class TerminalCapabilityJsonContext : JsonSerializerContext
{
}
