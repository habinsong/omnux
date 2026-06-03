using System.Text.Json.Serialization;

namespace Omnux.Middleware;

[JsonSourceGenerationOptions(
    PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
)]
[JsonSerializable(typeof(SelfImprovementSnapshot))]
[JsonSerializable(typeof(SelfImprovementProposal))]
internal partial class SelfImprovementJsonContext : JsonSerializerContext
{
}
