namespace Omnux.Middleware;

public sealed partial class CommandService
{
    private readonly record struct TelegramLlmControlCommandRequest(TelegramLlmControlCommand Command);

    private async Task<string?> ExecuteTelegramLlmControlCommandBoundaryAsync(
        TelegramLlmControlCommandRequest request,
        CancellationToken cancellationToken
    )
    {
        var command = request.Command;
        switch (command.Kind)
        {
            case TelegramLlmControlCommandKind.Help:
                return CommandHelpTextPolicy.BuildUnifiedLlmHelpText("telegram");

            case TelegramLlmControlCommandKind.Status:
                return await BuildTelegramLlmStatusAsync(cancellationToken);

            case TelegramLlmControlCommandKind.SetMode:
                return SetChannelMode("telegram", command.Primary);

            case TelegramLlmControlCommandKind.Models:
                return await BuildTelegramModelsReportAsync(command.Primary, cancellationToken);

            case TelegramLlmControlCommandKind.Usage:
                return await BuildTelegramUsageReportAsync(cancellationToken);

            case TelegramLlmControlCommandKind.SetGroqModel:
                return await SetGroqModelForTelegramAsync(command.Primary, cancellationToken);

            case TelegramLlmControlCommandKind.SetCopilotModel:
                return await SetCopilotModelForTelegramAsync(command.Primary, cancellationToken);

            case TelegramLlmControlCommandKind.SetSingleProviderThenModel:
                return SetTelegramSingleProviderThenModelForCommand(command.Primary, command.Secondary);

            case TelegramLlmControlCommandKind.SetSingleProvider:
                return SetTelegramSingleProviderForCommand(command.Primary);

            case TelegramLlmControlCommandKind.SetSingleModel:
                return SetTelegramSingleModelForCommand(command.Secondary);

            case TelegramLlmControlCommandKind.SetOrchestrationProvider:
                return SetTelegramOrchestrationProviderForCommand(command.Primary);

            case TelegramLlmControlCommandKind.SetOrchestrationModel:
                return SetTelegramOrchestrationModelForCommand(command.Secondary);

            case TelegramLlmControlCommandKind.SetMultiChannelModel:
                return SetTelegramMultiChannelModelForCommand(command.Primary, command.Secondary);

            case TelegramLlmControlCommandKind.SetMultiSummaryProvider:
                return SetTelegramMultiSummaryProviderForCommand(command.Primary);

            case TelegramLlmControlCommandKind.UsageError:
            case TelegramLlmControlCommandKind.Unknown:
            default:
                return command.Message;
        }
    }
}
