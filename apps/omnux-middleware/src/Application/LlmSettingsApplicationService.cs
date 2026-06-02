namespace Omnux.Middleware;

internal readonly record struct LlmChannelProfileRequest(string Source, string Profile, string Thinking);

internal readonly record struct LlmChannelModeRequest(string Source, string Mode);

internal readonly record struct LlmChannelProviderRequest(string Source, string Slot, string Provider);

internal readonly record struct LlmChannelModelRequest(string Source, string Slot, string ModelId);

internal readonly record struct LlmChannelStatusRequest(string Source);

internal readonly record struct TelegramLlmProfileCommandMutationRequest(string Profile, string Thinking);

internal interface ILlmSettingsApplicationService
{
    string ApplyChannelProfile(LlmChannelProfileRequest request);
    string SetChannelMode(LlmChannelModeRequest request);
    string SetChannelProvider(LlmChannelProviderRequest request);
    string SetChannelModel(LlmChannelModelRequest request);
    string BuildChannelModelStatus(LlmChannelStatusRequest request);
    string ApplyTelegramProfileCommand(TelegramLlmProfileCommandMutationRequest request);
}

internal sealed class LlmSettingsApplicationService : ILlmSettingsApplicationService
{
    private const string DefaultGroqPrimaryModel = "meta-llama/llama-4-scout-17b-16e-instruct";
    private const string DefaultGroqFastModel = "llama-3.1-8b-instant";
    private const string DefaultCerebrasModel = "gpt-oss-120b";
    private const string LegacyCerebrasLlamaModel = "llama3.1-8b";
    private const string DefaultCopilotModel = "gpt-5-mini";

    private readonly ProviderOptions _providers;
    private readonly LlmPreferenceContext _preferenceContext;
    private readonly ITelegramLlmMutationApplicationService _telegramMutationService;
    private readonly Func<string> _getSelectedGroqModel;

    public LlmSettingsApplicationService(
        ProviderOptions providers,
        LlmPreferenceContext preferenceContext,
        ITelegramLlmMutationApplicationService telegramMutationService,
        Func<string> getSelectedGroqModel
    )
    {
        _providers = providers;
        _preferenceContext = preferenceContext;
        _telegramMutationService = telegramMutationService;
        _getSelectedGroqModel = getSelectedGroqModel;
    }

    public string ApplyChannelProfile(LlmChannelProfileRequest request)
    {
        var normalizedSource = (request.Source ?? string.Empty).Trim().ToLowerInvariant();
        var thinkingLabel = request.Thinking == "high"
            ? "high"
            : request.Thinking == "low"
                ? "low"
                : "auto";
        if (normalizedSource == "telegram")
        {
            lock (_preferenceContext.TelegramLlmLock)
            {
                if (request.Profile == "talk")
                {
                    ApplyTelegramTalkDefaults(request.Thinking);
                    return $"텔레그램 프로필을 대화용으로 바꿨습니다. 모드={FormatModeDisplayName(_preferenceContext.TelegramLlmPreferences.Mode)}, thinking={thinkingLabel}";
                }

                ApplyTelegramCodeDefaults(request.Thinking);
                return $"텔레그램 프로필을 코딩용으로 바꿨습니다. 모드={FormatModeDisplayName(_preferenceContext.TelegramLlmPreferences.Mode)}, thinking={thinkingLabel}";
            }
        }

        lock (_preferenceContext.WebLlmLock)
        {
            if (request.Profile == "talk")
            {
                ApplyWebTalkDefaults(request.Thinking);
                return $"웹 프로필을 대화용으로 바꿨습니다. 모드={FormatModeDisplayName(_preferenceContext.WebLlmPreferences.Mode)}, thinking={thinkingLabel}";
            }

            ApplyWebCodeDefaults(request.Thinking);
            return $"웹 프로필을 코딩용으로 바꿨습니다. 모드={FormatModeDisplayName(_preferenceContext.WebLlmPreferences.Mode)}, thinking={thinkingLabel}";
        }
    }

    public string SetChannelMode(LlmChannelModeRequest request)
    {
        if (request.Mode is not ("single" or "orchestration" or "multi"))
        {
            return "지원 모드는 single, orchestration, multi 입니다.";
        }

        if (request.Source.Equals("telegram", StringComparison.OrdinalIgnoreCase))
        {
            lock (_preferenceContext.TelegramLlmLock)
            {
                _preferenceContext.TelegramLlmPreferences.Mode = request.Mode;
            }

            return $"텔레그램 LLM 모드를 {FormatModeDisplayName(request.Mode)}로 바꿨습니다.";
        }

        lock (_preferenceContext.WebLlmLock)
        {
            _preferenceContext.WebLlmPreferences.Mode = request.Mode;
        }

        return $"웹 LLM 모드를 {FormatModeDisplayName(request.Mode)}로 바꿨습니다.";
    }

    public string SetChannelProvider(LlmChannelProviderRequest request)
    {
        var normalizedSlot = (request.Slot ?? string.Empty).Trim().ToLowerInvariant();
        var allowAuto = normalizedSlot is "orchestration" or "summary";
        var normalizedProvider = NormalizeProvider(request.Provider, allowAuto);
        if (!allowAuto && normalizedProvider == "auto")
        {
            return "지원 제공자는 groq, gemini, copilot, cerebras, nvidia, codex 입니다.";
        }

        if (request.Source.Equals("telegram", StringComparison.OrdinalIgnoreCase))
        {
            return SetTelegramProvider(normalizedSlot, normalizedProvider);
        }

        lock (_preferenceContext.WebLlmLock)
        {
            return SetWebProviderCore(normalizedSlot, normalizedProvider);
        }
    }

    public string SetChannelModel(LlmChannelModelRequest request)
    {
        var normalizedSlot = (request.Slot ?? string.Empty).Trim().ToLowerInvariant();
        var normalizedModel = NormalizeModelSelection(request.ModelId);
        if (string.IsNullOrWhiteSpace(normalizedModel))
        {
            return "model-id를 입력하세요.";
        }

        if (request.Source.Equals("telegram", StringComparison.OrdinalIgnoreCase))
        {
            return SetTelegramModel(normalizedSlot, normalizedModel);
        }

        lock (_preferenceContext.WebLlmLock)
        {
            return SetWebModelCore(normalizedSlot, normalizedModel);
        }
    }

    public string BuildChannelModelStatus(LlmChannelStatusRequest request)
    {
        if (request.Source.Equals("telegram", StringComparison.OrdinalIgnoreCase))
        {
            TelegramLlmPreferences snapshot;
            lock (_preferenceContext.TelegramLlmLock)
            {
                snapshot = _preferenceContext.TelegramLlmPreferences.Clone();
            }

            return BuildModelStatusText(
                "telegram",
                snapshot.Mode,
                snapshot.SingleProvider,
                snapshot.SingleModel,
                snapshot.OrchestrationProvider,
                snapshot.OrchestrationModel,
                snapshot.MultiGroqModel,
                snapshot.MultiGeminiModel,
                snapshot.MultiCopilotModel,
                snapshot.MultiCerebrasModel,
                snapshot.MultiNvidiaModel,
                snapshot.MultiCodexModel,
                snapshot.MultiSummaryProvider
            );
        }

        WebLlmPreferences webSnapshot;
        lock (_preferenceContext.WebLlmLock)
        {
            webSnapshot = _preferenceContext.WebLlmPreferences.Clone();
        }

        return BuildModelStatusText(
            "web",
            webSnapshot.Mode,
            webSnapshot.SingleProvider,
            webSnapshot.SingleModel,
            webSnapshot.OrchestrationProvider,
            webSnapshot.OrchestrationModel,
            webSnapshot.MultiGroqModel,
            webSnapshot.MultiGeminiModel,
            webSnapshot.MultiCopilotModel,
            webSnapshot.MultiCerebrasModel,
            webSnapshot.MultiNvidiaModel,
            webSnapshot.MultiCodexModel,
            webSnapshot.MultiSummaryProvider
        );
    }

    public string ApplyTelegramProfileCommand(TelegramLlmProfileCommandMutationRequest request)
    {
        lock (_preferenceContext.TelegramLlmLock)
        {
            if (request.Profile == "talk")
            {
                ApplyTelegramTalkDefaults(request.Thinking);
                return $"텔레그램 프로필을 대화용으로 바꿨습니다. 모드={FormatModeDisplayName(_preferenceContext.TelegramLlmPreferences.Mode)}, thinking={_preferenceContext.TelegramLlmPreferences.TalkThinkingLevel}";
            }

            ApplyTelegramCodeDefaults(request.Thinking);
            return $"텔레그램 프로필을 코딩용으로 바꿨습니다. 모드={FormatModeDisplayName(_preferenceContext.TelegramLlmPreferences.Mode)}, thinking={_preferenceContext.TelegramLlmPreferences.CodeThinkingLevel}";
        }
    }

    private void ApplyTelegramTalkDefaults(string requestedThinking)
    {
        var fastModel = string.IsNullOrWhiteSpace(_providers.GroqModel) ? DefaultGroqPrimaryModel : _providers.GroqModel;
        TelegramLlmPreferencePolicy.ApplyTalkDefaults(
            _preferenceContext.TelegramLlmPreferences,
            requestedThinking,
            fastModel,
            _providers.GeminiModel,
            DefaultCopilotModel,
            _providers.CerebrasModel,
            _providers.CodexModel
        );
    }

    private void ApplyTelegramCodeDefaults(string requestedThinking)
    {
        var fastModel = string.IsNullOrWhiteSpace(_providers.GroqModel) ? DefaultGroqPrimaryModel : _providers.GroqModel;
        TelegramLlmPreferencePolicy.ApplyCodeDefaults(
            _preferenceContext.TelegramLlmPreferences,
            requestedThinking,
            fastModel,
            _providers.GeminiModel,
            DefaultCopilotModel,
            _providers.CerebrasModel,
            _providers.CodexModel
        );
    }

    private void ApplyWebTalkDefaults(string requestedThinking)
    {
        var fastModel = string.IsNullOrWhiteSpace(_providers.GroqModel) ? DefaultGroqPrimaryModel : _providers.GroqModel;
        var preferences = _preferenceContext.WebLlmPreferences;
        preferences.Profile = "talk";
        preferences.Mode = "orchestration";
        preferences.SingleProvider = "groq";
        preferences.SingleModel = fastModel;
        preferences.AutoGroqComplexUpgrade = true;
        preferences.OrchestrationProvider = "gemini";
        preferences.OrchestrationModel = _providers.GeminiModel;
        preferences.MultiGroqModel = fastModel;
        preferences.MultiGeminiModel = _providers.GeminiModel;
        preferences.MultiCopilotModel = DefaultCopilotModel;
        preferences.MultiCerebrasModel = _providers.CerebrasModel;
        preferences.MultiNvidiaModel = _providers.NvidiaModel;
        preferences.MultiCodexModel = _providers.CodexModel;
        preferences.MultiSummaryProvider = "gemini";
        preferences.TalkThinkingLevel = TelegramLlmPreferencePolicy.NormalizeThinkingLevel(requestedThinking, "low");
    }

    private void ApplyWebCodeDefaults(string requestedThinking)
    {
        var fastModel = string.IsNullOrWhiteSpace(_providers.GroqModel) ? DefaultGroqPrimaryModel : _providers.GroqModel;
        var preferences = _preferenceContext.WebLlmPreferences;
        preferences.Profile = "code";
        preferences.Mode = "orchestration";
        preferences.SingleProvider = "copilot";
        preferences.SingleModel = DefaultCopilotModel;
        preferences.AutoGroqComplexUpgrade = false;
        preferences.OrchestrationProvider = "gemini";
        preferences.OrchestrationModel = _providers.GeminiModel;
        preferences.MultiGroqModel = fastModel;
        preferences.MultiGeminiModel = _providers.GeminiModel;
        preferences.MultiCopilotModel = DefaultCopilotModel;
        preferences.MultiCerebrasModel = _providers.CerebrasModel;
        preferences.MultiNvidiaModel = _providers.NvidiaModel;
        preferences.MultiCodexModel = _providers.CodexModel;
        preferences.MultiSummaryProvider = "gemini";
        preferences.CodeThinkingLevel = TelegramLlmPreferencePolicy.NormalizeThinkingLevel(requestedThinking, "high");
    }

    private string SetTelegramProvider(string slot, string provider)
    {
        return slot switch
        {
            "single" => _telegramMutationService.SetSingleProviderForCommand(provider),
            "orchestration" => _telegramMutationService.SetOrchestrationProviderForCommand(provider),
            "summary" => _telegramMutationService.SetMultiSummaryProviderForCommand(provider),
            _ => "지원 슬롯은 single, orchestration, summary 입니다."
        };
    }

    private string SetWebProviderCore(string slot, string provider)
    {
        var preferences = _preferenceContext.WebLlmPreferences;
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

            return $"웹 단일 제공자를 {FormatProviderDisplayName(provider)}로 바꿨습니다. 현재 모델: {ResolveModel(provider, preferences.SingleModel)}";
        }

        if (slot == "orchestration")
        {
            preferences.OrchestrationProvider = provider;
            return $"웹 오케스트레이션 담당을 {FormatProviderDisplayName(provider, allowAuto: true)}로 바꿨습니다.";
        }

        if (slot == "summary")
        {
            preferences.MultiSummaryProvider = provider;
            return $"웹 다중 요약 담당을 {FormatProviderDisplayName(provider, allowAuto: true)}로 바꿨습니다.";
        }

        return "지원 슬롯은 single, orchestration, summary 입니다.";
    }

    private string SetTelegramModel(string slot, string model)
    {
        return slot switch
        {
            "single" => _telegramMutationService.SetSingleModelForCommand(model),
            "orchestration" => _telegramMutationService.SetOrchestrationModelForCommand(model),
            _ => _telegramMutationService.SetMultiChannelModelForCommand(slot, model)
        };
    }

    private string SetWebModelCore(string slot, string model)
    {
        var preferences = _preferenceContext.WebLlmPreferences;
        if (slot == "single")
        {
            preferences.SingleModel = model;
            if (preferences.SingleProvider == "groq")
            {
                preferences.AutoGroqComplexUpgrade = model.Equals(DefaultGroqFastModel, StringComparison.OrdinalIgnoreCase);
            }

            return $"웹 단일 모델을 {model}로 바꿨습니다.";
        }

        if (slot == "orchestration")
        {
            preferences.OrchestrationModel = model;
            return $"웹 오케스트레이션 모델을 {model}로 바꿨습니다.";
        }

        if (slot == "multi.groq")
        {
            preferences.MultiGroqModel = model;
            return $"웹 다중 Groq 모델을 {model}로 바꿨습니다.";
        }

        if (slot == "multi.gemini")
        {
            preferences.MultiGeminiModel = model;
            return $"웹 다중 Gemini 모델을 {model}로 바꿨습니다.";
        }

        if (slot == "multi.copilot")
        {
            preferences.MultiCopilotModel = model;
            return $"웹 다중 Copilot 모델을 {model}로 바꿨습니다.";
        }

        if (slot == "multi.cerebras")
        {
            preferences.MultiCerebrasModel = model;
            return $"웹 다중 Cerebras 모델을 {model}로 바꿨습니다.";
        }

        if (slot == "multi.nvidia")
        {
            preferences.MultiNvidiaModel = model;
            return $"웹 다중 NVIDIA NIM 모델을 {model}로 바꿨습니다.";
        }

        if (slot == "multi.codex")
        {
            preferences.MultiCodexModel = model;
            return $"웹 다중 Codex 모델을 {model}로 바꿨습니다.";
        }

        return "지원 슬롯은 single, orchestration, multi.groq, multi.gemini, multi.copilot, multi.cerebras, multi.nvidia, multi.codex 입니다.";
    }

    private string BuildModelStatusText(
        string channel,
        string mode,
        string singleProvider,
        string singleModel,
        string orchestrationProvider,
        string orchestrationModel,
        string multiGroqModel,
        string multiGeminiModel,
        string multiCopilotModel,
        string multiCerebrasModel,
        string multiNvidiaModel,
        string multiCodexModel,
        string multiSummaryProvider
    )
    {
        return $"""
                [{(channel == "telegram" ? "텔레그램" : "웹")} LLM 설정]
                현재 모드: {FormatModeDisplayName(mode)}
                단일: {FormatProviderWithModel(singleProvider, singleModel)}
                오케스트레이션: {FormatProviderWithModel(orchestrationProvider, orchestrationModel, allowAuto: true)}
                다중 Groq: {FormatProviderWithModel("groq", multiGroqModel)}
                다중 Gemini: {FormatProviderWithModel("gemini", multiGeminiModel)}
                다중 Copilot: {FormatProviderWithModel("copilot", multiCopilotModel)}
                다중 Cerebras: {FormatProviderWithModel("cerebras", multiCerebrasModel)}
                다중 NVIDIA NIM: {FormatProviderWithModel("nvidia", multiNvidiaModel)}
                다중 Codex: {FormatProviderWithModel("codex", multiCodexModel)}
                다중 요약 담당: {FormatProviderDisplayName(multiSummaryProvider, allowAuto: true)}
                """;
    }

    private string FormatProviderWithModel(string provider, string? model, bool allowAuto = false)
    {
        var normalizedProvider = NormalizeProvider(provider, allowAuto);
        if (allowAuto && normalizedProvider == "auto")
        {
            return $"자동 선택 (기본: {FormatProviderDisplayName("gemini")})";
        }

        return $"{FormatProviderDisplayName(normalizedProvider)} / {ResolveModel(normalizedProvider, model)}";
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

    private static string FormatModeDisplayName(string mode)
    {
        return (mode ?? string.Empty).Trim().ToLowerInvariant() switch
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
