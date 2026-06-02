using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

// LlmControlSlashCommandHandler를 CommandService 없이 ILlmControlApplicationService fake만으로 구동한다(결함 4번 M4).
// /llm help·set* 만 소유하고 usage/models는 fall-through(레거시 리포트)임을 검증한다.
public sealed class LlmControlSlashCommandHandlerTests
{
    [Fact]
    public void CanHandleHelpAndSetButNotUsageModelsOrChannelVariants()
    {
        var handler = new LlmControlSlashCommandHandler(new FakeLlmControlService());

        Assert.True(handler.CanHandle(new SlashCommandContext("/llm help", "web")));
        Assert.True(handler.CanHandle(new SlashCommandContext("/llm", "web"))); // bare → help
        Assert.True(handler.CanHandle(new SlashCommandContext("/llm set groq m1", "web")));
        Assert.True(handler.CanHandle(new SlashCommandContext("/llm set copilot gpt-5-mini", "web")));
        Assert.True(handler.CanHandle(new SlashCommandContext("/llm set codex gpt-5.4", "web")));
        Assert.True(handler.CanHandle(new SlashCommandContext("/llm set nvidia meta/llama", "web")));

        // usage/models는 리포트(레거시)로 fall-through
        Assert.False(handler.CanHandle(new SlashCommandContext("/llm usage", "web")));
        Assert.False(handler.CanHandle(new SlashCommandContext("/llm models groq", "web")));
        // /llm single|mode 등은 채널 핸들러(SetProvider/SetMode) 소유 → 여기선 false
        Assert.False(handler.CanHandle(new SlashCommandContext("/llm single provider groq", "web")));
        Assert.False(handler.CanHandle(new SlashCommandContext("/llm mode single", "web")));
        Assert.False(handler.CanHandle(new SlashCommandContext("/doctor", "web")));
    }

    [Fact]
    public async Task HelpReturnsUnifiedLlmHelp()
    {
        var handler = new LlmControlSlashCommandHandler(new FakeLlmControlService());
        var result = await handler.HandleAsync(new SlashCommandContext("/llm help", "web"), CancellationToken.None);
        Assert.Equal(CommandHelpTextPolicy.BuildUnifiedLlmHelpText("web"), result);
    }

    [Fact]
    public async Task SetGroqRoutesToGroqWithModelId()
    {
        var fake = new FakeLlmControlService { GroqResult = "Groq 모델 설정됨" };
        var handler = new LlmControlSlashCommandHandler(fake);

        var result = await handler.HandleAsync(new SlashCommandContext("/llm set groq meta-llama/llama-4-scout", "web"), CancellationToken.None);

        Assert.Equal("web", fake.LastGroqSource);
        Assert.Equal("meta-llama/llama-4-scout", fake.LastGroqModel);
        Assert.Equal("Groq 모델 설정됨", result);
    }

    [Fact]
    public async Task SetCopilotRoutesToCopilot()
    {
        var fake = new FakeLlmControlService();
        var handler = new LlmControlSlashCommandHandler(fake);

        await handler.HandleAsync(new SlashCommandContext("/llm set copilot gpt-5-mini", "web"), CancellationToken.None);

        Assert.Equal("gpt-5-mini", fake.LastCopilotModel);
    }

    [Fact]
    public async Task SetCodexRoutesToProviderThenModel()
    {
        var fake = new FakeLlmControlService();
        var handler = new LlmControlSlashCommandHandler(fake);

        await handler.HandleAsync(new SlashCommandContext("/llm set codex gpt-5.4", "telegram"), CancellationToken.None);

        Assert.Equal("telegram", fake.LastProviderSource);
        Assert.Equal("codex", fake.LastProvider);
        Assert.Equal("gpt-5.4", fake.LastProviderModel);
    }

    [Fact]
    public async Task SetNvidiaRoutesToProviderThenModel()
    {
        var fake = new FakeLlmControlService();
        var handler = new LlmControlSlashCommandHandler(fake);

        await handler.HandleAsync(new SlashCommandContext("/llm set nvidia meta/llama-3.3-70b-instruct", "web"), CancellationToken.None);

        Assert.Equal("nvidia", fake.LastProvider);
        Assert.Equal("meta/llama-3.3-70b-instruct", fake.LastProviderModel);
    }

    private sealed class FakeLlmControlService : ILlmControlApplicationService
    {
        public string GroqResult { get; set; } = "ok";
        public string? LastGroqSource { get; private set; }
        public string? LastGroqModel { get; private set; }
        public string? LastCopilotModel { get; private set; }
        public string? LastProviderSource { get; private set; }
        public string? LastProvider { get; private set; }
        public string? LastProviderModel { get; private set; }

        public Task<string> SetGroqModelAsync(string source, string model, CancellationToken cancellationToken)
        {
            LastGroqSource = source;
            LastGroqModel = model;
            return Task.FromResult(GroqResult);
        }

        public Task<string> SetCopilotModelAsync(string source, string model, CancellationToken cancellationToken)
        {
            LastCopilotModel = model;
            return Task.FromResult("copilot ok");
        }

        public Task<string> SetModelForProviderAsync(string source, string provider, string model, CancellationToken cancellationToken)
        {
            LastProviderSource = source;
            LastProvider = provider;
            LastProviderModel = model;
            return Task.FromResult("provider-then-model ok");
        }
    }
}
