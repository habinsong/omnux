namespace Omnux.Middleware;

public sealed partial class CommandService
{
    private async Task<string?> TryHandleTelegramMemoryCommandAsync(string text, CancellationToken cancellationToken)
    {
        if (!text.StartsWith("/memory", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        var tokens = text.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (tokens.Length >= 2 && tokens[1].Equals("help", StringComparison.OrdinalIgnoreCase))
        {
            return BuildTelegramHelpText("memory");
        }

        if (tokens.Length >= 2 && tokens[1].Equals("clear", StringComparison.OrdinalIgnoreCase))
        {
            var result = ClearMemory("telegram", "telegram");
            return $"메모리를 비웠습니다. {result}";
        }

        if (tokens.Length >= 2 && tokens[1].Equals("create", StringComparison.OrdinalIgnoreCase))
        {
            var telegramThread = EnsureTelegramLinkedConversation();
            var compactConversation = tokens.Length >= 3 && tokens[2].Equals("compact", StringComparison.OrdinalIgnoreCase);
            var created = await CreateMemoryNoteAsync(
                telegramThread.Id,
                "telegram",
                compactConversation,
                cancellationToken
            );
            return created.Ok
                ? $"메모리 노트를 만들었습니다. {created.Message}"
                : $"메모리 노트 생성 실패: {created.Message}";
        }

        return BuildTelegramHelpText("memory");
    }
}
