namespace Omnux.Middleware;

internal readonly record struct TelegramCodingModeMutationRequest(string Mode);

internal readonly record struct TelegramCodingLanguageMutationRequest(string? Mode, string Language);

internal readonly record struct TelegramCodingAggregateProviderMutationRequest(string Mode, string Provider);

internal readonly record struct TelegramCodingAggregateModelMutationRequest(string Mode, string ModelId);

internal readonly record struct TelegramCodingWorkerModelMutationRequest(string Mode, string Provider, string ModelId);

internal interface ITelegramCodingSettingsApplicationService
{
    string SetMode(TelegramCodingModeMutationRequest request);
    string SetLanguage(TelegramCodingLanguageMutationRequest request);
    string SetAggregateProvider(TelegramCodingAggregateProviderMutationRequest request);
    string SetAggregateModel(TelegramCodingAggregateModelMutationRequest request);
    string SetWorkerModel(TelegramCodingWorkerModelMutationRequest request);
    TelegramCodingPreferences GetSnapshot();
}

internal sealed class TelegramCodingSettingsApplicationService : ITelegramCodingSettingsApplicationService
{
    private const string DefaultCerebrasModel = "gpt-oss-120b";
    private const string LegacyCerebrasLlamaModel = "llama3.1-8b";
    private const string DefaultCopilotModel = "gpt-5-mini";

    private readonly LlmPreferenceContext _preferenceContext;

    public TelegramCodingSettingsApplicationService(LlmPreferenceContext preferenceContext)
    {
        _preferenceContext = preferenceContext;
    }

    public string SetMode(TelegramCodingModeMutationRequest request)
    {
        var normalized = NormalizeMode(request.Mode);
        if (!IsCodingModeKey(normalized))
        {
            return "지원 코딩 모드는 single, orchestration, multi 입니다.";
        }

        lock (_preferenceContext.TelegramCodingLock)
        {
            _preferenceContext.TelegramCodingPreferences.Mode = normalized;
        }

        return $"텔레그램 코딩 모드를 {FormatModeDisplayName(normalized)} 코딩으로 바꿨습니다.";
    }

    public string SetLanguage(TelegramCodingLanguageMutationRequest request)
    {
        lock (_preferenceContext.TelegramCodingLock)
        {
            var resolvedMode = string.IsNullOrWhiteSpace(request.Mode)
                ? _preferenceContext.TelegramCodingPreferences.Mode
                : NormalizeMode(request.Mode);
            if (!IsCodingModeKey(resolvedMode))
            {
                return "지원 코딩 모드는 single, orchestration, multi 입니다.";
            }

            var normalizedLanguage = NormalizeLanguage(request.Language);
            if (resolvedMode == "single")
            {
                _preferenceContext.TelegramCodingPreferences.SingleLanguage = normalizedLanguage;
            }
            else if (resolvedMode == "orchestration")
            {
                _preferenceContext.TelegramCodingPreferences.OrchestrationLanguage = normalizedLanguage;
            }
            else
            {
                _preferenceContext.TelegramCodingPreferences.MultiLanguage = normalizedLanguage;
            }

            return $"텔레그램 {FormatModeDisplayName(resolvedMode)} 코딩 언어를 {normalizedLanguage}로 바꿨습니다.";
        }
    }

    public string SetAggregateProvider(TelegramCodingAggregateProviderMutationRequest request)
    {
        var normalizedMode = NormalizeMode(request.Mode);
        var normalizedProvider = NormalizeProvider(request.Provider, allowAuto: true);
        if (!IsCodingModeKey(normalizedMode) || normalizedProvider == null)
        {
            return "지원 제공자는 auto, groq, gemini, copilot, cerebras, codex 입니다.";
        }

        lock (_preferenceContext.TelegramCodingLock)
        {
            if (normalizedMode == "single")
            {
                _preferenceContext.TelegramCodingPreferences.SingleProvider = normalizedProvider;
            }
            else if (normalizedMode == "orchestration")
            {
                _preferenceContext.TelegramCodingPreferences.OrchestrationProvider = normalizedProvider;
            }
            else
            {
                _preferenceContext.TelegramCodingPreferences.MultiProvider = normalizedProvider;
            }
        }

        return $"텔레그램 {FormatModeDisplayName(normalizedMode)} 코딩 제공자를 {FormatProviderDisplayName(normalizedProvider, allowAuto: true)}로 바꿨습니다.";
    }

    public string SetAggregateModel(TelegramCodingAggregateModelMutationRequest request)
    {
        var normalizedMode = NormalizeMode(request.Mode);
        var requestedModel = NormalizeModelSelection(request.ModelId) ?? (request.ModelId ?? string.Empty).Trim();
        var normalizedModel = requestedModel;
        if (!IsCodingModeKey(normalizedMode) || string.IsNullOrWhiteSpace(normalizedModel))
        {
            return "model-id를 입력하세요.";
        }

        lock (_preferenceContext.TelegramCodingLock)
        {
            var targetProvider = normalizedMode switch
            {
                "single" => _preferenceContext.TelegramCodingPreferences.SingleProvider,
                "orchestration" => _preferenceContext.TelegramCodingPreferences.OrchestrationProvider,
                _ => _preferenceContext.TelegramCodingPreferences.MultiProvider
            };
            if (ProviderModelSelectionPolicy.IsPinnedCopilotProvider(targetProvider))
            {
                normalizedModel = DefaultCopilotModel;
            }

            if (normalizedMode == "single")
            {
                _preferenceContext.TelegramCodingPreferences.SingleModel = normalizedModel;
            }
            else if (normalizedMode == "orchestration")
            {
                _preferenceContext.TelegramCodingPreferences.OrchestrationModel = normalizedModel;
            }
            else
            {
                _preferenceContext.TelegramCodingPreferences.MultiModel = normalizedModel;
            }
        }

        return $"텔레그램 {FormatModeDisplayName(normalizedMode)} 코딩 모델을 {normalizedModel}로 바꿨습니다.";
    }

    public string SetWorkerModel(TelegramCodingWorkerModelMutationRequest request)
    {
        var normalizedMode = NormalizeMode(request.Mode);
        var normalizedProvider = NormalizeProvider(request.Provider, allowAuto: false);
        var normalizedModel = string.Equals((request.ModelId ?? string.Empty).Trim(), "none", StringComparison.OrdinalIgnoreCase)
            ? "none"
            : NormalizeModelSelection(request.ModelId) ?? (request.ModelId ?? string.Empty).Trim();
        if ((normalizedMode != "orchestration" && normalizedMode != "multi")
            || normalizedProvider == null
            || string.IsNullOrWhiteSpace(normalizedModel))
        {
            return "사용법: /coding <orchestration|multi> worker <groq|gemini|copilot|cerebras|codex> <model-id|none>";
        }

        if (ProviderModelSelectionPolicy.IsPinnedCopilotProvider(normalizedProvider)
            && !string.Equals(normalizedModel, "none", StringComparison.OrdinalIgnoreCase))
        {
            normalizedModel = DefaultCopilotModel;
        }

        lock (_preferenceContext.TelegramCodingLock)
        {
            if (normalizedMode == "orchestration")
            {
                SetOrchestrationWorkerModel(normalizedProvider, normalizedModel);
            }
            else
            {
                SetMultiWorkerModel(normalizedProvider, normalizedModel);
            }
        }

        return $"텔레그램 {FormatModeDisplayName(normalizedMode)} 코딩 워커 {FormatProviderDisplayName(normalizedProvider)} 모델을 {normalizedModel}로 바꿨습니다.";
    }

    public TelegramCodingPreferences GetSnapshot()
    {
        lock (_preferenceContext.TelegramCodingLock)
        {
            return _preferenceContext.TelegramCodingPreferences.Clone();
        }
    }

    private void SetOrchestrationWorkerModel(string provider, string model)
    {
        switch (provider)
        {
            case "groq":
                _preferenceContext.TelegramCodingPreferences.OrchestrationGroqModel = model;
                break;
            case "gemini":
                _preferenceContext.TelegramCodingPreferences.OrchestrationGeminiModel = model;
                break;
            case "copilot":
                _preferenceContext.TelegramCodingPreferences.OrchestrationCopilotModel = model;
                break;
            case "cerebras":
                _preferenceContext.TelegramCodingPreferences.OrchestrationCerebrasModel = model;
                break;
            case "nvidia":
                _preferenceContext.TelegramCodingPreferences.OrchestrationNvidiaModel = model;
                break;
            case "codex":
                _preferenceContext.TelegramCodingPreferences.OrchestrationCodexModel = model;
                break;
        }
    }

    private void SetMultiWorkerModel(string provider, string model)
    {
        switch (provider)
        {
            case "groq":
                _preferenceContext.TelegramCodingPreferences.MultiGroqModel = model;
                break;
            case "gemini":
                _preferenceContext.TelegramCodingPreferences.MultiGeminiModel = model;
                break;
            case "copilot":
                _preferenceContext.TelegramCodingPreferences.MultiCopilotModel = model;
                break;
            case "cerebras":
                _preferenceContext.TelegramCodingPreferences.MultiCerebrasModel = model;
                break;
            case "nvidia":
                _preferenceContext.TelegramCodingPreferences.MultiNvidiaModel = model;
                break;
            case "codex":
                _preferenceContext.TelegramCodingPreferences.MultiCodexModel = model;
                break;
        }
    }

    private static bool IsCodingModeKey(string? mode)
    {
        return NormalizeMode(mode) is "single" or "orchestration" or "multi";
    }

    private static string NormalizeMode(string? mode)
    {
        return (mode ?? string.Empty).Trim().ToLowerInvariant();
    }

    private static string? NormalizeProvider(string? provider, bool allowAuto)
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

    private static string NormalizeLanguage(string? language)
    {
        var normalized = (language ?? string.Empty).Trim().ToLowerInvariant();
        return normalized.Length == 0 || normalized == "auto"
            ? "auto"
            : CodingLanguagePolicy.NormalizeLanguageForCode(normalized);
    }

    private static string? NormalizeModelSelection(string? model)
    {
        if (string.IsNullOrWhiteSpace(model))
        {
            return null;
        }

        var trimmed = model.Trim();
        if (trimmed.Equals(LegacyCerebrasLlamaModel, StringComparison.OrdinalIgnoreCase))
        {
            return DefaultCerebrasModel;
        }

        return string.Equals(trimmed, "none", StringComparison.OrdinalIgnoreCase) ? null : trimmed;
    }

    private static string FormatModeDisplayName(string mode)
    {
        return NormalizeMode(mode) switch
        {
            "single" => "단일",
            "orchestration" => "오케스트레이션",
            "multi" => "다중",
            _ => "기본"
        };
    }

    private static string FormatProviderDisplayName(string provider, bool allowAuto = false)
    {
        return NormalizeProvider(provider, allowAuto) switch
        {
            "groq" => "Groq",
            "gemini" => "Gemini",
            "copilot" => "Copilot",
            "cerebras" => "Cerebras",
            "nvidia" => "NVIDIA NIM",
            "codex" => "Codex",
            "auto" => "자동 선택",
            _ => "Groq"
        };
    }
}
