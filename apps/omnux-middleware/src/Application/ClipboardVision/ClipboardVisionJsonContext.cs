using System.Text.Json.Serialization;

namespace Omnux.Middleware;

[JsonSourceGenerationOptions(
    PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
)]
[JsonSerializable(typeof(ClipboardVisionPreflightSnapshot))]
[JsonSerializable(typeof(ClipboardVisionImage))]
[JsonSerializable(typeof(ClipboardVisionProviderCandidate))]
[JsonSerializable(typeof(ClipboardVisionCheck))]
internal partial class ClipboardVisionJsonContext : JsonSerializerContext
{
}
