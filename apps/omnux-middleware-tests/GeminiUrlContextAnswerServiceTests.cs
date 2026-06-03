using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

// GeminiUrlContextAnswerService를 concrete LlmRouter 없이 IGeminiUrlContextLlm fake만으로 단독 구동한다.
// 이 테스트가 통과한다는 것은 URL context answer 슬라이스가 공유 chat 엔진(CommandService)에서 분리되어
// LLM 경계 인터페이스에만 의존함을 증명한다(결함 4번 — gateway adapter 심층 상태 분리, URL context).
public sealed class GeminiUrlContextAnswerServiceTests
{
    private sealed class FakeGeminiUrlContextLlm : IGeminiUrlContextLlm
    {
        private readonly GeminiUrlContextChatResponse _streamingResponse;

        public int StreamingCalls { get; private set; }
        public int DirectCalls { get; private set; }

        public FakeGeminiUrlContextLlm(GeminiUrlContextChatResponse streamingResponse)
        {
            _streamingResponse = streamingResponse;
        }

        public Task<string> GenerateGeminiChatAsync(
            string userInput,
            string? modelOverride,
            int maxOutputTokens,
            CancellationToken cancellationToken
        )
        {
            DirectCalls += 1;
            return Task.FromResult("direct repo path should not run for non-repository input");
        }

        public Task<GeminiUrlContextChatResponse> GenerateGeminiUrlContextChatStreamingAsync(
            string prompt,
            string model,
            int maxOutputTokens,
            int timeoutMs,
            bool includeGoogleSearch,
            Action<string>? deltaCallback,
            CancellationToken cancellationToken
        )
        {
            StreamingCalls += 1;
            deltaCallback?.Invoke(_streamingResponse.Text);
            return Task.FromResult(_streamingResponse);
        }
    }

    private static GeminiUrlContextAnswerService BuildService(IGeminiUrlContextLlm llm)
    {
        var config = AppConfig.LoadFromEnvironment();
        return new GeminiUrlContextAnswerService(config.Providers, config.Context, llm);
    }

    [Fact]
    public async Task GenerateAsync_NonRepositoryInput_UsesStreamingLlmAndPassesThroughLatencyAndCitations()
    {
        var citation = new SearchCitationReference("c1", "Title", "https://example.com", "2026-06-03", "snippet", "web");
        var fakeResponse = new GeminiUrlContextChatResponse(
            "서울은 대한민국의 수도입니다.",
            FirstChunkMs: 7,
            FullResponseMs: 42,
            Citations: new[] { citation }
        );
        var llm = new FakeGeminiUrlContextLlm(fakeResponse);
        var service = BuildService(llm);

        var streamUpdates = new List<ChatStreamUpdate>();
        var result = await service.GenerateAsync(
            input: "대한민국 수도는?",
            urls: Array.Empty<string>(), // non-GitHub → 저장소 컨텍스트 로딩(HTTP)을 우회하고 streaming 경로로 간다.
            memoryHint: string.Empty,
            allowMarkdownTable: false,
            enforceTelegramOutputStyle: false,
            streamCallback: update => streamUpdates.Add(update),
            scope: "chat",
            mode: "single",
            conversationId: "conv-1",
            decisionPath: "url-context",
            decisionMs: 12,
            cancellationToken: CancellationToken.None
        );

        Assert.Equal(1, llm.StreamingCalls);
        Assert.Equal(0, llm.DirectCalls);

        Assert.Equal("gemini", result.Response.Provider);
        Assert.False(string.IsNullOrWhiteSpace(result.Response.Model));
        Assert.Contains("서울", result.Response.Text);

        Assert.NotNull(result.Latency);
        Assert.Equal("url-context", result.Latency!.DecisionPath);
        Assert.Equal(12, result.Latency.DecisionMs);
        Assert.Equal(7, result.Latency.FirstChunkMs);
        Assert.Equal(42, result.Latency.FullResponseMs);

        Assert.NotNull(result.Citations);
        Assert.Single(result.Citations!);
        Assert.Equal("c1", result.Citations![0].CitationId);

        Assert.NotEmpty(streamUpdates);
        Assert.Equal("gemini", streamUpdates[0].Provider);
    }

    [Fact]
    public async Task GenerateAsync_WithoutDecisionPath_OmitsLatency()
    {
        var fakeResponse = new GeminiUrlContextChatResponse(
            "간단한 답변입니다.",
            FirstChunkMs: 1,
            FullResponseMs: 2,
            Citations: Array.Empty<SearchCitationReference>()
        );
        var llm = new FakeGeminiUrlContextLlm(fakeResponse);
        var service = BuildService(llm);

        var result = await service.GenerateAsync(
            input: "질문",
            urls: Array.Empty<string>(),
            memoryHint: string.Empty,
            allowMarkdownTable: false,
            enforceTelegramOutputStyle: false,
            streamCallback: null,
            scope: "chat",
            mode: "single",
            conversationId: "conv-2",
            decisionPath: string.Empty,
            decisionMs: 0,
            cancellationToken: CancellationToken.None
        );

        Assert.Equal(1, llm.StreamingCalls);
        Assert.Null(result.Latency);
        Assert.Equal("gemini", result.Response.Provider);
    }
}
