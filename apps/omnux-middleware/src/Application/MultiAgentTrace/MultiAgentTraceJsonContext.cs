using System.Text.Json.Serialization;

namespace Omnux.Middleware;

[JsonSourceGenerationOptions(
    PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
)]
[JsonSerializable(typeof(MultiAgentTraceSnapshot))]
[JsonSerializable(typeof(MultiAgentTraceAgent))]
[JsonSerializable(typeof(MultiAgentTraceThread))]
[JsonSerializable(typeof(MultiAgentTraceMessage))]
[JsonSerializable(typeof(MultiAgentTraceEdge))]
[JsonSerializable(typeof(MultiAgentTraceIntervention))]
internal partial class MultiAgentTraceJsonContext : JsonSerializerContext
{
}
