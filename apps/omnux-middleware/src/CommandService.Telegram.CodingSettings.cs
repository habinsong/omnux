namespace Omnux.Middleware;

public sealed partial class CommandService
{
    private string SetTelegramCodingMode(string mode)
    {
        return _telegramCodingSettingsAppService.SetMode(new TelegramCodingModeMutationRequest(mode));
    }

    private string SetTelegramCodingLanguage(string? mode, string language)
    {
        return _telegramCodingSettingsAppService.SetLanguage(new TelegramCodingLanguageMutationRequest(mode, language));
    }

    private string SetTelegramCodingAggregateProvider(string mode, string provider)
    {
        return _telegramCodingSettingsAppService.SetAggregateProvider(new TelegramCodingAggregateProviderMutationRequest(mode, provider));
    }

    private string SetTelegramCodingAggregateModel(string mode, string modelId)
    {
        return _telegramCodingSettingsAppService.SetAggregateModel(new TelegramCodingAggregateModelMutationRequest(mode, modelId));
    }

    private string SetTelegramCodingWorkerModel(string mode, string provider, string modelId)
    {
        return _telegramCodingSettingsAppService.SetWorkerModel(new TelegramCodingWorkerModelMutationRequest(mode, provider, modelId));
    }

    private TelegramCodingPreferences GetTelegramCodingPreferences()
    {
        return _telegramCodingSettingsAppService.GetSnapshot();
    }

    private static bool IsCodingModeKey(string? mode)
    {
        var normalized = (mode ?? string.Empty).Trim().ToLowerInvariant();
        return normalized is "single" or "orchestration" or "multi";
    }

    private static string FormatCodingWorkerModel(string? model)
    {
        return string.IsNullOrWhiteSpace(model) || model.Equals("none", StringComparison.OrdinalIgnoreCase)
            ? "선택 안함"
            : model.Trim();
    }
}
