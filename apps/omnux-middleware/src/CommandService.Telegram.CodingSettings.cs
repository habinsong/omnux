namespace Omnux.Middleware;

public sealed partial class CommandService
{
    private string SetTelegramCodingMode(string mode)
    {
        var normalized = (mode ?? string.Empty).Trim().ToLowerInvariant();
        if (!IsCodingModeKey(normalized))
        {
            return "지원 코딩 모드는 single, orchestration, multi 입니다.";
        }

        lock (_telegramCodingLock)
        {
            _telegramCodingPreferences.Mode = normalized;
        }

        return $"텔레그램 코딩 모드를 {FormatModeDisplayName(normalized)} 코딩으로 바꿨습니다.";
    }

    private string SetTelegramCodingLanguage(string? mode, string language)
    {
        var resolvedMode = string.IsNullOrWhiteSpace(mode) ? GetTelegramCodingMode() : (mode ?? string.Empty).Trim().ToLowerInvariant();
        if (!IsCodingModeKey(resolvedMode))
        {
            return "지원 코딩 모드는 single, orchestration, multi 입니다.";
        }

        var normalizedLanguage = NormalizeTelegramCodingLanguageSetting(language);
        lock (_telegramCodingLock)
        {
            if (resolvedMode == "single")
            {
                _telegramCodingPreferences.SingleLanguage = normalizedLanguage;
            }
            else if (resolvedMode == "orchestration")
            {
                _telegramCodingPreferences.OrchestrationLanguage = normalizedLanguage;
            }
            else
            {
                _telegramCodingPreferences.MultiLanguage = normalizedLanguage;
            }
        }

        return $"텔레그램 {FormatModeDisplayName(resolvedMode)} 코딩 언어를 {normalizedLanguage}로 바꿨습니다.";
    }

    private string SetTelegramCodingAggregateProvider(string mode, string provider)
    {
        var normalizedMode = (mode ?? string.Empty).Trim().ToLowerInvariant();
        var normalizedProvider = NormalizeTelegramCodingProviderSetting(provider, allowAuto: true);
        if (!IsCodingModeKey(normalizedMode) || normalizedProvider == null)
        {
            return "지원 제공자는 auto, groq, gemini, copilot, cerebras, codex 입니다.";
        }

        lock (_telegramCodingLock)
        {
            if (normalizedMode == "single")
            {
                _telegramCodingPreferences.SingleProvider = normalizedProvider;
            }
            else if (normalizedMode == "orchestration")
            {
                _telegramCodingPreferences.OrchestrationProvider = normalizedProvider;
            }
            else
            {
                _telegramCodingPreferences.MultiProvider = normalizedProvider;
            }
        }

        return $"텔레그램 {FormatModeDisplayName(normalizedMode)} 코딩 제공자를 {FormatProviderDisplayName(normalizedProvider, allowAuto: true)}로 바꿨습니다.";
    }

    private string SetTelegramCodingAggregateModel(string mode, string modelId)
    {
        var normalizedMode = (mode ?? string.Empty).Trim().ToLowerInvariant();
        var requestedModel = NormalizeModelSelection(modelId) ?? (modelId ?? string.Empty).Trim();
        var normalizedModel = requestedModel;
        if (!IsCodingModeKey(normalizedMode) || string.IsNullOrWhiteSpace(normalizedModel))
        {
            return "model-id를 입력하세요.";
        }

        lock (_telegramCodingLock)
        {
            var targetProvider = normalizedMode switch
            {
                "single" => _telegramCodingPreferences.SingleProvider,
                "orchestration" => _telegramCodingPreferences.OrchestrationProvider,
                _ => _telegramCodingPreferences.MultiProvider
            };
            if (ProviderModelSelectionPolicy.IsPinnedCopilotProvider(targetProvider))
            {
                normalizedModel = DefaultCopilotModel;
            }

            if (normalizedMode == "single")
            {
                _telegramCodingPreferences.SingleModel = normalizedModel;
            }
            else if (normalizedMode == "orchestration")
            {
                _telegramCodingPreferences.OrchestrationModel = normalizedModel;
            }
            else
            {
                _telegramCodingPreferences.MultiModel = normalizedModel;
            }
        }

        return $"텔레그램 {FormatModeDisplayName(normalizedMode)} 코딩 모델을 {normalizedModel}로 바꿨습니다.";
    }

    private string SetTelegramCodingWorkerModel(string mode, string provider, string modelId)
    {
        var normalizedMode = (mode ?? string.Empty).Trim().ToLowerInvariant();
        var normalizedProvider = NormalizeTelegramCodingProviderSetting(provider, allowAuto: false);
        var normalizedModel = string.Equals((modelId ?? string.Empty).Trim(), "none", StringComparison.OrdinalIgnoreCase)
            ? "none"
            : NormalizeModelSelection(modelId) ?? (modelId ?? string.Empty).Trim();
        if ((normalizedMode != "orchestration" && normalizedMode != "multi")
            || normalizedProvider == null
            || string.IsNullOrWhiteSpace(normalizedModel))
        {
            return "사용법: /coding <orchestration|multi> worker <groq|gemini|copilot|cerebras|codex> <model-id|none>";
        }

        if (ProviderModelSelectionPolicy.IsPinnedCopilotProvider(normalizedProvider) && !string.Equals(normalizedModel, "none", StringComparison.OrdinalIgnoreCase))
        {
            normalizedModel = DefaultCopilotModel;
        }

        lock (_telegramCodingLock)
        {
            if (normalizedMode == "orchestration")
            {
                switch (normalizedProvider)
                {
                    case "groq":
                        _telegramCodingPreferences.OrchestrationGroqModel = normalizedModel;
                        break;
                    case "gemini":
                        _telegramCodingPreferences.OrchestrationGeminiModel = normalizedModel;
                        break;
                    case "copilot":
                        _telegramCodingPreferences.OrchestrationCopilotModel = normalizedModel;
                        break;
                    case "cerebras":
                        _telegramCodingPreferences.OrchestrationCerebrasModel = normalizedModel;
                        break;
                    case "nvidia":
                        _telegramCodingPreferences.OrchestrationNvidiaModel = normalizedModel;
                        break;
                    case "codex":
                        _telegramCodingPreferences.OrchestrationCodexModel = normalizedModel;
                        break;
                }
            }
            else
            {
                switch (normalizedProvider)
                {
                    case "groq":
                        _telegramCodingPreferences.MultiGroqModel = normalizedModel;
                        break;
                    case "gemini":
                        _telegramCodingPreferences.MultiGeminiModel = normalizedModel;
                        break;
                    case "copilot":
                        _telegramCodingPreferences.MultiCopilotModel = normalizedModel;
                        break;
                    case "cerebras":
                        _telegramCodingPreferences.MultiCerebrasModel = normalizedModel;
                        break;
                    case "nvidia":
                        _telegramCodingPreferences.MultiNvidiaModel = normalizedModel;
                        break;
                    case "codex":
                        _telegramCodingPreferences.MultiCodexModel = normalizedModel;
                        break;
                }
            }
        }

        return $"텔레그램 {FormatModeDisplayName(normalizedMode)} 코딩 워커 {FormatProviderDisplayName(normalizedProvider)} 모델을 {normalizedModel}로 바꿨습니다.";
    }

    private TelegramCodingPreferences GetTelegramCodingPreferences()
    {
        lock (_telegramCodingLock)
        {
            return _telegramCodingPreferences.Clone();
        }
    }

    private string GetTelegramCodingMode()
    {
        lock (_telegramCodingLock)
        {
            return _telegramCodingPreferences.Mode;
        }
    }

    private static bool IsCodingModeKey(string? mode)
    {
        var normalized = (mode ?? string.Empty).Trim().ToLowerInvariant();
        return normalized is "single" or "orchestration" or "multi";
    }

    private static string? NormalizeTelegramCodingProviderSetting(string? provider, bool allowAuto)
    {
        var normalized = (provider ?? string.Empty).Trim().ToLowerInvariant();
        if (allowAuto && normalized == "auto")
        {
            return "auto";
        }

        if (normalized is "nvidia-nim" or "nvidia_nim" or "nim")
        {
            normalized = "nvidia";
        }

        return normalized is "groq" or "gemini" or "copilot" or "cerebras" or "nvidia" or "codex"
            ? normalized
            : null;
    }

    private static string NormalizeTelegramCodingLanguageSetting(string? language)
    {
        var normalized = (language ?? string.Empty).Trim().ToLowerInvariant();
        return normalized.Length == 0 || normalized == "auto"
            ? "auto"
            : CodingLanguagePolicy.NormalizeLanguageForCode(normalized);
    }

    private static string FormatCodingWorkerModel(string? model)
    {
        return string.IsNullOrWhiteSpace(model) || model.Equals("none", StringComparison.OrdinalIgnoreCase)
            ? "선택 안함"
            : model.Trim();
    }
}
