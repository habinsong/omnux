namespace Omnux.Middleware;

public sealed partial class CommandService
{
    private string ApplyChannelProfile(string source, string profile, string thinking)
    {
        return _llmSettingsAppService.ApplyChannelProfile(new LlmChannelProfileRequest(source, profile, thinking));
    }

    private string SetChannelMode(string source, string mode)
    {
        return _llmSettingsAppService.SetChannelMode(new LlmChannelModeRequest(source, mode));
    }

    private string SetChannelProvider(string source, string slot, string provider)
    {
        return _llmSettingsAppService.SetChannelProvider(new LlmChannelProviderRequest(source, slot, provider));
    }

    private string SetChannelModel(string source, string slot, string modelId)
    {
        return _llmSettingsAppService.SetChannelModel(new LlmChannelModelRequest(source, slot, modelId));
    }

    private string BuildChannelModelStatus(string source)
    {
        return _llmSettingsAppService.BuildChannelModelStatus(new LlmChannelStatusRequest(source));
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
}
