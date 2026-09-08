using System.Text.Json.Serialization;

namespace Omnux.Middleware;

internal sealed record PlaywrightHostRequest(
    string RequestId,
    string Action,
    string Profile,
    string Surface,
    string? Url = null,
    string? TargetId = null,
    int? Limit = null,
    string? JavaScript = null,
    string? Jsonl = null,
    string? OutputFormat = null,
    int? MaxWidth = null
);

[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase, DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull)]
[JsonSerializable(typeof(PlaywrightHostRequest))]
internal partial class PlaywrightHostJsonContext : JsonSerializerContext;
