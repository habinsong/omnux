using System.Text.Json;

namespace Omnux.Middleware;

// Gemini는 Google ListModels(GET {GeminiBaseUrl}/models?key=KEY) — OpenAI 형식과 다르다.
// models[].name 에서 "models/" 접두사를 떼고, generateContent 지원 + 임베딩/이미지 모델은 제외한다.
// API 키가 없거나 실패하면 정적 폴백(검증된 2026-06 목록)을 반환한다.
public sealed class GeminiModelCatalog : IDisposable
{
    private static readonly string[] StaticFallback =
    {
        "gemini-3.5-flash",
        "gemini-3.1-pro",
        "gemini-3-flash",
        "gemini-3.1-flash-lite",
        "gemini-2.5-pro",
        "gemini-2.5-flash",
        "gemini-2.5-flash-lite"
    };

    private readonly ProviderOptions _providers;
    private readonly RuntimeSettings _runtimeSettings;
    private readonly HttpClient _httpClient;

    public GeminiModelCatalog(ProviderOptions providers, RuntimeSettings runtimeSettings)
    {
        _providers = providers;
        _runtimeSettings = runtimeSettings;
        _httpClient = new HttpClient { Timeout = TimeSpan.FromSeconds(20) };
    }

    public async Task<IReadOnlyList<string>> GetModelIdsAsync(CancellationToken cancellationToken)
    {
        var apiKey = _runtimeSettings.GetGeminiApiKey();
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            return StaticFallback;
        }

        try
        {
            var baseUrl = _providers.GeminiBaseUrl.TrimEnd('/');
            var endpoint = $"{baseUrl}/models?pageSize=1000&key={Uri.EscapeDataString(apiKey)}";
            using var response = await _httpClient.GetAsync(endpoint, cancellationToken);
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                Console.Error.WriteLine($"[gemini] models fetch failed ({(int)response.StatusCode}): {body}");
                return StaticFallback;
            }

            var ids = ParseModelIds(body);
            return ids.Count > 0 ? ids : StaticFallback;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[gemini] models fetch error: {ex.Message}");
            return StaticFallback;
        }
    }

    internal static IReadOnlyList<string> ParseModelIds(string json)
    {
        var ids = new List<string>();
        if (string.IsNullOrWhiteSpace(json))
        {
            return ids;
        }

        try
        {
            using var doc = JsonDocument.Parse(json);
            if (!doc.RootElement.TryGetProperty("models", out var models) || models.ValueKind != JsonValueKind.Array)
            {
                return ids;
            }

            foreach (var model in models.EnumerateArray())
            {
                if (model.ValueKind != JsonValueKind.Object)
                {
                    continue;
                }

                if (!SupportsGenerateContent(model))
                {
                    continue;
                }

                var name = model.TryGetProperty("name", out var nameEl) ? nameEl.GetString() : null;
                if (string.IsNullOrWhiteSpace(name))
                {
                    continue;
                }

                var id = name.StartsWith("models/", StringComparison.OrdinalIgnoreCase)
                    ? name["models/".Length..]
                    : name;

                // 화이트리스트: gemini- 접두사 모델만 허용 (Gemma, PaLM, MedLM 등 비-Gemini 제외)
                if (!id.StartsWith("gemini-", StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                if (id.Contains("embedding", StringComparison.OrdinalIgnoreCase)
                    || id.Contains("imagen", StringComparison.OrdinalIgnoreCase)
                    || id.Contains("aqa", StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                ids.Add(id);
            }
        }
        catch (JsonException)
        {
        }

        return ids
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderByDescending(x => x, StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    private static bool SupportsGenerateContent(JsonElement model)
    {
        if (!model.TryGetProperty("supportedGenerationMethods", out var methods) || methods.ValueKind != JsonValueKind.Array)
        {
            return false;
        }

        foreach (var method in methods.EnumerateArray())
        {
            if (method.ValueKind == JsonValueKind.String
                && string.Equals(method.GetString(), "generateContent", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        return false;
    }

    public void Dispose() => _httpClient.Dispose();
}
