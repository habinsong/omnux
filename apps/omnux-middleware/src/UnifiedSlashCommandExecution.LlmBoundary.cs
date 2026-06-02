namespace Omnux.Middleware;

public sealed partial class CommandService
{
    private readonly record struct UnifiedSlashLlmCommandRequest(
        UnifiedSlashCommandKind Kind,
        string Source,
        string Primary,
        string Secondary
    );

    private static bool IsUnifiedSlashLlmCommand(UnifiedSlashCommandKind kind)
    {
        return kind is UnifiedSlashCommandKind.LlmHelp
            or UnifiedSlashCommandKind.LlmUsage
            or UnifiedSlashCommandKind.LlmModels
            or UnifiedSlashCommandKind.LlmSetGroqModel
            or UnifiedSlashCommandKind.LlmSetCopilotModel
            or UnifiedSlashCommandKind.LlmSetProviderThenModel;
    }

    private async Task<string?> ExecuteUnifiedSlashLlmCommandBoundaryAsync(
        UnifiedSlashLlmCommandRequest request,
        CancellationToken cancellationToken
    )
    {
        return request.Kind switch
        {
            UnifiedSlashCommandKind.LlmHelp => CommandHelpTextPolicy.BuildUnifiedLlmHelpText(request.Source),
            UnifiedSlashCommandKind.LlmUsage => await BuildTelegramUsageReportAsync(cancellationToken),
            UnifiedSlashCommandKind.LlmModels => await BuildTelegramModelsReportAsync(request.Primary, cancellationToken),
            UnifiedSlashCommandKind.LlmSetGroqModel => await SetGroqModelForChannelAsync(request.Source, request.Primary, cancellationToken),
            UnifiedSlashCommandKind.LlmSetCopilotModel => await SetCopilotModelForChannelAsync(request.Source, request.Primary, cancellationToken),
            UnifiedSlashCommandKind.LlmSetProviderThenModel => await SetChannelModelForProviderAsync(request.Source, request.Primary, request.Secondary, cancellationToken),
            _ => null
        };
    }
}
