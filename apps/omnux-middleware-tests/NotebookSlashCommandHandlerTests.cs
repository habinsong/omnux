using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

// NotebookSlashCommandHandler를 CommandService 없이 INotebookApplicationService fake만으로 구동한다.
// /notebook 텍스트 명령이 82개 private 필드에서 탈결합되어 도메인 서비스에만 의존함을 증명한다(결함 4번 M3).
public sealed class NotebookSlashCommandHandlerTests
{
    [Fact]
    public void CanHandleMatchesNotebookOnly()
    {
        var handler = new NotebookSlashCommandHandler(new FakeNotebookService());

        Assert.True(handler.CanHandle(new SlashCommandContext("/notebook show", "web")));
        Assert.True(handler.CanHandle(new SlashCommandContext("/notebook", "telegram")));
        Assert.False(handler.CanHandle(new SlashCommandContext("/plan list", "web")));
        Assert.False(handler.CanHandle(new SlashCommandContext("/handoff", "web")));
    }

    [Fact]
    public async Task NoArgsReturnsHelp()
    {
        var handler = new NotebookSlashCommandHandler(new FakeNotebookService());
        var result = await handler.HandleAsync(new SlashCommandContext("/notebook", "web"), CancellationToken.None);
        Assert.Contains("[노트북 명령]", result);
    }

    [Fact]
    public async Task HelpArgReturnsHelp()
    {
        var handler = new NotebookSlashCommandHandler(new FakeNotebookService());
        var result = await handler.HandleAsync(new SlashCommandContext("/notebook help", "web"), CancellationToken.None);
        Assert.Contains("[노트북 명령]", result);
    }

    [Fact]
    public async Task ShowPassesProjectKeyAndFormatsSnapshot()
    {
        var fake = new FakeNotebookService
        {
            GetResult = new NotebookActionResult(true, "노트북을 불러왔습니다.", BuildSnapshot())
        };
        var handler = new NotebookSlashCommandHandler(fake);

        var result = await handler.HandleAsync(new SlashCommandContext("/notebook show demo-proj", "web"), CancellationToken.None);

        Assert.Equal("demo-proj", fake.LastGetProjectKey);
        Assert.Contains("노트북을 불러왔습니다.", result);
        Assert.Contains("projectKey=demo-proj", result);
        Assert.Contains("- learnings: exists=yes", result);
    }

    [Fact]
    public async Task ShowWithoutProjectKeyPassesNull()
    {
        var fake = new FakeNotebookService { GetResult = new NotebookActionResult(true, "ok", null) };
        var handler = new NotebookSlashCommandHandler(fake);

        await handler.HandleAsync(new SlashCommandContext("/notebook show", "web"), CancellationToken.None);

        Assert.Null(fake.LastGetProjectKey);
    }

    [Fact]
    public async Task AppendLearningRoutesToLearningService()
    {
        var fake = new FakeNotebookService { AppendResult = new NotebookActionResult(true, "기록했습니다.", null) };
        var handler = new NotebookSlashCommandHandler(fake);

        var result = await handler.HandleAsync(new SlashCommandContext("/notebook append learning 새 학습 내용", "web"), CancellationToken.None);

        Assert.Equal("learning", fake.LastAppendKind);
        Assert.Equal("새 학습 내용", fake.LastAppendContent);
        Assert.Equal("기록했습니다.", result);
    }

    [Fact]
    public async Task AppendDecisionRoutesToDecisionService()
    {
        var fake = new FakeNotebookService { AppendResult = new NotebookActionResult(true, "ok", null) };
        var handler = new NotebookSlashCommandHandler(fake);

        await handler.HandleAsync(new SlashCommandContext("/notebook append decision 결정 내용", "web"), CancellationToken.None);

        Assert.Equal("decision", fake.LastAppendKind);
    }

    [Fact]
    public async Task AppendWithMissingArgsReturnsUsage()
    {
        var handler = new NotebookSlashCommandHandler(new FakeNotebookService());
        var result = await handler.HandleAsync(new SlashCommandContext("/notebook append learning", "web"), CancellationToken.None);
        Assert.Contains("사용법: /notebook append", result);
    }

    [Fact]
    public async Task AppendWithBadKindReturnsError()
    {
        var handler = new NotebookSlashCommandHandler(new FakeNotebookService());
        var result = await handler.HandleAsync(new SlashCommandContext("/notebook append bogus 내용", "web"), CancellationToken.None);
        Assert.Contains("kind는 learning, decision, verification", result);
    }

    [Fact]
    public async Task UnknownActionReturnsHint()
    {
        var handler = new NotebookSlashCommandHandler(new FakeNotebookService());
        var result = await handler.HandleAsync(new SlashCommandContext("/notebook frobnicate", "web"), CancellationToken.None);
        Assert.Contains("알 수 없는 /notebook 명령", result);
    }

    [Fact]
    public async Task ErrorResultFormatsWithErrorPrefix()
    {
        var fake = new FakeNotebookService { GetResult = new NotebookActionResult(false, "노트북 없음", null) };
        var handler = new NotebookSlashCommandHandler(fake);
        var result = await handler.HandleAsync(new SlashCommandContext("/notebook show", "web"), CancellationToken.None);
        Assert.Equal("error: 노트북 없음", result);
    }

    private static ProjectNotebookSnapshot BuildSnapshot()
    {
        var doc = new NotebookDocumentSnapshot("p", true, 10, "2026-06-02", "preview text", "content", false);
        var empty = new NotebookDocumentSnapshot("p", false, 0, "-", string.Empty, string.Empty, false);
        var notebook = new ProjectNotebook("demo-proj", "/root", "l", "d", "v", "h");
        return new ProjectNotebookSnapshot(notebook, doc, empty, empty, empty, "2026-06-02T00:00:00Z");
    }

    private sealed class FakeNotebookService : INotebookApplicationService
    {
        public NotebookActionResult GetResult { get; set; } = new NotebookActionResult(true, "ok", null);
        public NotebookActionResult AppendResult { get; set; } = new NotebookActionResult(true, "ok", null);
        public string? LastGetProjectKey { get; private set; }
        public string? LastAppendKind { get; private set; }
        public string? LastAppendContent { get; private set; }

        public Task<NotebookActionResult> GetNotebookAsync(string? projectKey, CancellationToken cancellationToken)
        {
            LastGetProjectKey = projectKey;
            return Task.FromResult(GetResult);
        }

        public Task<NotebookActionResult> AppendLearningAsync(string? projectKey, string content, CancellationToken cancellationToken)
        {
            LastAppendKind = "learning";
            LastAppendContent = content;
            return Task.FromResult(AppendResult);
        }

        public Task<NotebookActionResult> AppendDecisionAsync(string? projectKey, string content, CancellationToken cancellationToken)
        {
            LastAppendKind = "decision";
            LastAppendContent = content;
            return Task.FromResult(AppendResult);
        }

        public Task<NotebookActionResult> AppendVerificationAsync(string? projectKey, string content, CancellationToken cancellationToken)
        {
            LastAppendKind = "verification";
            LastAppendContent = content;
            return Task.FromResult(AppendResult);
        }

        public Task<NotebookActionResult> CreateHandoffAsync(string? projectKey, CancellationToken cancellationToken)
            => throw new NotSupportedException();

        public Task<string> BuildNotebookContextBlockAsync(string? projectKey, CancellationToken cancellationToken)
            => throw new NotSupportedException();
    }
}
