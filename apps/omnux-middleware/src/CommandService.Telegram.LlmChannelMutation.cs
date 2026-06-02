namespace Omnux.Middleware;

public sealed partial class CommandService
{
    private string ApplyTelegramQuickModelSelectionMutation(TelegramQuickModelSelectionMutationRequest request)
    {
        return _telegramLlmMutationAppService.ApplyQuickModelSelection(request);
    }

    private void ApplyTelegramGroqModelSelectionMutation(TelegramGroqModelSelectionMutationRequest request)
    {
        _telegramLlmMutationAppService.ApplyGroqModelSelection(request);
    }

    private bool TryApplyTelegramCopilotModelSelectionMutation(TelegramCopilotModelSelectionMutationRequest request)
    {
        return _telegramLlmMutationAppService.TryApplyCopilotModelSelection(request);
    }

    private string ApplyTelegramProfileCommandMutation(TelegramLlmProfileCommandMutationRequest request)
    {
        return _llmSettingsAppService.ApplyTelegramProfileCommand(request);
    }

    private string SetTelegramSingleProviderThenModelForCommand(string provider, string model)
    {
        return _telegramLlmMutationAppService.SetSingleProviderThenModelForCommand(provider, model);
    }

    private string SetTelegramSingleProviderForCommand(string provider)
    {
        return _telegramLlmMutationAppService.SetSingleProviderForCommand(provider);
    }

    private string SetTelegramSingleModelForCommand(string model)
    {
        return _telegramLlmMutationAppService.SetSingleModelForCommand(model);
    }

    private string SetTelegramOrchestrationProviderForCommand(string provider)
    {
        return _telegramLlmMutationAppService.SetOrchestrationProviderForCommand(provider);
    }

    private string SetTelegramOrchestrationModelForCommand(string model)
    {
        return _telegramLlmMutationAppService.SetOrchestrationModelForCommand(model);
    }

    private string SetTelegramMultiChannelModelForCommand(string channel, string model)
    {
        return _telegramLlmMutationAppService.SetMultiChannelModelForCommand(channel, model);
    }

    private string SetTelegramMultiSummaryProviderForCommand(string provider)
    {
        return _telegramLlmMutationAppService.SetMultiSummaryProviderForCommand(provider);
    }

    private string SetTelegramSingleProviderThenModelForNaturalControl(string provider, string model)
    {
        return _telegramLlmMutationAppService.SetSingleProviderThenModelForNaturalControl(provider, model);
    }
}
