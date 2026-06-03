using System.Text.Json.Serialization;

namespace Omnux.Middleware;

[JsonSourceGenerationOptions(
    PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
)]
[JsonSerializable(typeof(SessionReplayQuery))]
[JsonSerializable(typeof(SessionReplayEvent))]
[JsonSerializable(typeof(SessionReplaySummary))]
[JsonSerializable(typeof(SessionReplaySnapshot))]
[JsonSerializable(typeof(SessionReplayActionResult))]
internal partial class SessionReplayJsonContext : JsonSerializerContext
{
}
