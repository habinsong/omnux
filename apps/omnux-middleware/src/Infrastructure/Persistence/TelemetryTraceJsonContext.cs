using System.Text.Json.Serialization;

namespace Omnux.Middleware;

[JsonSourceGenerationOptions(
    PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
)]
[JsonSerializable(typeof(TelemetryTraceState))]
[JsonSerializable(typeof(TelemetryTraceEvent))]
[JsonSerializable(typeof(TelemetrySnapshot))]
[JsonSerializable(typeof(TelemetryTokenRollup))]
[JsonSerializable(typeof(TelemetryProviderRollup))]
[JsonSerializable(typeof(TelemetryActionResult))]
internal partial class TelemetryTraceJsonContext : JsonSerializerContext
{
}
