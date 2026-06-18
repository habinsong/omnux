using System.Net.Http.Headers;

namespace Omnux.Middleware;

// Codex(OpenAI)는 보통 CLI 로그인 인증이라 표준 /models가 없다.
// Codex/OpenAI API 키가 설정된 경우에만 GET https://api.openai.com/v1/models 에서
// gpt-5* / *codex* 채팅 모델을 라이브로 가져오고, 그 외에는 검증된 정적 폴백을 반환한다.
public sealed class CodexModelCatalog : IDisposable
{
    private const string OpenAiModelsEndpoint = "https://api.openai.com/v1/models";

    private static readonly string[] StaticFallback = ModelRegistry.GetFallbackModels("codex").ToArray();

    private readonly RuntimeSettings _runtimeSettings;
    private readonly HttpClient _httpClient;

    public CodexModelCatalog(RuntimeSettings runtimeSettings)
    {
        _runtimeSettings = runtimeSettings;
        _httpClient = new HttpClient { Timeout = TimeSpan.FromSeconds(20) };
    }

    public async Task<IReadOnlyList<string>> GetModelIdsAsync(CancellationToken cancellationToken)
    {
        var apiKey = _runtimeSettings.GetCodexApiKey();
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            return StaticFallback;
        }

        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, OpenAiModelsEndpoint);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
            using var response = await _httpClient.SendAsync(request, cancellationToken);
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                Console.Error.WriteLine($"[codex] models fetch failed ({(int)response.StatusCode}): {body}");
                return StaticFallback;
            }

            var ids = OpenAiModelIdParser.Parse(body)
                .Where(IsCodexRelevant)
                .ToArray();
            return ids.Length > 0 ? ids : StaticFallback;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[codex] models fetch error: {ex.Message}");
            return StaticFallback;
        }
    }

    private static bool IsCodexRelevant(string id)
        => id.StartsWith("gpt-5", StringComparison.OrdinalIgnoreCase)
           || id.Contains("codex", StringComparison.OrdinalIgnoreCase);

    public void Dispose() => _httpClient.Dispose();
}
