namespace Omnux.Middleware;

public sealed partial class CommandService
{
    private async Task<string?> ExecuteUnifiedSlashMemoryCommandAsync(
        UnifiedSlashCommand command,
        string source,
        CancellationToken cancellationToken
    )
    {
        if (command.Kind == UnifiedSlashCommandKind.MemoryClear)
        {
            var result = ClearMemory(source, source);
            return $"메모리를 비웠습니다. {result}";
        }

        if (command.Kind == UnifiedSlashCommandKind.MemoryCreate)
        {
            if (!source.Equals("telegram", StringComparison.OrdinalIgnoreCase))
            {
                return "메모리 노트 생성은 현재 텔레그램 대화에서만 바로 지원합니다.";
            }

            var telegramThread = EnsureTelegramLinkedConversation();
            var created = await CreateMemoryNoteAsync(
                telegramThread.Id,
                "telegram",
                command.CompactConversation,
                cancellationToken
            );
            return created.Ok
                ? $"메모리 노트를 만들었습니다. {created.Message}"
                : $"메모리 노트 생성 실패: {created.Message}";
        }

        if (command.Kind == UnifiedSlashCommandKind.MemoryHelp)
        {
            return CommandHelpTextPolicy.BuildMemoryCommandHelpText();
        }

        return null;
    }
}
