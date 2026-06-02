namespace Omnux.Middleware;

public sealed partial class CommandService
{
    private string ApplyChannelProfile(string source, string profile, string thinking)
    {
        var normalizedSource = (source ?? string.Empty).Trim().ToLowerInvariant();
        var thinkingLabel = thinking == "high" ? "high" : thinking == "low" ? "low" : "auto";
        if (normalizedSource == "telegram")
        {
            lock (_telegramLlmLock)
            {
                if (profile == "talk")
                {
                    ApplyTelegramTalkDefaults(thinking);
                    return $"텔레그램 프로필을 대화용으로 바꿨습니다. 모드={FormatModeDisplayName(_telegramLlmPreferences.Mode)}, thinking={thinkingLabel}";
                }

                ApplyTelegramCodeDefaults(thinking);
                return $"텔레그램 프로필을 코딩용으로 바꿨습니다. 모드={FormatModeDisplayName(_telegramLlmPreferences.Mode)}, thinking={thinkingLabel}";
            }
        }

        lock (_webLlmLock)
        {
            if (profile == "talk")
            {
                ApplyWebTalkDefaults(thinking);
                return $"웹 프로필을 대화용으로 바꿨습니다. 모드={FormatModeDisplayName(_webLlmPreferences.Mode)}, thinking={thinkingLabel}";
            }

            ApplyWebCodeDefaults(thinking);
            return $"웹 프로필을 코딩용으로 바꿨습니다. 모드={FormatModeDisplayName(_webLlmPreferences.Mode)}, thinking={thinkingLabel}";
        }
    }

    private string SetChannelMode(string source, string mode)
    {
        if (mode is not ("single" or "orchestration" or "multi"))
        {
            return "지원 모드는 single, orchestration, multi 입니다.";
        }

        if (source.Equals("telegram", StringComparison.OrdinalIgnoreCase))
        {
            lock (_telegramLlmLock)
            {
                _telegramLlmPreferences.Mode = mode;
            }

            return $"텔레그램 LLM 모드를 {FormatModeDisplayName(mode)}로 바꿨습니다.";
        }

        lock (_webLlmLock)
        {
            _webLlmPreferences.Mode = mode;
        }

        return $"웹 LLM 모드를 {FormatModeDisplayName(mode)}로 바꿨습니다.";
    }

    private string SetChannelProvider(string source, string slot, string provider)
    {
        var normalizedSlot = (slot ?? string.Empty).Trim().ToLowerInvariant();
        var allowAuto = normalizedSlot is "orchestration" or "summary";
        var normalizedProvider = NormalizeProvider(provider, allowAuto);
        if (!allowAuto && normalizedProvider == "auto")
        {
            return "지원 제공자는 groq, gemini, copilot, cerebras, nvidia, codex 입니다.";
        }

        if (source.Equals("telegram", StringComparison.OrdinalIgnoreCase))
        {
            lock (_telegramLlmLock)
            {
                return SetTelegramProviderCore(normalizedSlot, normalizedProvider);
            }
        }

        lock (_webLlmLock)
        {
            return SetWebProviderCore(normalizedSlot, normalizedProvider);
        }
    }

    private string SetChannelModel(string source, string slot, string modelId)
    {
        var normalizedSlot = (slot ?? string.Empty).Trim().ToLowerInvariant();
        var normalizedModel = NormalizeModelSelection(modelId);
        if (string.IsNullOrWhiteSpace(normalizedModel))
        {
            return "model-id를 입력하세요.";
        }

        if (source.Equals("telegram", StringComparison.OrdinalIgnoreCase))
        {
            lock (_telegramLlmLock)
            {
                return SetTelegramModelCore(normalizedSlot, normalizedModel);
            }
        }

        lock (_webLlmLock)
        {
            return SetWebModelCore(normalizedSlot, normalizedModel);
        }
    }

    private string BuildChannelModelStatus(string source)
    {
        if (source.Equals("telegram", StringComparison.OrdinalIgnoreCase))
        {
            TelegramLlmPreferences snapshot;
            lock (_telegramLlmLock)
            {
                snapshot = _telegramLlmPreferences.Clone();
            }

            return BuildModelStatusText("telegram", snapshot.Mode, snapshot.SingleProvider, snapshot.SingleModel, snapshot.OrchestrationProvider, snapshot.OrchestrationModel, snapshot.MultiGroqModel, snapshot.MultiGeminiModel, snapshot.MultiCopilotModel, snapshot.MultiCerebrasModel, snapshot.MultiNvidiaModel, snapshot.MultiCodexModel, snapshot.MultiSummaryProvider);
        }

        WebLlmPreferences webSnapshot;
        lock (_webLlmLock)
        {
            webSnapshot = _webLlmPreferences.Clone();
        }

        return BuildModelStatusText("web", webSnapshot.Mode, webSnapshot.SingleProvider, webSnapshot.SingleModel, webSnapshot.OrchestrationProvider, webSnapshot.OrchestrationModel, webSnapshot.MultiGroqModel, webSnapshot.MultiGeminiModel, webSnapshot.MultiCopilotModel, webSnapshot.MultiCerebrasModel, webSnapshot.MultiNvidiaModel, webSnapshot.MultiCodexModel, webSnapshot.MultiSummaryProvider);
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

    private string FormatProviderWithModel(string provider, string? model, bool allowAuto = false)
    {
        var normalizedProvider = NormalizeProvider(provider, allowAuto);
        if (allowAuto && normalizedProvider == "auto")
        {
            return $"자동 선택 (기본: {FormatProviderDisplayName("gemini")})";
        }

        return $"{FormatProviderDisplayName(normalizedProvider)} / {ResolveModel(normalizedProvider, model)}";
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

    private void ApplyWebTalkDefaults(string requestedThinking)
    {
        var fastModel = string.IsNullOrWhiteSpace(_providers.GroqModel) ? DefaultGroqPrimaryModel : _providers.GroqModel;
        _webLlmPreferences.Profile = "talk";
        _webLlmPreferences.Mode = "orchestration";
        _webLlmPreferences.SingleProvider = "groq";
        _webLlmPreferences.SingleModel = fastModel;
        _webLlmPreferences.AutoGroqComplexUpgrade = true;
        _webLlmPreferences.OrchestrationProvider = "gemini";
        _webLlmPreferences.OrchestrationModel = _providers.GeminiModel;
        _webLlmPreferences.MultiGroqModel = fastModel;
        _webLlmPreferences.MultiGeminiModel = _providers.GeminiModel;
        _webLlmPreferences.MultiCopilotModel = DefaultCopilotModel;
        _webLlmPreferences.MultiCerebrasModel = _providers.CerebrasModel;
        _webLlmPreferences.MultiNvidiaModel = _providers.NvidiaModel;
        _webLlmPreferences.MultiCodexModel = _providers.CodexModel;
        _webLlmPreferences.MultiSummaryProvider = "gemini";
        _webLlmPreferences.TalkThinkingLevel = TelegramLlmPreferencePolicy.NormalizeThinkingLevel(requestedThinking, "low");
    }

    private void ApplyWebCodeDefaults(string requestedThinking)
    {
        var fastModel = string.IsNullOrWhiteSpace(_providers.GroqModel) ? DefaultGroqPrimaryModel : _providers.GroqModel;
        _webLlmPreferences.Profile = "code";
        _webLlmPreferences.Mode = "orchestration";
        _webLlmPreferences.SingleProvider = "copilot";
        _webLlmPreferences.SingleModel = DefaultCopilotModel;
        _webLlmPreferences.AutoGroqComplexUpgrade = false;
        _webLlmPreferences.OrchestrationProvider = "gemini";
        _webLlmPreferences.OrchestrationModel = _providers.GeminiModel;
        _webLlmPreferences.MultiGroqModel = fastModel;
        _webLlmPreferences.MultiGeminiModel = _providers.GeminiModel;
        _webLlmPreferences.MultiCopilotModel = DefaultCopilotModel;
        _webLlmPreferences.MultiCerebrasModel = _providers.CerebrasModel;
        _webLlmPreferences.MultiNvidiaModel = _providers.NvidiaModel;
        _webLlmPreferences.MultiCodexModel = _providers.CodexModel;
        _webLlmPreferences.MultiSummaryProvider = "gemini";
        _webLlmPreferences.CodeThinkingLevel = TelegramLlmPreferencePolicy.NormalizeThinkingLevel(requestedThinking, "high");
    }

    private string SetTelegramProviderCore(string slot, string provider)
    {
        if (slot == "single")
        {
            _telegramLlmPreferences.SingleProvider = provider;
            if (provider == "groq")
            {
                _telegramLlmPreferences.SingleModel = string.IsNullOrWhiteSpace(_providers.GroqModel) ? DefaultGroqPrimaryModel : _providers.GroqModel;
                _telegramLlmPreferences.AutoGroqComplexUpgrade = true;
            }
            else if (provider == "copilot")
            {
                _telegramLlmPreferences.SingleModel = DefaultCopilotModel;
                _telegramLlmPreferences.AutoGroqComplexUpgrade = false;
            }
            else
            {
                _telegramLlmPreferences.SingleModel = provider switch
                {
                    "cerebras" => _providers.CerebrasModel,
                    "nvidia" => _providers.NvidiaModel,
                    "codex" => _providers.CodexModel,
                    _ => _providers.GeminiModel
                };
                _telegramLlmPreferences.AutoGroqComplexUpgrade = false;
            }

            return $"텔레그램 단일 제공자를 {FormatProviderDisplayName(provider)}로 바꿨습니다. 현재 모델: {ResolveModel(provider, _telegramLlmPreferences.SingleModel)}";
        }

        if (slot == "orchestration")
        {
            _telegramLlmPreferences.OrchestrationProvider = provider;
            return $"텔레그램 오케스트레이션 담당을 {FormatProviderDisplayName(provider, allowAuto: true)}로 바꿨습니다.";
        }

        if (slot == "summary")
        {
            _telegramLlmPreferences.MultiSummaryProvider = provider;
            return $"텔레그램 다중 요약 담당을 {FormatProviderDisplayName(provider, allowAuto: true)}로 바꿨습니다.";
        }

        return "지원 슬롯은 single, orchestration, summary 입니다.";
    }

    private string SetWebProviderCore(string slot, string provider)
    {
        if (slot == "single")
        {
            _webLlmPreferences.SingleProvider = provider;
            if (provider == "groq")
            {
                _webLlmPreferences.SingleModel = string.IsNullOrWhiteSpace(_providers.GroqModel) ? DefaultGroqPrimaryModel : _providers.GroqModel;
                _webLlmPreferences.AutoGroqComplexUpgrade = true;
            }
            else if (provider == "copilot")
            {
                _webLlmPreferences.SingleModel = DefaultCopilotModel;
                _webLlmPreferences.AutoGroqComplexUpgrade = false;
            }
            else
            {
                _webLlmPreferences.SingleModel = provider switch
                {
                    "cerebras" => _providers.CerebrasModel,
                    "nvidia" => _providers.NvidiaModel,
                    "codex" => _providers.CodexModel,
                    _ => _providers.GeminiModel
                };
                _webLlmPreferences.AutoGroqComplexUpgrade = false;
            }

            return $"웹 단일 제공자를 {FormatProviderDisplayName(provider)}로 바꿨습니다. 현재 모델: {ResolveModel(provider, _webLlmPreferences.SingleModel)}";
        }

        if (slot == "orchestration")
        {
            _webLlmPreferences.OrchestrationProvider = provider;
            return $"웹 오케스트레이션 담당을 {FormatProviderDisplayName(provider, allowAuto: true)}로 바꿨습니다.";
        }

        if (slot == "summary")
        {
            _webLlmPreferences.MultiSummaryProvider = provider;
            return $"웹 다중 요약 담당을 {FormatProviderDisplayName(provider, allowAuto: true)}로 바꿨습니다.";
        }

        return "지원 슬롯은 single, orchestration, summary 입니다.";
    }

    private string SetTelegramModelCore(string slot, string model)
    {
        if (slot == "single")
        {
            _telegramLlmPreferences.SingleModel = model;
            if (_telegramLlmPreferences.SingleProvider == "groq")
            {
                _telegramLlmPreferences.AutoGroqComplexUpgrade = model.Equals(DefaultGroqFastModel, StringComparison.OrdinalIgnoreCase);
            }

            return $"텔레그램 단일 모델을 {model}로 바꿨습니다.";
        }

        if (slot == "orchestration")
        {
            _telegramLlmPreferences.OrchestrationModel = model;
            return $"텔레그램 오케스트레이션 모델을 {model}로 바꿨습니다.";
        }

        if (slot == "multi.groq")
        {
            _telegramLlmPreferences.MultiGroqModel = model;
            return $"텔레그램 다중 Groq 모델을 {model}로 바꿨습니다.";
        }

        if (slot == "multi.gemini")
        {
            _telegramLlmPreferences.MultiGeminiModel = model;
            return $"텔레그램 다중 Gemini 모델을 {model}로 바꿨습니다.";
        }

        if (slot == "multi.copilot")
        {
            _telegramLlmPreferences.MultiCopilotModel = model;
            return $"텔레그램 다중 Copilot 모델을 {model}로 바꿨습니다.";
        }

        if (slot == "multi.cerebras")
        {
            _telegramLlmPreferences.MultiCerebrasModel = model;
            return $"텔레그램 다중 Cerebras 모델을 {model}로 바꿨습니다.";
        }

        if (slot == "multi.nvidia")
        {
            _telegramLlmPreferences.MultiNvidiaModel = model;
            return $"텔레그램 다중 NVIDIA NIM 모델을 {model}로 바꿨습니다.";
        }

        if (slot == "multi.codex")
        {
            _telegramLlmPreferences.MultiCodexModel = model;
            return $"텔레그램 다중 Codex 모델을 {model}로 바꿨습니다.";
        }

        return "지원 슬롯은 single, orchestration, multi.groq, multi.gemini, multi.copilot, multi.cerebras, multi.nvidia, multi.codex 입니다.";
    }

    private string SetWebModelCore(string slot, string model)
    {
        if (slot == "single")
        {
            _webLlmPreferences.SingleModel = model;
            if (_webLlmPreferences.SingleProvider == "groq")
            {
                _webLlmPreferences.AutoGroqComplexUpgrade = model.Equals(DefaultGroqFastModel, StringComparison.OrdinalIgnoreCase);
            }

            return $"웹 단일 모델을 {model}로 바꿨습니다.";
        }

        if (slot == "orchestration")
        {
            _webLlmPreferences.OrchestrationModel = model;
            return $"웹 오케스트레이션 모델을 {model}로 바꿨습니다.";
        }

        if (slot == "multi.groq")
        {
            _webLlmPreferences.MultiGroqModel = model;
            return $"웹 다중 Groq 모델을 {model}로 바꿨습니다.";
        }

        if (slot == "multi.gemini")
        {
            _webLlmPreferences.MultiGeminiModel = model;
            return $"웹 다중 Gemini 모델을 {model}로 바꿨습니다.";
        }

        if (slot == "multi.copilot")
        {
            _webLlmPreferences.MultiCopilotModel = model;
            return $"웹 다중 Copilot 모델을 {model}로 바꿨습니다.";
        }

        if (slot == "multi.cerebras")
        {
            _webLlmPreferences.MultiCerebrasModel = model;
            return $"웹 다중 Cerebras 모델을 {model}로 바꿨습니다.";
        }

        if (slot == "multi.nvidia")
        {
            _webLlmPreferences.MultiNvidiaModel = model;
            return $"웹 다중 NVIDIA NIM 모델을 {model}로 바꿨습니다.";
        }

        if (slot == "multi.codex")
        {
            _webLlmPreferences.MultiCodexModel = model;
            return $"웹 다중 Codex 모델을 {model}로 바꿨습니다.";
        }

        return "지원 슬롯은 single, orchestration, multi.groq, multi.gemini, multi.copilot, multi.cerebras, multi.nvidia, multi.codex 입니다.";
    }

}
