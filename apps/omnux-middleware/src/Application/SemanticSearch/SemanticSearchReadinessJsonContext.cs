using System.Text.Json.Serialization;

namespace Omnux.Middleware;

[JsonSourceGenerationOptions(
    PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
)]
[JsonSerializable(typeof(SemanticSearchReadinessSnapshot))]
[JsonSerializable(typeof(SemanticSearchIndexSnapshot))]
[JsonSerializable(typeof(SemanticSearchSourceCount))]
[JsonSerializable(typeof(SemanticSearchEmbeddingSnapshot))]
[JsonSerializable(typeof(SemanticSearchEmbeddingCandidate))]
[JsonSerializable(typeof(SemanticSearchReadinessCheck))]
[JsonSerializable(typeof(SemanticSearchRecommendation))]
internal partial class SemanticSearchReadinessJsonContext : JsonSerializerContext
{
}
