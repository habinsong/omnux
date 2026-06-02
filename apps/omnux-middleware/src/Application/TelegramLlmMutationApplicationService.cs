namespace Omnux.Middleware;

internal readonly record struct TelegramQuickModelSelectionMutationRequest(TelegramQuickModelSelection Selection);

internal readonly record struct TelegramGroqModelSelectionMutationRequest(string ModelId);

internal readonly record struct TelegramCopilotModelSelectionMutationRequest(string ModelId);

internal interface ITelegramLlmMutationApplicationService
{
    string ApplyQuickModelSelection(TelegramQuickModelSelectionMutationRequest request);
    void ApplyGroqModelSelection(TelegramGroqModelSelectionMutationRequest request);
    bool TryApplyCopilotModelSelection(TelegramCopilotModelSelectionMutationRequest request);
    string SetSingleProviderThenModelForCommand(string provider, string model);
    string SetSingleProviderForCommand(string provider);
    string SetSingleModelForCommand(string model);
    string SetOrchestrationProviderForCommand(string provider);
    string SetOrchestrationModelForCommand(string model);
    string SetMultiChannelModelForCommand(string channel, string model);
    string SetMultiSummaryProviderForCommand(string provider);
    string SetSingleProviderThenModelForNaturalControl(string provider, string model);
}

internal sealed class TelegramLlmMutationApplicationService : ITelegramLlmMutationApplicationService
{
    private const string DefaultGroqPrimaryModel = "meta-llama/llama-4-scout-17b-16e-instruct";
    private const string DefaultGroqFastModel = "llama-3.1-8b-instant";
    private const string DefaultCerebrasModel = "gpt-oss-120b";
    private const string LegacyCerebrasLlamaModel = "llama3.1-8b";
    private const string DefaultCopilotModel = "gpt-5-mini";

    private readonly ProviderOptions _providers;
    private readonly LlmPreferenceContext _preferenceContext;
    private readonly Func<string> _getSelectedGroqModel;
    private readonly Func<string, bool> _trySetSelectedGroqModel;
    private readonly Func<string, bool> _trySetSelectedCopilotModel;

    public TelegramLlmMutationApplicationService(
        ProviderOptions providers,
        LlmPreferenceContext preferenceContext,
        Func<string> getSelectedGroqModel,
        Func<string, bool> trySetSelectedGroqModel,
        Func<string, bool> trySetSelectedCopilotModel
    )
    {
        _providers = providers;
        _preferenceContext = preferenceContext;
        _getSelectedGroqModel = getSelectedGroqModel;
        _trySetSelectedGroqModel = trySetSelectedGroqModel;
        _trySetSelectedCopilotModel = trySetSelectedCopilotModel;
    }

    public string ApplyQuickModelSelection(TelegramQuickModelSelectionMutationRequest request)
    {
        var selection = request.Selection;
        lock (_preferenceContext.TelegramLlmLock)
        {
            _preferenceContext.TelegramLlmPreferences.Profile = "default";
            _preferenceContext.TelegramLlmPreferences.Mode = "single";
            _preferenceContext.TelegramLlmPreferences.SingleProvider = selection.Provider;
            _preferenceContext.TelegramLlmPreferences.SingleModel = selection.Model;
            _preferenceContext.TelegramLlmPreferences.AutoGroqComplexUpgrade = selection.AutoGroqComplexUpgrade;
        }

        return $"단일 제공자를 {selection.ProviderDisplayName}로 바꿨습니다. 현재 모델: {selection.Model}";
    }

    public void ApplyGroqModelSelection(TelegramGroqModelSelectionMutationRequest request)
    {
        _trySetSelectedGroqModel(request.ModelId);
        lock (_preferenceContext.TelegramLlmLock)
        {
            _preferenceContext.TelegramLlmPreferences.SingleProvider = "groq";
            _preferenceContext.TelegramLlmPreferences.SingleModel = request.ModelId;
            _preferenceContext.TelegramLlmPreferences.AutoGroqComplexUpgrade = request.ModelId.Equals(DefaultGroqFastModel, StringComparison.OrdinalIgnoreCase);
        }
    }

    public bool TryApplyCopilotModelSelection(TelegramCopilotModelSelectionMutationRequest request)
    {
        if (!_trySetSelectedCopilotModel(request.ModelId))
        {
            return false;
        }

        lock (_preferenceContext.TelegramLlmLock)
        {
            _preferenceContext.TelegramLlmPreferences.SingleProvider = "copilot";
            _preferenceContext.TelegramLlmPreferences.SingleModel = request.ModelId;
        }

        return true;
    }

    public string SetSingleProviderThenModelForCommand(string provider, string model)
    {
        var providerSet = SetTelegramProvider("single", provider);
        if (providerSet.StartsWith("지원", StringComparison.OrdinalIgnoreCase)
            || providerSet.StartsWith("invalid", StringComparison.OrdinalIgnoreCase))
        {
            return providerSet;
        }

        return SetTelegramModel("single", model);
    }

    public string SetSingleProviderForCommand(string provider)
    {
        return SetTelegramProvider("single", provider);
    }

    public string SetSingleModelForCommand(string model)
    {
        return SetTelegramModel("single", model);
    }

    public string SetOrchestrationProviderForCommand(string provider)
    {
        return SetTelegramProvider("orchestration", provider);
    }

    public string SetOrchestrationModelForCommand(string model)
    {
        return SetTelegramModel("orchestration", model);
    }

    public string SetMultiChannelModelForCommand(string channel, string model)
    {
        return SetTelegramModel(channel, model);
    }

    public string SetMultiSummaryProviderForCommand(string provider)
    {
        return SetTelegramProvider("summary", provider);
    }

    public string SetSingleProviderThenModelForNaturalControl(string provider, string model)
    {
        var providerMessage = SetTelegramProvider("single", provider);
        var modelMessage = SetTelegramModel("single", model);
        return providerMessage.Contains("실패", StringComparison.OrdinalIgnoreCase)
            ? providerMessage
            : modelMessage;
    }

    private string SetTelegramProvider(string slot, string provider)
    {
        var normalizedSlot = (slot ?? string.Empty).Trim().ToLowerInvariant();
        var allowAuto = normalizedSlot is "orchestration" or "summary";
        var normalizedProvider = NormalizeProvider(provider, allowAuto);
        if (!allowAuto && normalizedProvider == "auto")
        {
            return "지원 제공자는 groq, gemini, copilot, cerebras, nvidia, codex 입니다.";
        }

        lock (_preferenceContext.TelegramLlmLock)
        {
            return SetTelegramProviderCore(normalizedSlot, normalizedProvider);
        }
    }

    private string SetTelegramModel(string slot, string modelId)
    {
        var normalizedSlot = (slot ?? string.Empty).Trim().ToLowerInvariant();
        var normalizedModel = NormalizeModelSelection(modelId);
        if (string.IsNullOrWhiteSpace(normalizedModel))
        {
            return "model-id를 입력하세요.";
        }

        lock (_preferenceContext.TelegramLlmLock)
        {
            return SetTelegramModelCore(normalizedSlot, normalizedModel);
        }
    }

    private string SetTelegramProviderCore(string slot, string provider)
    {
        var preferences = _preferenceContext.TelegramLlmPreferences;
        if (slot == "single")
        {
            preferences.SingleProvider = provider;
            if (provider == "groq")
            {
                preferences.SingleModel = string.IsNullOrWhiteSpace(_providers.GroqModel) ? DefaultGroqPrimaryModel : _providers.GroqModel;
                preferences.AutoGroqComplexUpgrade = true;
            }
            else if (provider == "copilot")
            {
                preferences.SingleModel = DefaultCopilotModel;
                preferences.AutoGroqComplexUpgrade = false;
            }
            else
            {
                preferences.SingleModel = provider switch
                {
                    "cerebras" => _providers.CerebrasModel,
                    "nvidia" => _providers.NvidiaModel,
                    "codex" => _providers.CodexModel,
                    _ => _providers.GeminiModel
                };
                preferences.AutoGroqComplexUpgrade = false;
            }

            return $"텔레그램 단일 제공자를 {FormatProviderDisplayName(provider)}로 바꿨습니다. 현재 모델: {ResolveModel(provider, preferences.SingleModel)}";
        }

        if (slot == "orchestration")
        {
            preferences.OrchestrationProvider = provider;
            return $"텔레그램 오케스트레이션 담당을 {FormatProviderDisplayName(provider, allowAuto: true)}로 바꿨습니다.";
        }

        if (slot == "summary")
        {
            preferences.MultiSummaryProvider = provider;
            return $"텔레그램 다중 요약 담당을 {FormatProviderDisplayName(provider, allowAuto: true)}로 바꿨습니다.";
        }

        return "지원 슬롯은 single, orchestration, summary 입니다.";
    }

    private string SetTelegramModelCore(string slot, string model)
    {
        var preferences = _preferenceContext.TelegramLlmPreferences;
        if (slot == "single")
        {
            preferences.SingleModel = model;
            if (preferences.SingleProvider == "groq")
            {
                preferences.AutoGroqComplexUpgrade = model.Equals(DefaultGroqFastModel, StringComparison.OrdinalIgnoreCase);
            }

            return $"텔레그램 단일 모델을 {model}로 바꿨습니다.";
        }

        if (slot == "orchestration")
        {
            preferences.OrchestrationModel = model;
            return $"텔레그램 오케스트레이션 모델을 {model}로 바꿨습니다.";
        }

        if (slot == "multi.groq")
        {
            preferences.MultiGroqModel = model;
            return $"텔레그램 다중 Groq 모델을 {model}로 바꿨습니다.";
        }

        if (slot == "multi.gemini")
        {
            preferences.MultiGeminiModel = model;
            return $"텔레그램 다중 Gemini 모델을 {model}로 바꿨습니다.";
        }

        if (slot == "multi.copilot")
        {
            preferences.MultiCopilotModel = model;
            return $"텔레그램 다중 Copilot 모델을 {model}로 바꿨습니다.";
        }

        if (slot == "multi.cerebras")
        {
            preferences.MultiCerebrasModel = model;
            return $"텔레그램 다중 Cerebras 모델을 {model}로 바꿨습니다.";
        }

        if (slot == "multi.nvidia")
        {
            preferences.MultiNvidiaModel = model;
            return $"텔레그램 다중 NVIDIA NIM 모델을 {model}로 바꿨습니다.";
        }

        if (slot == "multi.codex")
        {
            preferences.MultiCodexModel = model;
            return $"텔레그램 다중 Codex 모델을 {model}로 바꿨습니다.";
        }

        return "지원 슬롯은 single, orchestration, multi.groq, multi.gemini, multi.copilot, multi.cerebras, multi.nvidia, multi.codex 입니다.";
    }

    private string ResolveModel(string provider, string? modelOverride)
    {
        var normalizedOverride = ProviderModelSelectionPolicy.NormalizePinnedProviderModelSelection(
            provider,
            modelOverride,
            DefaultCopilotModel,
            NormalizeModelSelection
        );
        if (!string.IsNullOrWhiteSpace(normalizedOverride))
        {
            return normalizedOverride;
        }

        return provider switch
        {
            "gemini" => _providers.GeminiModel,
            "cerebras" => _providers.CerebrasModel,
            "nvidia" => _providers.NvidiaModel,
            "copilot" => DefaultCopilotModel,
            "codex" => _providers.CodexModel,
            _ => _getSelectedGroqModel()
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

    private static string NormalizeProvider(string? provider, bool allowAuto)
    {
        var value = (provider ?? string.Empty).Trim().ToLowerInvariant();
        if (value == "nvidia-nim" || value == "nvidia_nim" || value == "nim")
        {
            value = "nvidia";
        }

        if (value == "gemini" || value == "groq" || value == "cerebras" || value == "nvidia" || value == "copilot" || value == "codex")
        {
            return value;
        }

        if (allowAuto && (value == "auto" || string.IsNullOrWhiteSpace(value)))
        {
            return "auto";
        }

        return "groq";
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
}
