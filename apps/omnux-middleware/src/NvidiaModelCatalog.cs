using System.Net.Http.Headers;
using System.Text.Json;

namespace Omnux.Middleware;

// NVIDIA NIM은 OpenAI 호환 API → GET {NvidiaBaseUrl}/models 의 data[].id 를 라이브로 가져온다.
// API 키가 없거나 실패하면 정적 폴백(검증된 2026-06 목록)을 반환한다.
public sealed class NvidiaModelCatalog : IDisposable
{
    private static readonly string[] StaticFallback =
    {
        "meta/llama-3.1-70b-instruct",
        "meta/llama-3.3-70b-instruct",
        "nvidia/llama-3.3-nemotron-super-49b-v1.5",
        "openai/gpt-oss-120b"
    };

    private readonly ProviderOptions _providers;
    private readonly RuntimeSettings _runtimeSettings;
    private readonly HttpClient _httpClient;

    public NvidiaModelCatalog(ProviderOptions providers, RuntimeSettings runtimeSettings)
    {
        _providers = providers;
        _runtimeSettings = runtimeSettings;
        _httpClient = new HttpClient { Timeout = TimeSpan.FromSeconds(20) };
    }

    public async Task<IReadOnlyList<string>> GetModelIdsAsync(CancellationToken cancellationToken)
    {
        var apiKey = _runtimeSettings.GetNvidiaApiKey();
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            return StaticFallback;
        }

        try
        {
            var endpoint = $"{_providers.NvidiaBaseUrl.TrimEnd('/')}/models";
            using var request = new HttpRequestMessage(HttpMethod.Get, endpoint);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
            using var response = await _httpClient.SendAsync(request, cancellationToken);
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                Console.Error.WriteLine($"[nvidia] models fetch failed ({(int)response.StatusCode}): {body}");
                return StaticFallback;
            }

            var ids = OpenAiModelIdParser.Parse(body);
            return ids.Count > 0 ? ids : StaticFallback;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[nvidia] models fetch error: {ex.Message}");
            return StaticFallback;
        }
    }

    public void Dispose() => _httpClient.Dispose();
}

// OpenAI 호환 /models 응답({ "data": [ { "id": ... } ] })에서 id 목록을 파싱한다(Groq/NVIDIA/Codex 공용).
internal static class OpenAiModelIdParser
{
    public static IReadOnlyList<string> Parse(string json)
    {
        var ids = new List<string>();
        if (string.IsNullOrWhiteSpace(json))
        {
            return ids;
        }

        try
        {
            using var doc = JsonDocument.Parse(json);
            if (!doc.RootElement.TryGetProperty("data", out var data) || data.ValueKind != JsonValueKind.Array)
            {
                return ids;
            }

            foreach (var item in data.EnumerateArray())
            {
                if (item.ValueKind != JsonValueKind.Object)
                {
                    continue;
                }

                if (item.TryGetProperty("id", out var idEl) && idEl.GetString() is { Length: > 0 } id)
                {
                    ids.Add(id);
                }
            }
        }
        catch (JsonException)
        {
        }

        return ids
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(x => x, StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }
}
