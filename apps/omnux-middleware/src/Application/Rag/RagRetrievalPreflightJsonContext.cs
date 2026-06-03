using System.Text.Json.Serialization;

namespace Omnux.Middleware;

[JsonSourceGenerationOptions(
    PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
)]
[JsonSerializable(typeof(RagRetrievalPreflightSnapshot))]
[JsonSerializable(typeof(RagRetrievalCandidate))]
internal partial class RagRetrievalPreflightJsonContext : JsonSerializerContext
{
}
