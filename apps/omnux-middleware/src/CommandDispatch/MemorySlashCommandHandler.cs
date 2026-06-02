namespace Omnux.Middleware;

/// <summary>
/// <c>/memory clear|create|help</c>(및 인자 없는 <c>/memory</c>) 텍스트 명령 핸들러.
/// <see cref="IMemoryApplicationService"/>와 <see cref="IConversationApplicationService"/>만 의존하며
/// CommandService private state에 의존하지 않는다(결함 4번 M5).
/// </summary>
internal sealed class MemorySlashCommandHandler : ISlashCommandHandler
{
    private readonly IMemoryApplicationService _memoryService;
    private readonly IConversationApplicationService _conversationService;

    public MemorySlashCommandHandler(
        IMemoryApplicationService memoryService,
        IConversationApplicationService conversationService
    )
    {
        _memoryService = memoryService;
        _conversationService = conversationService;
    }

    public bool CanHandle(SlashCommandContext context)
    {
        var kind = UnifiedSlashCommandPolicy.Parse(context.Text)?.Kind;
        return kind is UnifiedSlashCommandKind.MemoryClear
            or UnifiedSlashCommandKind.MemoryCreate
            or UnifiedSlashCommandKind.MemoryHelp;
    }

    public async Task<string> HandleAsync(SlashCommandContext context, CancellationToken cancellationToken)
    {
        var command = UnifiedSlashCommandPolicy.Parse(context.Text);
        var kind = command?.Kind;
        var isTelegram = string.Equals(context.Source, "telegram", StringComparison.OrdinalIgnoreCase);

        if (kind == UnifiedSlashCommandKind.MemoryClear)
        {
            return $"메모리를 비웠습니다. {_memoryService.ClearMemory(context.Source, context.Source)}";
        }

        if (kind == UnifiedSlashCommandKind.MemoryCreate)
        {
            if (!isTelegram)
            {
                return "메모리 노트 생성은 현재 텔레그램 대화에서만 바로 지원합니다.";
            }

            var telegramThread = _conversationService.EnsureTelegramLinkedConversation();
            var created = await _memoryService.CreateMemoryNoteAsync(
                telegramThread.Id,
                "telegram",
                command?.CompactConversation ?? false,
                cancellationToken
            );
            return created.Ok
                ? $"메모리 노트를 만들었습니다. {created.Message}"
                : $"메모리 노트 생성 실패: {created.Message}";
        }

        return isTelegram
            ? TelegramHelpTextPolicy.Build("memory")
            : CommandHelpTextPolicy.BuildMemoryCommandHelpText();
    }
}
