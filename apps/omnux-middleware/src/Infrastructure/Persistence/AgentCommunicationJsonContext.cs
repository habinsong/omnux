using System.Text.Json.Serialization;

namespace Omnux.Middleware;

[JsonSourceGenerationOptions(
    PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
)]
[JsonSerializable(typeof(AgentCommunicationState))]
[JsonSerializable(typeof(AgentCommunicationSnapshot))]
[JsonSerializable(typeof(AgentCommunicationActionResult))]
[JsonSerializable(typeof(AgentCommunicationMessage))]
[JsonSerializable(typeof(AgentBoardEntry))]
[JsonSerializable(typeof(AgentLifecycleEvent))]
internal partial class AgentCommunicationJsonContext : JsonSerializerContext
{
}
