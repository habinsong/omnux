namespace Omnux.Middleware;

public sealed partial class CommandService
{
    private async Task<string?> ExecuteUnifiedSlashCommandLlmAsync(
        UnifiedSlashCommand command,
        string source,
        CancellationToken cancellationToken
    )
    {
        return command.Kind switch
        {
            UnifiedSlashCommandKind.LlmHelp => CommandHelpTextPolicy.BuildUnifiedLlmHelpText(source),
            UnifiedSlashCommandKind.LlmUsage => await BuildTelegramUsageReportAsync(cancellationToken),
            UnifiedSlashCommandKind.LlmModels => await BuildTelegramModelsReportAsync(command.Primary, cancellationToken),
            UnifiedSlashCommandKind.LlmSetGroqModel => await SetGroqModelForChannelAsync(source, command.Primary, cancellationToken),
            UnifiedSlashCommandKind.LlmSetCopilotModel => await SetCopilotModelForChannelAsync(source, command.Primary, cancellationToken),
            UnifiedSlashCommandKind.LlmSetProviderThenModel => await SetChannelModelForProviderAsync(source, command.Primary, command.Secondary, cancellationToken),
            _ => null
        };
    }
}
