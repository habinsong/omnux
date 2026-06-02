using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class LlmSettingsApplicationServiceTests
{
    [Fact]
    public void ApplyChannelProfileBuildsWebTalkPreset()
    {
        var (_, context, service) = BuildService();

        var message = service.ApplyChannelProfile(new LlmChannelProfileRequest("web", "talk", "high"));

        Assert.Equal("웹 프로필을 대화용으로 바꿨습니다. 모드=오케스트레이션, thinking=high", message);
        Assert.Equal("talk", context.WebLlmPreferences.Profile);
        Assert.Equal("orchestration", context.WebLlmPreferences.Mode);
        Assert.Equal("groq", context.WebLlmPreferences.SingleProvider);
        Assert.Equal("groq-config", context.WebLlmPreferences.SingleModel);
        Assert.Equal("nvidia-config", context.WebLlmPreferences.MultiNvidiaModel);
        Assert.Equal("high", context.WebLlmPreferences.TalkThinkingLevel);
    }

    [Fact]
    public void SetTelegramProviderDelegatesToTelegramMutationService()
    {
        var (_, context, service) = BuildService();

        var message = service.SetChannelProvider(new LlmChannelProviderRequest("telegram", "single", "nvidia-nim"));

        Assert.Equal("텔레그램 단일 제공자를 NVIDIA NIM로 바꿨습니다. 현재 모델: nvidia-config", message);
        Assert.Equal("nvidia", context.TelegramLlmPreferences.SingleProvider);
        Assert.Equal("nvidia-config", context.TelegramLlmPreferences.SingleModel);
        Assert.False(context.TelegramLlmPreferences.AutoGroqComplexUpgrade);
    }

    [Fact]
    public void ApplyTelegramProfileCommandReturnsActualThinkingLevel()
    {
        var (_, context, service) = BuildService();

        var message = service.ApplyTelegramProfileCommand(new TelegramLlmProfileCommandMutationRequest("talk", "auto"));

        Assert.Equal("텔레그램 프로필을 대화용으로 바꿨습니다. 모드=오케스트레이션, thinking=low", message);
        Assert.Equal("talk", context.TelegramLlmPreferences.Profile);
        Assert.Equal("orchestration", context.TelegramLlmPreferences.Mode);
        Assert.Equal("low", context.TelegramLlmPreferences.TalkThinkingLevel);
    }

    [Fact]
    public void SetWebModelNormalizesLegacyCerebrasModel()
    {
        var (_, context, service) = BuildService();

        var message = service.SetChannelModel(new LlmChannelModelRequest("web", "multi.cerebras", "llama3.1-8b"));

        Assert.Equal("웹 다중 Cerebras 모델을 gpt-oss-120b로 바꿨습니다.", message);
        Assert.Equal("gpt-oss-120b", context.WebLlmPreferences.MultiCerebrasModel);
    }

    [Fact]
    public void BuildChannelModelStatusUsesChannelSnapshot()
    {
        var (_, _, service) = BuildService();
        service.SetChannelProvider(new LlmChannelProviderRequest("web", "single", "nvidia"));
        service.SetChannelModel(new LlmChannelModelRequest("web", "single", "nvidia-custom"));

        var status = service.BuildChannelModelStatus(new LlmChannelStatusRequest("web"));

        Assert.Contains("[웹 LLM 설정]", status, StringComparison.Ordinal);
        Assert.Contains("현재 모드: 단일", status, StringComparison.Ordinal);
        Assert.Contains("단일: NVIDIA NIM / nvidia-custom", status, StringComparison.Ordinal);
        Assert.Contains("다중 요약 담당: 자동 선택", status, StringComparison.Ordinal);
    }

    private static (AppConfig Config, LlmPreferenceContext Context, LlmSettingsApplicationService Service) BuildService()
    {
        var config = new AppConfig
        {
            GroqModel = "groq-config",
            GeminiModel = "gemini-config",
            CerebrasModel = "cerebras-config",
            NvidiaModel = "nvidia-config",
            CodexModel = "codex-config"
        };
        var context = new LlmPreferenceContext(config, "copilot-config");
        var selectedGroqModel = "groq-selected";
        var telegramMutation = new TelegramLlmMutationApplicationService(
            config.Providers,
            context,
            () => selectedGroqModel,
            model =>
            {
                selectedGroqModel = model;
                return true;
            },
            _ => true
        );
        var service = new LlmSettingsApplicationService(
            config.Providers,
            context,
            telegramMutation,
            () => selectedGroqModel
        );

        return (config, context, service);
    }
}
