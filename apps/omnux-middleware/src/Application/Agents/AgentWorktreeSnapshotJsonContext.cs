using System.Text.Json.Serialization;

namespace Omnux.Middleware;

[JsonSourceGenerationOptions(
    PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
)]
[JsonSerializable(typeof(AgentWorktreeSnapshot))]
[JsonSerializable(typeof(AgentWorktreeItem))]
[JsonSerializable(typeof(AgentWorktreeReadiness))]
[JsonSerializable(typeof(AgentWorktreeCheck))]
internal partial class AgentWorktreeSnapshotJsonContext : JsonSerializerContext
{
}
