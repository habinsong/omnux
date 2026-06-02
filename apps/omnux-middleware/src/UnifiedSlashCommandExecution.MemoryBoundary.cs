namespace Omnux.Middleware;

public sealed partial class CommandService
{
    private readonly record struct UnifiedSlashMemoryCommandRequest(
        UnifiedSlashCommandKind Kind,
        string Source,
        bool CompactConversation
    );

    private static bool IsUnifiedSlashMemoryCommand(UnifiedSlashCommandKind kind)
    {
        return kind is UnifiedSlashCommandKind.MemoryClear
            or UnifiedSlashCommandKind.MemoryCreate
            or UnifiedSlashCommandKind.MemoryHelp;
    }

    private async Task<string?> ExecuteUnifiedSlashMemoryCommandBoundaryAsync(
        UnifiedSlashMemoryCommandRequest request,
        CancellationToken cancellationToken
    )
    {
        return request.Kind switch
        {
            UnifiedSlashCommandKind.MemoryClear => ExecuteUnifiedSlashClearMemoryCommand(request.Source),
            UnifiedSlashCommandKind.MemoryCreate => await ExecuteUnifiedSlashCreateMemoryNoteAsync(request, cancellationToken),
            UnifiedSlashCommandKind.MemoryHelp => CommandHelpTextPolicy.BuildMemoryCommandHelpText(),
            _ => null
        };
    }

    private string ExecuteUnifiedSlashClearMemoryCommand(string source)
    {
        var result = ClearMemory(source, source);
        return $"메모리를 비웠습니다. {result}";
    }

    private async Task<string> ExecuteUnifiedSlashCreateMemoryNoteAsync(
        UnifiedSlashMemoryCommandRequest request,
        CancellationToken cancellationToken
    )
    {
        if (!string.Equals(request.Source, "telegram", StringComparison.OrdinalIgnoreCase))
        {
            return "메모리 노트 생성은 현재 텔레그램 대화에서만 바로 지원합니다.";
        }

        var telegramThread = EnsureTelegramLinkedConversation();
        var created = await CreateMemoryNoteAsync(
            telegramThread.Id,
            "telegram",
            request.CompactConversation,
            cancellationToken
        );
        return created.Ok
            ? $"메모리 노트를 만들었습니다. {created.Message}"
            : $"메모리 노트 생성 실패: {created.Message}";
    }
}
