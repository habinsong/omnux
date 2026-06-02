namespace Omnux.Middleware;

public sealed partial class CommandService
{
    private async Task<string?> TryHandleTelegramDirectCommandsAsync(
        string source,
        string text,
        IReadOnlyList<InputAttachment>? attachments,
        IReadOnlyList<string>? webUrls,
        bool webSearchEnabled,
        CancellationToken cancellationToken
    )
    {
        if (!source.Equals("telegram", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        var codingCommandResult = await TryHandleTelegramCodingCommandAsync(text, attachments, webUrls, webSearchEnabled, cancellationToken);
        if (codingCommandResult != null)
        {
            return codingCommandResult;
        }

        var refactorCommandResult = await TryHandleTelegramRefactorCommandAsync(text, cancellationToken);
        if (refactorCommandResult != null)
        {
            return refactorCommandResult;
        }

        var profileResult = await TryHandleTelegramProfileCommandAsync(text, cancellationToken);
        if (profileResult != null)
        {
            return profileResult;
        }

        var quickModelResult = await TryHandleTelegramQuickModelCommandAsync(text, cancellationToken);
        if (quickModelResult != null)
        {
            return quickModelResult;
        }

        var llmCommandResult = await TryHandleTelegramLlmControlCommandAsync(text, cancellationToken);
        if (llmCommandResult != null)
        {
            return llmCommandResult;
        }

        var skillCommandResult = await TryHandleTelegramSkillCommandAsync(text, cancellationToken);
        if (skillCommandResult != null)
        {
            return skillCommandResult;
        }

        var historySlashResult = TryHandleTelegramHistorySlashCommand(text);
        if (historySlashResult != null)
        {
            return historySlashResult;
        }

        var thinkToggleResult = TryHandleTelegramThinkSlashCommand(text);
        if (thinkToggleResult != null)
        {
            return thinkToggleResult;
        }

        return TryHandleTelegramWebSlashCommand(text);
    }
}
