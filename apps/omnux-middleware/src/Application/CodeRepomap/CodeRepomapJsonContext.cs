using System.Text.Json.Serialization;

namespace Omnux.Middleware;

[JsonSourceGenerationOptions(
    PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
)]
[JsonSerializable(typeof(CodeRepomapSnapshot))]
[JsonSerializable(typeof(CodeRepomapFile))]
[JsonSerializable(typeof(CodeRepomapSymbol))]
internal partial class CodeRepomapJsonContext : JsonSerializerContext
{
}
