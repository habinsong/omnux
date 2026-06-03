using System.Diagnostics;
using System.Net;
using System.Text.Json;

namespace Omnux.Middleware;

internal sealed class LocalLlmDiscoveryService
{
    private static readonly HttpClient SharedHttpClient = new()
    {
        Timeout = TimeSpan.FromSeconds(2)
    };

    private readonly HttpClient _httpClient;
    private readonly IReadOnlyList<LocalLlmEndpointConfig> _endpoints;
    private readonly Func<DateTimeOffset> _utcNow;
    private readonly Func<string, string?> _envGet;

    public LocalLlmDiscoveryService(
        HttpClient? httpClient = null,
        IReadOnlyList<LocalLlmEndpointConfig>? endpoints = null,
        Func<DateTimeOffset>? utcNow = null,
        Func<string, string?>? envGet = null
    )
    {
        _httpClient = httpClient ?? SharedHttpClient;
        _envGet = envGet ?? Env.Get;
        _endpoints = endpoints ?? BuildDefaultEndpoints(_envGet);
        _utcNow = utcNow ?? (() => DateTimeOffset.UtcNow);
    }

    public async Task<LocalLlmDiscoverySnapshot> DiscoverAsync(CancellationToken cancellationToken)
    {
        var snapshots = new List<LocalLlmEndpointSnapshot>();
        var warnings = new List<string>();
        foreach (var endpoint in _endpoints)
        {
            var snapshot = await ProbeEndpointAsync(endpoint, cancellationToken).ConfigureAwait(false);
            snapshots.Add(snapshot);
            if (snapshot.Status != "available" && !string.IsNullOrWhiteSpace(snapshot.Error))
            {
                warnings.Add($"{snapshot.Name}: {snapshot.Error}");
            }
        }

        return new LocalLlmDiscoverySnapshot(
            snapshots,
            snapshots.Count(item => item.Status == "available"),
            snapshots.Sum(item => item.ModelCount),
            snapshots.Any(item => item.Status == "available" && item.ModelCount > 0),
            LocalLlmOfflineModePolicy.Evaluate(snapshots, _envGet),
            warnings,
            _utcNow()
        );
    }

    internal static IReadOnlyList<LocalLlmEndpointConfig> BuildDefaultEndpoints(Func<string, string?>? envGet = null)
    {
        var get = envGet ?? Env.Get;
        var configured = (get("OMNUX_LOCAL_LLM_ENDPOINTS") ?? string.Empty).Trim();
        if (!string.IsNullOrWhiteSpace(configured))
        {
            return configured
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Select((url, index) => new LocalLlmEndpointConfig(
                    $"local-{index + 1}",
                    InferKind(url),
                    url
                ))
                .ToArray();
        }

        return new[]
        {
            new LocalLlmEndpointConfig("ollama", "ollama", "http://127.0.0.1:11434"),
            new LocalLlmEndpointConfig("lm-studio", "openai_compatible", "http://127.0.0.1:1234")
        };
    }

    private async Task<LocalLlmEndpointSnapshot> ProbeEndpointAsync(
        LocalLlmEndpointConfig endpoint,
        CancellationToken cancellationToken
    )
    {
        var watch = Stopwatch.StartNew();
        if (!Uri.TryCreate(endpoint.BaseUrl, UriKind.Absolute, out var baseUri)
            || (baseUri.Scheme != Uri.UriSchemeHttp && baseUri.Scheme != Uri.UriSchemeHttps))
        {
            return BuildEndpointSnapshot(endpoint, "error", Array.Empty<LocalLlmModelInfo>(), "invalid_local_llm_endpoint", 0);
        }

        try
        {
            var probeUri = BuildProbeUri(baseUri, endpoint.Kind);
            using var request = new HttpRequestMessage(HttpMethod.Get, probeUri);
            using var response = await _httpClient.SendAsync(request, cancellationToken).ConfigureAwait(false);
            var body = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
            watch.Stop();
            if (!response.IsSuccessStatusCode)
            {
                return BuildEndpointSnapshot(
                    endpoint,
                    "unavailable",
                    Array.Empty<LocalLlmModelInfo>(),
                    $"http_{(int)response.StatusCode}",
                    watch.ElapsedMilliseconds
                );
            }

            var models = endpoint.Kind == "ollama"
                ? ParseOllamaTags(body)
                : ParseOpenAiModels(body);
            return BuildEndpointSnapshot(
                endpoint,
                "available",
                models,
                string.Empty,
                watch.ElapsedMilliseconds
            );
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            watch.Stop();
            return BuildEndpointSnapshot(endpoint, "unavailable", Array.Empty<LocalLlmModelInfo>(), "timeout", watch.ElapsedMilliseconds);
        }
        catch (HttpRequestException ex)
        {
            watch.Stop();
            return BuildEndpointSnapshot(endpoint, "unavailable", Array.Empty<LocalLlmModelInfo>(), TrimError(ex.Message), watch.ElapsedMilliseconds);
        }
        catch (JsonException ex)
        {
            watch.Stop();
            return BuildEndpointSnapshot(endpoint, "error", Array.Empty<LocalLlmModelInfo>(), TrimError(ex.Message), watch.ElapsedMilliseconds);
        }
    }

    private static LocalLlmEndpointSnapshot BuildEndpointSnapshot(
        LocalLlmEndpointConfig endpoint,
        string status,
        IReadOnlyList<LocalLlmModelInfo> models,
        string error,
        long elapsedMs
    )
    {
        return new LocalLlmEndpointSnapshot(
            endpoint.Name,
            endpoint.Kind,
            endpoint.BaseUrl.TrimEnd('/'),
            status,
            models.Count,
            models,
            error,
            elapsedMs
        );
    }

    private static Uri BuildProbeUri(Uri baseUri, string kind)
    {
        var path = kind == "ollama" ? "/api/tags" : "/v1/models";
        return new Uri($"{baseUri.GetLeftPart(UriPartial.Authority).TrimEnd('/')}{path}");
    }

    internal static IReadOnlyList<LocalLlmModelInfo> ParseOllamaTags(string body)
    {
        using var doc = JsonDocument.Parse(body);
        if (!doc.RootElement.TryGetProperty("models", out var modelsElement)
            || modelsElement.ValueKind != JsonValueKind.Array)
        {
            return Array.Empty<LocalLlmModelInfo>();
        }

        var models = new List<LocalLlmModelInfo>();
        foreach (var item in modelsElement.EnumerateArray())
        {
            var id = ReadString(item, "name");
            if (string.IsNullOrWhiteSpace(id))
            {
                id = ReadString(item, "model");
            }

            if (string.IsNullOrWhiteSpace(id))
            {
                continue;
            }

            var details = item.TryGetProperty("details", out var detailsElement)
                && detailsElement.ValueKind == JsonValueKind.Object
                ? detailsElement
                : default;
            models.Add(new LocalLlmModelInfo(
                id,
                "ollama",
                details.ValueKind == JsonValueKind.Object ? ReadString(details, "family") : string.Empty,
                details.ValueKind == JsonValueKind.Object ? ReadString(details, "parameter_size") : string.Empty,
                details.ValueKind == JsonValueKind.Object ? ReadString(details, "quantization_level") : string.Empty,
                ReadInt64(item, "size"),
                ReadDate(item, "modified_at")
            ));
        }

        return models;
    }

    internal static IReadOnlyList<LocalLlmModelInfo> ParseOpenAiModels(string body)
    {
        using var doc = JsonDocument.Parse(body);
        if (!doc.RootElement.TryGetProperty("data", out var dataElement)
            || dataElement.ValueKind != JsonValueKind.Array)
        {
            return Array.Empty<LocalLlmModelInfo>();
        }

        var models = new List<LocalLlmModelInfo>();
        foreach (var item in dataElement.EnumerateArray())
        {
            var id = ReadString(item, "id");
            if (string.IsNullOrWhiteSpace(id))
            {
                continue;
            }

            models.Add(new LocalLlmModelInfo(
                id,
                ReadString(item, "owned_by"),
                string.Empty,
                string.Empty,
                string.Empty,
                null,
                null
            ));
        }

        return models;
    }

    private static string InferKind(string url)
    {
        return url.Contains("11434", StringComparison.Ordinal) ? "ollama" : "openai_compatible";
    }

    private static string ReadString(JsonElement element, string propertyName)
    {
        return element.TryGetProperty(propertyName, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString() ?? string.Empty
            : string.Empty;
    }

    private static long? ReadInt64(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var value) || value.ValueKind != JsonValueKind.Number)
        {
            return null;
        }

        return value.TryGetInt64(out var result) ? result : null;
    }

    private static DateTimeOffset? ReadDate(JsonElement element, string propertyName)
    {
        var text = ReadString(element, propertyName);
        return DateTimeOffset.TryParse(text, out var parsed) ? parsed : null;
    }

    private static string TrimError(string error)
    {
        var normalized = (error ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return "local_llm_probe_failed";
        }

        return normalized.Length <= 200 ? normalized : normalized[..200] + "...";
    }
}
