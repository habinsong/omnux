using System.Text.Json.Serialization;

namespace Omnux.Middleware;

[JsonSourceGenerationOptions(
    PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
)]
[JsonSerializable(typeof(AgentWatchdogInventorySnapshot))]
[JsonSerializable(typeof(AgentWatchdogRunItem))]
[JsonSerializable(typeof(AgentWatchdogInventoryCheck))]
internal partial class AgentWatchdogInventoryJsonContext : JsonSerializerContext
{
}
