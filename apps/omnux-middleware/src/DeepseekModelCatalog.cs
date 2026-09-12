using System.Net.Http.Headers;

namespace Omnux.Middleware;

// DeepSeek 공식 API는 OpenAI 호환 규격이다 → GET {DeepseekBaseUrl}/models 의 data[].id 를 라이브로 가져온다.
// API 키가 없거나 실패하면 정적 폴백(model-registry.json)을 반환한다.
//
// 모델 id 메모(2026-09 기준, api-docs.deepseek.com 확인):
//   deepseek-flash    최신 V4.1 Flash 를 부르는 정식 호출명
//   deepseek-v4-pro   플래그십
//   deepseek-v4-flash 레거시 별칭. 요청은 V4.1 Flash 로 서빙되고 Flash 요금이 적용된다
public sealed class DeepseekModelCatalog : IDisposable
{
    private static readonly string[] StaticFallback = ModelRegistry.GetFallbackModels("deepseek").ToArray();

    private readonly ProviderOptions _providers;
    private readonly RuntimeSettings _runtimeSettings;
    private readonly HttpClient _httpClient;

    public DeepseekModelCatalog(ProviderOptions providers, RuntimeSettings runtimeSettings)
    {
        _providers = providers;
        _runtimeSettings = runtimeSettings;
        _httpClient = new HttpClient { Timeout = TimeSpan.FromSeconds(20) };
    }

    public async Task<IReadOnlyList<string>> GetModelIdsAsync(CancellationToken cancellationToken)
    {
        var apiKey = _runtimeSettings.GetDeepseekApiKey();
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            return StaticFallback;
        }

        try
        {
            var endpoint = $"{_providers.DeepseekBaseUrl.TrimEnd('/')}/models";
            using var request = new HttpRequestMessage(HttpMethod.Get, endpoint);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
            using var response = await _httpClient.SendAsync(request, cancellationToken);
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                Console.Error.WriteLine($"[deepseek] models fetch failed ({(int)response.StatusCode}): {body}");
                return StaticFallback;
            }

            var ids = OpenAiModelIdParser.Parse(body);
            return ids.Count > 0 ? ids : StaticFallback;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[deepseek] models fetch error: {ex.Message}");
            return StaticFallback;
        }
    }

    public void Dispose() => _httpClient.Dispose();
}
