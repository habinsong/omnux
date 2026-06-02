using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

// ChannelSettingsSlashCommandHandler를 CommandService 없이 ILlmSettingsApplicationService fake만으로 구동한다(결함 4번 M4).
// 채널 LLM 설정(/talk /code /profile /mode /provider /model /status model)이 도메인 서비스에만 의존함을 증명한다.
public sealed class ChannelSettingsSlashCommandHandlerTests
{
    [Fact]
    public void CanHandleValidChannelCommandsAndRejectsMalformedOrOthers()
    {
        var handler = new ChannelSettingsSlashCommandHandler(new FakeLlmSettingsService());

        Assert.True(handler.CanHandle(new SlashCommandContext("/talk", "web")));
        Assert.True(handler.CanHandle(new SlashCommandContext("/code high", "web")));
        Assert.True(handler.CanHandle(new SlashCommandContext("/profile talk high", "web")));
        Assert.True(handler.CanHandle(new SlashCommandContext("/mode single", "web")));
        Assert.True(handler.CanHandle(new SlashCommandContext("/provider single groq", "web")));
        Assert.True(handler.CanHandle(new SlashCommandContext("/model single gpt-5-mini", "web")));
        Assert.True(handler.CanHandle(new SlashCommandContext("/model groq", "web"))); // quick provider alias
        Assert.True(handler.CanHandle(new SlashCommandContext("/status model", "web")));

        // 잘못된 형식은 StaticMessage(usage)로 파싱되어 StaticSlashCommandHandler가 소유한다.
        Assert.False(handler.CanHandle(new SlashCommandContext("/profile", "web")));
        Assert.False(handler.CanHandle(new SlashCommandContext("/mode", "web")));
        Assert.False(handler.CanHandle(new SlashCommandContext("/status", "web")));
        Assert.False(handler.CanHandle(new SlashCommandContext("/doctor", "web")));
    }

    [Fact]
    public async Task ProfileForwardsProfileAndThinking()
    {
        var fake = new FakeLlmSettingsService { ProfileResult = "talk 프로필 적용" };
        var handler = new ChannelSettingsSlashCommandHandler(fake);

        var result = await handler.HandleAsync(new SlashCommandContext("/profile talk high", "web"), CancellationToken.None);

        Assert.Equal("web", fake.LastProfile.Source);
        Assert.Equal("talk", fake.LastProfile.Profile);
        Assert.Equal("high", fake.LastProfile.Thinking);
        Assert.Equal("talk 프로필 적용", result);
    }

    [Fact]
    public async Task TalkShortcutForwardsProfile()
    {
        var fake = new FakeLlmSettingsService();
        var handler = new ChannelSettingsSlashCommandHandler(fake);

        await handler.HandleAsync(new SlashCommandContext("/talk", "web"), CancellationToken.None);

        Assert.Equal("talk", fake.LastProfile.Profile);
        Assert.Equal("auto", fake.LastProfile.Thinking);
    }

    [Fact]
    public async Task ModeForwardsMode()
    {
        var fake = new FakeLlmSettingsService { ModeResult = "모드=single" };
        var handler = new ChannelSettingsSlashCommandHandler(fake);

        var result = await handler.HandleAsync(new SlashCommandContext("/mode single", "web"), CancellationToken.None);

        Assert.Equal("single", fake.LastMode.Mode);
        Assert.Equal("모드=single", result);
    }

    [Fact]
    public async Task ProviderForwardsSlotAndProvider()
    {
        var fake = new FakeLlmSettingsService();
        var handler = new ChannelSettingsSlashCommandHandler(fake);

        await handler.HandleAsync(new SlashCommandContext("/provider single groq", "web"), CancellationToken.None);

        Assert.Equal("single", fake.LastProvider.Slot);
        Assert.Equal("groq", fake.LastProvider.Provider);
    }

    [Fact]
    public async Task ModelForwardsSlotAndModelId()
    {
        var fake = new FakeLlmSettingsService();
        var handler = new ChannelSettingsSlashCommandHandler(fake);

        await handler.HandleAsync(new SlashCommandContext("/model single gpt-5-mini", "web"), CancellationToken.None);

        Assert.Equal("single", fake.LastModel.Slot);
        Assert.Equal("gpt-5-mini", fake.LastModel.ModelId);
    }

    [Fact]
    public async Task QuickModelAliasForwardsAsProvider()
    {
        // /model groq → SetProvider("single","groq") (quick provider alias), 레거시와 동일.
        var fake = new FakeLlmSettingsService();
        var handler = new ChannelSettingsSlashCommandHandler(fake);

        await handler.HandleAsync(new SlashCommandContext("/model groq", "web"), CancellationToken.None);

        Assert.Equal("single", fake.LastProvider.Slot);
        Assert.Equal("groq", fake.LastProvider.Provider);
    }

    [Fact]
    public async Task StatusBuildsChannelStatus()
    {
        var fake = new FakeLlmSettingsService { StatusResult = "현재 모델 상태..." };
        var handler = new ChannelSettingsSlashCommandHandler(fake);

        var result = await handler.HandleAsync(new SlashCommandContext("/status model", "web"), CancellationToken.None);

        Assert.Equal("web", fake.LastStatus.Source);
        Assert.Equal("현재 모델 상태...", result);
    }

    private sealed class FakeLlmSettingsService : ILlmSettingsApplicationService
    {
        public string ProfileResult { get; set; } = "ok";
        public string ModeResult { get; set; } = "ok";
        public string StatusResult { get; set; } = "ok";

        public LlmChannelProfileRequest LastProfile { get; private set; }
        public LlmChannelModeRequest LastMode { get; private set; }
        public LlmChannelProviderRequest LastProvider { get; private set; }
        public LlmChannelModelRequest LastModel { get; private set; }
        public LlmChannelStatusRequest LastStatus { get; private set; }

        public string ApplyChannelProfile(LlmChannelProfileRequest request)
        {
            LastProfile = request;
            return ProfileResult;
        }

        public string SetChannelMode(LlmChannelModeRequest request)
        {
            LastMode = request;
            return ModeResult;
        }

        public string SetChannelProvider(LlmChannelProviderRequest request)
        {
            LastProvider = request;
            return "provider ok";
        }

        public string SetChannelModel(LlmChannelModelRequest request)
        {
            LastModel = request;
            return "model ok";
        }

        public string BuildChannelModelStatus(LlmChannelStatusRequest request)
        {
            LastStatus = request;
            return StatusResult;
        }

        public string ApplyTelegramProfileCommand(TelegramLlmProfileCommandMutationRequest request)
            => throw new NotSupportedException();
    }
}
