using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class CodingSlashCommandHandlerTests
{
    [Fact]
    public void CanHandleMatchesCodingOnly()
    {
        var handler = new CodingSlashCommandHandler(new FakeCodingService());

        Assert.True(handler.CanHandle(new SlashCommandContext("/coding run 만들어줘", "web")));
        Assert.True(handler.CanHandle(new SlashCommandContext("/coding", "web")));
        Assert.False(handler.CanHandle(new SlashCommandContext("/code high", "web")));
        Assert.False(handler.CanHandle(new SlashCommandContext("/routine list", "web")));
    }

    [Fact]
    public async Task NoArgsReturnsHelp()
    {
        var handler = new CodingSlashCommandHandler(new FakeCodingService());

        var result = await handler.HandleAsync(new SlashCommandContext("/coding", "web"), CancellationToken.None);

        Assert.Contains("[코딩 명령]", result);
        Assert.Contains("/coding single run", result);
    }

    [Fact]
    public async Task RunWithoutObjectiveReturnsUsage()
    {
        var handler = new CodingSlashCommandHandler(new FakeCodingService());

        var result = await handler.HandleAsync(new SlashCommandContext("/coding run", "web"), CancellationToken.None);

        Assert.Contains("사용법: /coding", result);
    }

    [Fact]
    public async Task DefaultRunCallsSingleCoding()
    {
        var fake = new FakeCodingService();
        var handler = new CodingSlashCommandHandler(fake);

        var result = await handler.HandleAsync(new SlashCommandContext("/coding run 로그인 페이지 만들어줘", "web"), CancellationToken.None);

        Assert.Equal("single", fake.LastMode);
        Assert.Equal("로그인 페이지 만들어줘", fake.LastRequest?.Input);
        Assert.Equal("web", fake.LastRequest?.Source);
        Assert.Equal("coding", fake.LastRequest?.Scope);
        Assert.Equal("코딩", fake.LastRequest?.Category);
        Assert.Equal("auto", fake.LastRequest?.Language);
        Assert.Equal(new[] { "slash-coding" }, fake.LastRequest?.Tags);
        Assert.Contains("[코딩 실행 완료]", result);
        Assert.Contains("변경 파일: 1개", result);
    }

    [Fact]
    public async Task OrchestrationRunParsesOptions()
    {
        var fake = new FakeCodingService();
        var handler = new CodingSlashCommandHandler(fake);

        await handler.HandleAsync(
            new SlashCommandContext("/coding orchestration run --provider groq --model llama --language python API 만들어줘", "web"),
            CancellationToken.None);

        Assert.Equal("orchestration", fake.LastMode);
        Assert.Equal("API 만들어줘", fake.LastRequest?.Input);
        Assert.Equal("groq", fake.LastRequest?.Provider);
        Assert.Equal("llama", fake.LastRequest?.Model);
        Assert.Equal("python", fake.LastRequest?.Language);
    }

    [Fact]
    public async Task MultiRunCallsMultiCoding()
    {
        var fake = new FakeCodingService();
        var handler = new CodingSlashCommandHandler(fake);

        await handler.HandleAsync(new SlashCommandContext("/coding multi run 세 후보 비교해줘", "web"), CancellationToken.None);

        Assert.Equal("multi", fake.LastMode);
        Assert.Equal("세 후보 비교해줘", fake.LastRequest?.Input);
    }

    [Fact]
    public async Task UnknownActionReturnsUsage()
    {
        var handler = new CodingSlashCommandHandler(new FakeCodingService());

        var result = await handler.HandleAsync(new SlashCommandContext("/coding status", "web"), CancellationToken.None);

        Assert.Contains("사용법: /coding", result);
    }

    private sealed class FakeCodingService : ICodingApplicationService
    {
        public string? LastMode { get; private set; }
        public CodingRunRequest? LastRequest { get; private set; }

        public Task<CodingRunResult> RunCodingSingleAsync(
            CodingRunRequest request,
            CancellationToken cancellationToken,
            Action<CodingProgressUpdate>? progressCallback = null
        )
        {
            LastMode = "single";
            LastRequest = request;
            return Task.FromResult(BuildResult(request));
        }

        public Task<CodingRunResult> RunCodingOrchestrationAsync(
            CodingRunRequest request,
            CancellationToken cancellationToken,
            Action<CodingProgressUpdate>? progressCallback = null
        )
        {
            LastMode = "orchestration";
            LastRequest = request;
            return Task.FromResult(BuildResult(request));
        }

        public Task<CodingRunResult> RunCodingMultiAsync(
            CodingRunRequest request,
            CancellationToken cancellationToken,
            Action<CodingProgressUpdate>? progressCallback = null
        )
        {
            LastMode = "multi";
            LastRequest = request;
            return Task.FromResult(BuildResult(request));
        }

        public Task<CodingResultExecutionResult> ExecuteLatestCodingResultAsync(
            string conversationId,
            string? standardInput,
            CancellationToken cancellationToken
        )
        {
            return Task.FromResult(new CodingResultExecutionResult(
                conversationId,
                "python",
                "single",
                true,
                "ok",
                "groq",
                "llama"
            ));
        }

        private static CodingRunResult BuildResult(CodingRunRequest request)
        {
            var now = DateTimeOffset.UnixEpoch;
            var conversation = new ConversationThreadView(
                "conv_1",
                "coding",
                request.Mode,
                "코딩 대화",
                "",
                "코딩",
                request.Tags ?? Array.Empty<string>(),
                now,
                now,
                Array.Empty<ConversationMessageView>(),
                Array.Empty<string>(),
                null
            );
            var execution = new CodeExecutionResult(
                request.Language,
                "/tmp/omnux-coding",
                "main.py",
                "python main.py",
                0,
                "ok",
                "",
                "success"
            );

            return new CodingRunResult(
                request.Mode,
                conversation.Id,
                request.Provider ?? "groq",
                request.Model ?? "llama",
                request.Language,
                "print('ok')",
                execution,
                Array.Empty<CodingWorkerResult>(),
                new[] { "main.py" },
                "요약입니다.",
                conversation,
                null
            );
        }
    }
}
