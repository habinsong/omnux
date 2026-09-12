using System.Net.Http.Headers;
using System.Text;

namespace Omnux.Middleware;

/// <summary>
/// Groq compound 모델을 웹 검색 retriever 로 쓴다. compound 는 서버측에서 웹 검색을 수행하고
/// 그 근거를 executed_tools[].search_results 로 돌려주므로, Gemini grounding 키가 없거나
/// 쿼터·타임아웃으로 죽었을 때의 폴백이 된다.
///
/// GroqCompoundResponseParser 는 예전부터 있었지만 어디에도 연결돼 있지 않아 죽은 코드였다.
/// 그래서 Gemini 키가 없으면 웹 검색 경로 전체가 멈췄다.
/// </summary>
public sealed class GroqCompoundRetriever : ISearchRetriever
{
    private const int DefaultTimeoutSeconds = 30;

    private readonly ProviderOptions _providers;
    private readonly RuntimeSettings _runtimeSettings;
    private readonly HttpClient _httpClient;

    public GroqCompoundRetriever(
        ProviderOptions providers,
        RuntimeSettings runtimeSettings,
        HttpClient? httpClient = null
    )
    {
        _providers = providers;
        _runtimeSettings = runtimeSettings;
        _httpClient = httpClient ?? new HttpClient { Timeout = TimeSpan.FromSeconds(DefaultTimeoutSeconds) };
    }

    public async Task<GeminiGroundedRetrieverResult> RetrieveAsync(
        SearchRequest request,
        int maxResults,
        CancellationToken cancellationToken = default
    )
    {
        var apiKey = (_runtimeSettings.GetGroqApiKey() ?? string.Empty).Trim();
        if (apiKey.Length == 0)
        {
            return new GeminiGroundedRetrieverResult(
                Array.Empty<GeminiGroundedResultItem>(),
                true,
                "groq api key missing"
            );
        }

        var query = (request.Query ?? string.Empty).Trim();
        if (query.Length == 0)
        {
            return new GeminiGroundedRetrieverResult(
                Array.Empty<GeminiGroundedResultItem>(),
                true,
                "query required"
            );
        }

        var model = GroqCompoundResponseParser.ResolveCompoundModel();
        var endpoint = $"{_providers.GroqBaseUrl.TrimEnd('/')}/chat/completions";
        var payload = BuildRequestJson(model, query);

        try
        {
            using var httpRequest = new HttpRequestMessage(HttpMethod.Post, endpoint);
            httpRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
            httpRequest.Content = new StringContent(payload, Encoding.UTF8, "application/json");
            using var response = await _httpClient.SendAsync(httpRequest, cancellationToken).ConfigureAwait(false);
            var body = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
            {
                Console.Error.WriteLine($"[groq-compound] search failed ({(int)response.StatusCode})");
                return new GeminiGroundedRetrieverResult(
                    Array.Empty<GeminiGroundedResultItem>(),
                    true,
                    $"http {(int)response.StatusCode}"
                );
            }

            var answer = GroqCompoundResponseParser.TryParse(body);
            if (answer == null || answer.Sources.Count == 0)
            {
                return new GeminiGroundedRetrieverResult(
                    Array.Empty<GeminiGroundedResultItem>(),
                    true,
                    "no search results"
                );
            }

            var limit = maxResults > 0 ? maxResults : GroqCompoundResponseParser.MaxSources;
            var items = answer.Sources
                .Take(limit)
                .Select(source => new GeminiGroundedResultItem(
                    source.Title,
                    source.Url,
                    source.Snippet,
                    null
                ))
                .ToArray();

            return new GeminiGroundedRetrieverResult(items, false, null);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return new GeminiGroundedRetrieverResult(Array.Empty<GeminiGroundedResultItem>(), true, "timeout");
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[groq-compound] search error: {ex.Message}");
            return new GeminiGroundedRetrieverResult(Array.Empty<GeminiGroundedResultItem>(), true, ex.Message);
        }
    }

    private static string BuildRequestJson(string model, string query)
    {
        var prompt = "다음 주제를 웹에서 찾아 근거가 되는 출처를 모아라. 답변은 짧게 요약만 하고, "
            + "출처 수집이 목적이다.\n\n"
            + query;
        var builder = new StringBuilder();
        builder.Append('{');
        builder.Append("\"model\":\"").Append(WebSocketGateway.EscapeJson(model)).Append("\",");
        builder.Append("\"messages\":[{\"role\":\"user\",\"content\":\"")
            .Append(WebSocketGateway.EscapeJson(prompt))
            .Append("\"}],");
        builder.Append("\"max_tokens\":1024");
        builder.Append('}');
        return builder.ToString();
    }
}

/// <summary>
/// retriever 를 순서대로 시도한다. 앞선 retriever 가 Disabled 를 내거나 결과가 비면 다음으로 넘어간다.
/// 모두 실패하면 마지막 실패 사유를 그대로 올린다.
/// </summary>
public sealed class FallbackSearchRetriever : ISearchRetriever
{
    private readonly IReadOnlyList<(string Name, ISearchRetriever Retriever)> _chain;

    public FallbackSearchRetriever(params (string Name, ISearchRetriever Retriever)[] chain)
    {
        _chain = chain ?? Array.Empty<(string, ISearchRetriever)>();
    }

    public async Task<GeminiGroundedRetrieverResult> RetrieveAsync(
        SearchRequest request,
        int maxResults,
        CancellationToken cancellationToken = default
    )
    {
        GeminiGroundedRetrieverResult? last = null;
        foreach (var (name, retriever) in _chain)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var result = await retriever.RetrieveAsync(request, maxResults, cancellationToken).ConfigureAwait(false);
            if (!result.Disabled && result.Results.Count > 0)
            {
                return result;
            }

            Console.Error.WriteLine($"[search] retriever '{name}' unavailable: {result.Error ?? "no results"}");
            last = result;
        }

        return last ?? new GeminiGroundedRetrieverResult(
            Array.Empty<GeminiGroundedResultItem>(),
            true,
            "no retriever configured"
        );
    }
}
