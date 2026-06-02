using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class TelegramCodingSettingsApplicationServiceTests
{
    [Fact]
    public void SetLanguageUsesCurrentModeAndNormalizesLanguage()
    {
        var (context, service) = BuildService();
        service.SetMode(new TelegramCodingModeMutationRequest("multi"));

        var message = service.SetLanguage(new TelegramCodingLanguageMutationRequest(null, "ts"));

        Assert.Equal("텔레그램 다중 코딩 언어를 typescript로 바꿨습니다.", message);
        Assert.Equal("typescript", context.TelegramCodingPreferences.MultiLanguage);
        Assert.Equal("auto", context.TelegramCodingPreferences.SingleLanguage);
    }

    [Fact]
    public void SetAggregateProviderAcceptsNvidiaAlias()
    {
        var (context, service) = BuildService();

        var message = service.SetAggregateProvider(new TelegramCodingAggregateProviderMutationRequest("orchestration", "nvidia-nim"));

        Assert.Equal("텔레그램 오케스트레이션 코딩 제공자를 NVIDIA NIM로 바꿨습니다.", message);
        Assert.Equal("nvidia", context.TelegramCodingPreferences.OrchestrationProvider);
    }

    [Fact]
    public void SetAggregateModelPinsCopilotProvider()
    {
        var (context, service) = BuildService();

        var message = service.SetAggregateModel(new TelegramCodingAggregateModelMutationRequest("single", "custom-copilot"));

        Assert.Equal("텔레그램 단일 코딩 모델을 gpt-5-mini로 바꿨습니다.", message);
        Assert.Equal("gpt-5-mini", context.TelegramCodingPreferences.SingleModel);
    }

    [Fact]
    public void SetWorkerModelKeepsNoneForDisabledWorker()
    {
        var (context, service) = BuildService();

        var message = service.SetWorkerModel(new TelegramCodingWorkerModelMutationRequest("multi", "codex", "none"));

        Assert.Equal("텔레그램 다중 코딩 워커 Codex 모델을 none로 바꿨습니다.", message);
        Assert.Equal("none", context.TelegramCodingPreferences.MultiCodexModel);
    }

    [Fact]
    public void GetSnapshotReturnsClone()
    {
        var (context, service) = BuildService();

        var snapshot = service.GetSnapshot();
        snapshot.Mode = "single";

        Assert.Equal("orchestration", context.TelegramCodingPreferences.Mode);
    }

    private static (LlmPreferenceContext Context, TelegramCodingSettingsApplicationService Service) BuildService()
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
        return (context, new TelegramCodingSettingsApplicationService(context));
    }
}
