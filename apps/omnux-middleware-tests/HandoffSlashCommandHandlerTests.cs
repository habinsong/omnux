using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

// HandoffSlashCommandHandler를 CommandService 없이 INotebookApplicationService fake만으로 구동한다(결함 4번 M5).
public sealed class HandoffSlashCommandHandlerTests
{
    [Fact]
    public void CanHandleHandoffOnly()
    {
        var handler = new HandoffSlashCommandHandler(new FakeNotebookService());

        Assert.True(handler.CanHandle(new SlashCommandContext("/handoff", "web")));
        Assert.True(handler.CanHandle(new SlashCommandContext("/handoff demo", "telegram")));
        Assert.False(handler.CanHandle(new SlashCommandContext("/notebook show", "web")));
    }

    [Fact]
    public async Task HelpReturnsHandoffHelp()
    {
        var handler = new HandoffSlashCommandHandler(new FakeNotebookService());

        var result = await handler.HandleAsync(new SlashCommandContext("/handoff help", "web"), CancellationToken.None);

        Assert.Contains("[인수인계 명령]", result);
    }

    [Fact]
    public async Task WebHandoffFormatsNotebookActionResult()
    {
        var fake = new FakeNotebookService
        {
            HandoffResult = new NotebookActionResult(true, "handoff created", null)
        };
        var handler = new HandoffSlashCommandHandler(fake);

        var result = await handler.HandleAsync(new SlashCommandContext("/handoff demo", "web"), CancellationToken.None);

        Assert.Equal("demo", fake.LastHandoffProjectKey);
        Assert.Equal("handoff created", result);
    }

    [Fact]
    public async Task TelegramHandoffUsesTelegramPresentation()
    {
        var fake = new FakeNotebookService
        {
            HandoffResult = new NotebookActionResult(true, "handoff created", null)
        };
        var handler = new HandoffSlashCommandHandler(fake);

        var result = await handler.HandleAsync(new SlashCommandContext("/handoff", "telegram"), CancellationToken.None);

        Assert.Null(fake.LastHandoffProjectKey);
        Assert.Contains("handoff created", result);
    }

    private sealed class FakeNotebookService : INotebookApplicationService
    {
        public NotebookActionResult HandoffResult { get; set; } = new(true, "ok", null);
        public string? LastHandoffProjectKey { get; private set; }

        public Task<NotebookActionResult> CreateHandoffAsync(string? projectKey, CancellationToken cancellationToken)
        {
            LastHandoffProjectKey = projectKey;
            return Task.FromResult(HandoffResult);
        }

        public Task<NotebookActionResult> GetNotebookAsync(string? projectKey, CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task<NotebookActionResult> AppendLearningAsync(string? projectKey, string content, CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task<NotebookActionResult> AppendDecisionAsync(string? projectKey, string content, CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task<NotebookActionResult> AppendVerificationAsync(string? projectKey, string content, CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task<string> BuildNotebookContextBlockAsync(string? projectKey, CancellationToken cancellationToken) => throw new NotSupportedException();
    }
}
