using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

// MemorySlashCommandHandler를 CommandService 없이 IMemoryApplicationService fake만으로 구동한다(결함 4번 M3).
// /memory create까지 IConversationApplicationService 경계로 처리해 레거시 fall-through 없이 동작함을 검증한다.
public sealed class MemorySlashCommandHandlerTests
{
    [Fact]
    public void CanHandleClearCreateAndHelp()
    {
        var handler = new MemorySlashCommandHandler(new FakeMemoryService(), new FakeConversationService());

        Assert.True(handler.CanHandle(new SlashCommandContext("/memory clear", "web")));
        Assert.True(handler.CanHandle(new SlashCommandContext("/memory create", "telegram")));
        Assert.True(handler.CanHandle(new SlashCommandContext("/memory create compact", "telegram")));
        Assert.True(handler.CanHandle(new SlashCommandContext("/memory help", "web")));
        Assert.True(handler.CanHandle(new SlashCommandContext("/memory", "telegram")));
        Assert.False(handler.CanHandle(new SlashCommandContext("/plan list", "web")));
    }

    [Fact]
    public async Task ClearPassesSourceAsScopeAndSource()
    {
        var fake = new FakeMemoryService { ClearResult = "scope=web removed=2" };
        var handler = new MemorySlashCommandHandler(fake, new FakeConversationService());

        var result = await handler.HandleAsync(new SlashCommandContext("/memory clear", "web"), CancellationToken.None);

        Assert.Equal("web", fake.LastClearScope);
        Assert.Equal("web", fake.LastClearSource);
        Assert.Equal("메모리를 비웠습니다. scope=web removed=2", result);
    }

    [Fact]
    public async Task TelegramClearUsesTelegramScope()
    {
        var fake = new FakeMemoryService { ClearResult = "ok" };
        var handler = new MemorySlashCommandHandler(fake, new FakeConversationService());

        await handler.HandleAsync(new SlashCommandContext("/memory clear", "telegram"), CancellationToken.None);

        Assert.Equal("telegram", fake.LastClearScope);
        Assert.Equal("telegram", fake.LastClearSource);
    }

    [Fact]
    public async Task WebHelpUsesUnifiedMemoryHelp()
    {
        var handler = new MemorySlashCommandHandler(new FakeMemoryService(), new FakeConversationService());
        var result = await handler.HandleAsync(new SlashCommandContext("/memory help", "web"), CancellationToken.None);
        Assert.Equal(CommandHelpTextPolicy.BuildMemoryCommandHelpText(), result);
    }

    [Fact]
    public async Task TelegramHelpUsesTelegramHelp()
    {
        var handler = new MemorySlashCommandHandler(new FakeMemoryService(), new FakeConversationService());
        var result = await handler.HandleAsync(new SlashCommandContext("/memory help", "telegram"), CancellationToken.None);
        Assert.Equal(TelegramHelpTextPolicy.Build("memory"), result);
    }

    [Fact]
    public async Task BareMemoryReturnsHelp()
    {
        var handler = new MemorySlashCommandHandler(new FakeMemoryService(), new FakeConversationService());
        var web = await handler.HandleAsync(new SlashCommandContext("/memory", "web"), CancellationToken.None);
        Assert.Equal(CommandHelpTextPolicy.BuildMemoryCommandHelpText(), web);
    }

    [Fact]
    public async Task WebCreateReturnsTelegramOnlyMessage()
    {
        var handler = new MemorySlashCommandHandler(new FakeMemoryService(), new FakeConversationService());

        var result = await handler.HandleAsync(new SlashCommandContext("/memory create", "web"), CancellationToken.None);

        Assert.Equal("메모리 노트 생성은 현재 텔레그램 대화에서만 바로 지원합니다.", result);
    }

    [Fact]
    public async Task TelegramCreateUsesLinkedConversationAndMemoryService()
    {
        var memory = new FakeMemoryService
        {
            CreateResult = new MemoryNoteCreateResult(true, "note.md", null, null)
        };
        var conversations = new FakeConversationService("telegram-thread");
        var handler = new MemorySlashCommandHandler(memory, conversations);

        var result = await handler.HandleAsync(new SlashCommandContext("/memory create compact", "telegram"), CancellationToken.None);

        Assert.Equal("telegram-thread", memory.LastCreateConversationId);
        Assert.Equal("telegram", memory.LastCreateSource);
        Assert.True(memory.LastCompactConversation);
        Assert.Equal("메모리 노트를 만들었습니다. note.md", result);
        Assert.Equal(1, conversations.EnsureTelegramCalls);
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
        public MemoryNoteCreateResult CreateResult { get; set; } = new(true, "ok", null, null);
        public string? LastCreateConversationId { get; private set; }
        public string? LastCreateSource { get; private set; }
        public bool LastCompactConversation { get; private set; }

        public Task<MemoryNoteCreateResult> CreateMemoryNoteAsync(
            string conversationId,
            string source,
            bool compactConversation,
            CancellationToken cancellationToken
        )
        {
            LastCreateConversationId = conversationId;
            LastCreateSource = source;
            LastCompactConversation = compactConversation;
            return Task.FromResult(CreateResult);
        }

        public MemorySearchToolResult SearchMemory(string query, int? maxResults = null, double? minScore = null) => throw new NotSupportedException();
        public MemoryGetToolResult GetMemory(string path, int? from = null, int? lines = null) => throw new NotSupportedException();
        public MemoryIndexRebuildResult RebuildMemoryIndex() => throw new NotSupportedException();
    }

    private sealed class FakeConversationService : IConversationApplicationService
    {
        private readonly string _telegramConversationId;

        public FakeConversationService(string telegramConversationId = "telegram")
        {
            _telegramConversationId = telegramConversationId;
        }

        public int EnsureTelegramCalls { get; private set; }

        public ConversationThreadView EnsureTelegramLinkedConversation()
        {
            EnsureTelegramCalls++;
            return new ConversationThreadView(
                _telegramConversationId,
                "chat",
                "single",
                "Telegram 연동 대화",
                "Telegram",
                "연동",
                new[] { "telegram-link", "shared" },
                DateTimeOffset.UtcNow,
                DateTimeOffset.UtcNow,
                Array.Empty<ConversationMessageView>(),
                Array.Empty<string>(),
                null
            );
        }

        public IReadOnlyList<ConversationThreadSummary> ListConversations(string scope, string mode) => throw new NotSupportedException();
        public ConversationThreadView CreateConversation(string scope, string mode, string? title, string? project, string? category, IReadOnlyList<string>? tags) => throw new NotSupportedException();
        public ConversationThreadView? GetConversation(string conversationId) => throw new NotSupportedException();
        public bool DeleteConversation(string conversationId) => throw new NotSupportedException();
        public ConversationSearchResult SearchConversations(string query, int? maxResults = null) => throw new NotSupportedException();
        public BackupExportResult ExportBackup(BackupExportOptions? options = null) => throw new NotSupportedException();
        public BackupImportPreviewResult PreviewBackupImport(string fileName, string contentBase64) => throw new NotSupportedException();
        public BackupImportApplyResult ApplyBackupImport(string previewId, bool overwrite) => throw new NotSupportedException();
        public ConversationThreadView UpdateConversationMetadata(string conversationId, string? title, string? project, string? category, IReadOnlyList<string>? tags) => throw new NotSupportedException();
        public WorkspaceFilePreview? ReadWorkspaceFile(string filePath, int maxChars = 120_000) => throw new NotSupportedException();
        public WorkspaceFilePreview? ReadWorkspaceFile(string filePath, string? conversationId, int maxChars = 120_000) => throw new NotSupportedException();
        public bool ClearActiveSkill(string? conversationId) => throw new NotSupportedException();
    }
}
