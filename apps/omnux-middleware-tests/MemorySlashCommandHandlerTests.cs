using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

// MemorySlashCommandHandler를 CommandService 없이 IMemoryApplicationService fake만으로 구동한다(결함 4번 M3).
// /memory create는 텔레그램 링크 glue에 묶여 있어 CanHandle=false로 레거시에 남긴다.
public sealed class MemorySlashCommandHandlerTests
{
    [Fact]
    public void CanHandleClearAndHelpButNotCreate()
    {
        var handler = new MemorySlashCommandHandler(new FakeMemoryService());

        Assert.True(handler.CanHandle(new SlashCommandContext("/memory clear", "web")));
        Assert.True(handler.CanHandle(new SlashCommandContext("/memory help", "web")));
        Assert.True(handler.CanHandle(new SlashCommandContext("/memory", "telegram")));
        // create는 소유하지 않는다(레거시 fall-through).
        Assert.False(handler.CanHandle(new SlashCommandContext("/memory create", "telegram")));
        Assert.False(handler.CanHandle(new SlashCommandContext("/plan list", "web")));
    }

    [Fact]
    public async Task ClearPassesSourceAsScopeAndSource()
    {
        var fake = new FakeMemoryService { ClearResult = "scope=web removed=2" };
        var handler = new MemorySlashCommandHandler(fake);

        var result = await handler.HandleAsync(new SlashCommandContext("/memory clear", "web"), CancellationToken.None);

        Assert.Equal("web", fake.LastClearScope);
        Assert.Equal("web", fake.LastClearSource);
        Assert.Equal("메모리를 비웠습니다. scope=web removed=2", result);
    }

    [Fact]
    public async Task TelegramClearUsesTelegramScope()
    {
        var fake = new FakeMemoryService { ClearResult = "ok" };
        var handler = new MemorySlashCommandHandler(fake);

        await handler.HandleAsync(new SlashCommandContext("/memory clear", "telegram"), CancellationToken.None);

        Assert.Equal("telegram", fake.LastClearScope);
        Assert.Equal("telegram", fake.LastClearSource);
    }

    [Fact]
    public async Task WebHelpUsesUnifiedMemoryHelp()
    {
        var handler = new MemorySlashCommandHandler(new FakeMemoryService());
        var result = await handler.HandleAsync(new SlashCommandContext("/memory help", "web"), CancellationToken.None);
        Assert.Equal(CommandHelpTextPolicy.BuildMemoryCommandHelpText(), result);
    }

    [Fact]
    public async Task TelegramHelpUsesTelegramHelp()
    {
        var handler = new MemorySlashCommandHandler(new FakeMemoryService());
        var result = await handler.HandleAsync(new SlashCommandContext("/memory help", "telegram"), CancellationToken.None);
        Assert.Equal(TelegramHelpTextPolicy.Build("memory"), result);
    }

    [Fact]
    public async Task BareMemoryReturnsHelp()
    {
        var handler = new MemorySlashCommandHandler(new FakeMemoryService());
        var web = await handler.HandleAsync(new SlashCommandContext("/memory", "web"), CancellationToken.None);
        Assert.Equal(CommandHelpTextPolicy.BuildMemoryCommandHelpText(), web);
    }

    private sealed class FakeMemoryService : IMemoryApplicationService
    {
        public string ClearResult { get; set; } = "ok";
        public string? LastClearScope { get; private set; }
        public string? LastClearSource { get; private set; }

        public string ClearMemory(string? scope, string source = "web")
        {
            LastClearScope = scope;
            LastClearSource = source;
            return ClearResult;
        }

        public IReadOnlyList<MemoryNoteItem> ListMemoryNotes() => throw new NotSupportedException();
        public MemoryNoteReadResult? ReadMemoryNote(string name) => throw new NotSupportedException();
        public (MemoryNoteRenameResult Result, int RelinkedConversations) RenameMemoryNote(string name, string newName) => throw new NotSupportedException();
        public MemoryNoteDeleteResult DeleteMemoryNotes(IReadOnlyList<string>? names) => throw new NotSupportedException();
        public Task<MemoryNoteCreateResult> CreateMemoryNoteAsync(string conversationId, string source, bool compactConversation, CancellationToken cancellationToken) => throw new NotSupportedException();
        public MemorySearchToolResult SearchMemory(string query, int? maxResults = null, double? minScore = null) => throw new NotSupportedException();
        public MemoryGetToolResult GetMemory(string path, int? from = null, int? lines = null) => throw new NotSupportedException();
        public MemoryIndexRebuildResult RebuildMemoryIndex() => throw new NotSupportedException();
    }
}
