using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class GrokRequestContractTests
{
    [Theory]
    [InlineData("llm_chat_single")]
    [InlineData("llm_chat_orchestration")]
    [InlineData("llm_chat_multi")]
    [InlineData("coding_run_single")]
    [InlineData("coding_run_orchestration")]
    [InlineData("coding_run_multi")]
    public void GrokModelSurvivesTheWireParser(string type)
    {
        var message = WebSocketGateway.ParseClientMessage($$"""{"type":"{{type}}","provider":"grok","model":"grok-4.6","grokModel":"grok-custom"}""");
        Assert.NotNull(message);
        Assert.Equal("grok", message.Provider);
        Assert.Equal("grok-4.6", message.Model);
        Assert.Equal("grok-custom", message.GrokModel);
    }

    [Fact]
    public void LegacyClientDoesNotEnableTheNewWorker()
    {
        var message = WebSocketGateway.ParseClientMessage("""{"type":"llm_chat_multi"}""");
        Assert.Equal("none", message!.GrokModel);
    }

    [Fact]
    public void InvalidGrokModelTypeIsRejected()
        => Assert.Null(WebSocketGateway.ParseClientMessage("""{"type":"llm_chat_multi","grokModel":{}}"""));
}
