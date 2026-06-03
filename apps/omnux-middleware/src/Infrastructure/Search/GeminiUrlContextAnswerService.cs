using System.Diagnostics;

namespace Omnux.Middleware;

internal readonly record struct GeminiGroundedWebAnswerResult(
    LlmSingleChatResult Response,
    ChatLatencyMetrics? Latency,
    IReadOnlyList<SearchCitationReference>? Citations = null
);

// GeminiUrlContextAnswerService가 필요로 하는 LLM 호출만 노출하는 좁은 경계. LlmRouter가 구현하며,
// 이 인터페이스 덕분에 서비스를 concrete LlmRouter 없이 fake로 단독 테스트할 수 있다.
internal interface IGeminiUrlContextLlm
{
    Task<string> GenerateGeminiChatAsync(
        string userInput,
        string? modelOverride,
        int maxOutputTokens,
        CancellationToken cancellationToken
    );

    Task<GeminiUrlContextChatResponse> GenerateGeminiUrlContextChatStreamingAsync(
        string prompt,
        string model,
        int maxOutputTokens,
        int timeoutMs,
        bool includeGoogleSearch,
        Action<string>? deltaCallback,
        CancellationToken cancellationToken
    );
}

internal sealed class GeminiUrlContextAnswerService
{
    private const string LegacyCerebrasLlamaModel = "llama3.1-8b";
    private const string DefaultCerebrasModel = "gpt-oss-120b";
    private static readonly HttpClient SharedWebFetchClient = CreateWebFetchClient();

    private readonly ProviderOptions _providers;
    private readonly ContextOptions _context;
    private readonly IGeminiUrlContextLlm _llmRouter;
    private readonly HttpClient _webFetchClient;

    public GeminiUrlContextAnswerService(
        ProviderOptions providers,
        ContextOptions context,
        IGeminiUrlContextLlm llmRouter,
        HttpClient? webFetchClient = null
    )
    {
        _providers = providers;
        _context = context;
        _llmRouter = llmRouter;
        _webFetchClient = webFetchClient ?? SharedWebFetchClient;
    }

    public async Task<GeminiGroundedWebAnswerResult> GenerateAsync(
        string input,
        IReadOnlyList<string> urls,
        string memoryHint,
        bool allowMarkdownTable,
        bool enforceTelegramOutputStyle,
        Action<ChatStreamUpdate>? streamCallback,
        string scope,
        string mode,
        string conversationId,
        string decisionPath,
        long decisionMs,
        CancellationToken cancellationToken
    )
    {
        var model = ResolveUrlContextLlmModel();
        const bool includeGoogleSearch = false;
        const string route = "gemini-url-single";
        var chunkIndex = 0;
        Action<string>? deltaCallback = null;
        if (streamCallback != null)
        {
            deltaCallback = delta =>
            {
                if (string.IsNullOrEmpty(delta))
                {
                    return;
                }

                chunkIndex += 1;
                streamCallback(new ChatStreamUpdate(scope, mode, conversationId, "gemini", model, route, delta, chunkIndex));
            };
        }

        var promptStopwatch = Stopwatch.StartNew();
        var repositoryContext = await TryLoadRepositoryContextSnapshotAsync(input, urls, cancellationToken);
        var extractiveRepositoryAnswer = repositoryContext.HasValue
            ? SearchUrlContextPolicy.TryBuildRepositoryExtractiveAnswer(
                input,
                repositoryContext.Value.Description,
                repositoryContext.Value.ReadmeText
            )
            : string.Empty;
        if (!string.IsNullOrWhiteSpace(extractiveRepositoryAnswer))
        {
            var extractiveSanitizeStopwatch = Stopwatch.StartNew();
            var extractiveOutputText = SearchAnswerFormatterPolicy.EnsureReadableWebAnswerResponse(extractiveRepositoryAnswer, input, allowMarkdownTable);
            var extractiveSanitizeMs = Math.Max(0L, extractiveSanitizeStopwatch.ElapsedMilliseconds);
            ChatLatencyMetrics? extractiveLatency = null;
            if (!string.IsNullOrWhiteSpace(decisionPath))
            {
                extractiveLatency = new ChatLatencyMetrics(
                    decisionMs,
                    Math.Max(0L, promptStopwatch.ElapsedMilliseconds),
                    0,
                    Math.Max(0L, promptStopwatch.ElapsedMilliseconds),
                    extractiveSanitizeMs,
                    decisionPath
                );
            }

            if (deltaCallback != null)
            {
                deltaCallback(extractiveOutputText);
            }

            return new GeminiGroundedWebAnswerResult(
                new LlmSingleChatResult("gemini", model, extractiveOutputText),
                extractiveLatency,
                Array.Empty<SearchCitationReference>()
            );
        }

        var prompt = BuildGeminiUrlContextAnswerPrompt(
            input,
            urls,
            memoryHint,
            allowMarkdownTable,
            enforceTelegramOutputStyle,
            includeGoogleSearch,
            repositoryContext
        );
        var maxOutputTokens = ResolveGeminiUrlContextMaxOutputTokens(input);
        var promptBuildMs = Math.Max(0L, promptStopwatch.ElapsedMilliseconds);
        GeminiUrlContextChatResponse response;
        if (repositoryContext.HasValue)
        {
            var directStopwatch = Stopwatch.StartNew();
            var directText = await _llmRouter.GenerateGeminiChatAsync(
                prompt,
                model,
                maxOutputTokens,
                cancellationToken
            );
            response = new GeminiUrlContextChatResponse(
                directText,
                0,
                Math.Max(0L, directStopwatch.ElapsedMilliseconds),
                Array.Empty<SearchCitationReference>()
            );
            if (deltaCallback != null && !string.IsNullOrWhiteSpace(directText))
            {
                deltaCallback(directText);
            }
        }
        else
        {
            response = await _llmRouter.GenerateGeminiUrlContextChatStreamingAsync(
                prompt,
                model,
                maxOutputTokens,
                _context.GeminiWebTimeoutMs,
                includeGoogleSearch,
                deltaCallback,
                cancellationToken
            );
        }

        var sanitizeStopwatch = Stopwatch.StartNew();
        string outputText;
        if (SearchPromptPolicy.IsGeminiUrlContextFailureText(response.Text))
        {
            outputText = BuildGeminiUrlContextFailureNotice(input, response.Text);
        }
        else
        {
            outputText = ChatOutputSanitizerPolicy.Sanitize(response.Text, keepMarkdownTables: allowMarkdownTable);
            outputText = SearchAnswerFormatterPolicy.EnsureReadableWebAnswerResponse(outputText, input, allowMarkdownTable);
        }

        var sanitizeMs = Math.Max(0L, sanitizeStopwatch.ElapsedMilliseconds);
        ChatLatencyMetrics? latency = null;
        if (!string.IsNullOrWhiteSpace(decisionPath))
        {
            latency = new ChatLatencyMetrics(
                decisionMs,
                promptBuildMs,
                response.FirstChunkMs,
                response.FullResponseMs,
                sanitizeMs,
                decisionPath
            );
        }

        return new GeminiGroundedWebAnswerResult(
            new LlmSingleChatResult("gemini", model, outputText),
            latency,
            response.Citations
        );
    }

    private string ResolveUrlContextLlmModel()
    {
        var configured = NormalizeModelSelection(_providers.GeminiFlashModel);
        if (!string.IsNullOrWhiteSpace(configured))
        {
            return configured!;
        }

        return _providers.GeminiModel;
    }

    private string BuildGeminiUrlContextAnswerPrompt(
        string input,
        IReadOnlyList<string> urls,
        string memoryHint,
        bool allowMarkdownTable,
        bool enforceTelegramOutputStyle,
        bool includeGoogleSearch,
        SearchRepositoryContextSnapshot? repositoryContext = null
    )
    {
        var promptRepositoryContext = repositoryContext.HasValue
            ? new SearchPromptRepositoryContext(
                repositoryContext.Value.RepositorySlug,
                repositoryContext.Value.Description,
                repositoryContext.Value.ReadmeText
            )
            : (SearchPromptRepositoryContext?)null;
        return SearchPromptPolicy.BuildGeminiUrlContextAnswerPrompt(
            input,
            urls,
            memoryHint,
            allowMarkdownTable,
            enforceTelegramOutputStyle,
            includeGoogleSearch,
            _context.WebDefaultNewsCount,
            _context.WebDefaultListCount,
            promptRepositoryContext
        );
    }

    private async Task<SearchRepositoryContextSnapshot?> TryLoadRepositoryContextSnapshotAsync(
        string input,
        IReadOnlyList<string> urls,
        CancellationToken cancellationToken
    )
    {
        var loader = new GitHubRepositoryContextLoader(_webFetchClient);
        return await loader.TryLoadAsync(input, urls, cancellationToken);
    }

    private int ResolveGeminiUrlContextMaxOutputTokens(string input)
    {
        return SearchPromptPolicy.ResolveGeminiUrlContextMaxOutputTokens(
            input,
            _context.WebDefaultNewsCount,
            _context.WebDefaultListCount
        );
    }

    private static string BuildGeminiUrlContextFailureNotice(string input, string failureText)
    {
        return SearchPromptPolicy.BuildGeminiUrlContextFailureNotice(input, failureText);
    }

    private static string? NormalizeModelSelection(string? model)
    {
        if (string.IsNullOrWhiteSpace(model))
        {
            return null;
        }

        var trimmed = model.Trim();
        if (trimmed.Equals(LegacyCerebrasLlamaModel, StringComparison.OrdinalIgnoreCase))
        {
            return DefaultCerebrasModel;
        }

        return string.Equals(trimmed, "none", StringComparison.OrdinalIgnoreCase) ? null : trimmed;
    }

    private static HttpClient CreateWebFetchClient()
    {
        var client = new HttpClient
        {
            Timeout = TimeSpan.FromSeconds(10)
        };
        client.DefaultRequestHeaders.TryAddWithoutValidation("User-Agent", "omnux/1.0");
        return client;
    }
}
