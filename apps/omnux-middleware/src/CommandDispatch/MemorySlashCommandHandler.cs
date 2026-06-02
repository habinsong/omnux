namespace Omnux.Middleware;

/// <summary>
/// <c>/memory clear</c>와 <c>/memory help</c>(및 인자 없는 <c>/memory</c>) 텍스트 명령 핸들러.
/// <see cref="IMemoryApplicationService"/>와 순수 도움말 정책만 의존하며 CommandService private state에
/// 의존하지 않는다(결함 4번 탈결합).
/// <c>/memory create</c>는 텔레그램 대화 링크(EnsureTelegramLinkedConversation) glue에 묶여 있어 아직
/// 소유하지 않고 <see cref="CanHandle"/>에서 false를 반환해 레거시 경로로 fall-through한다(M4 대상).
/// </summary>
internal sealed class MemorySlashCommandHandler : ISlashCommandHandler
{
    private readonly IMemoryApplicationService _memoryService;

    public MemorySlashCommandHandler(IMemoryApplicationService memoryService)
    {
        _memoryService = memoryService;
    }

    public bool CanHandle(SlashCommandContext context)
    {
        var kind = UnifiedSlashCommandPolicy.Parse(context.Text)?.Kind;
        return kind is UnifiedSlashCommandKind.MemoryClear or UnifiedSlashCommandKind.MemoryHelp;
    }

    public Task<string> HandleAsync(SlashCommandContext context, CancellationToken cancellationToken)
    {
        var kind = UnifiedSlashCommandPolicy.Parse(context.Text)?.Kind;
        var isTelegram = string.Equals(context.Source, "telegram", StringComparison.OrdinalIgnoreCase);

        // MemoryClear: 웹/텔레그램 모두 ClearMemory(source, source) — 레거시와 동일.
        if (kind == UnifiedSlashCommandKind.MemoryClear)
        {
            return Task.FromResult($"메모리를 비웠습니다. {_memoryService.ClearMemory(context.Source, context.Source)}");
        }

        // MemoryHelp(및 인자 없는 /memory): 텔레그램은 텔레그램 도움말, 웹은 통합 메모리 도움말 — 레거시 분기 보존.
        return Task.FromResult(isTelegram
            ? TelegramHelpTextPolicy.Build("memory")
            : CommandHelpTextPolicy.BuildMemoryCommandHelpText());
    }
}
