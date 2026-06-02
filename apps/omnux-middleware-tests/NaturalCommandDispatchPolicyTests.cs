using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class NaturalCommandDispatchPolicyTests
{
    [Fact]
    public void Resolve_ReturnsSlashCommandForValidInterpretation()
    {
        var interpretation = new NaturalCommandInterpretation(
            "command",
            "memory.clear",
            new Dictionary<string, string>(),
            0.9d,
            string.Empty
        );

        var decision = NaturalCommandDispatchPolicy.Resolve("telegram", interpretation, "메모리 지워");

        Assert.True(decision.ShouldExecute);
        Assert.False(decision.IsChat);
        Assert.Equal("/memory clear", decision.SlashCommand);
        Assert.Equal("ok", decision.Code);
    }

    [Fact]
    public void Resolve_ReturnsChatDecisionForChatInterpretation()
    {
        var interpretation = new NaturalCommandInterpretation(
            "chat",
            string.Empty,
            new Dictionary<string, string>(),
            0.99d,
            string.Empty
        );

        var decision = NaturalCommandDispatchPolicy.Resolve("web", interpretation, "그냥 대화");

        Assert.False(decision.ShouldExecute);
        Assert.True(decision.IsChat);
        Assert.Null(decision.SlashCommand);
        Assert.Equal("chat", decision.Code);
    }

    [Fact]
    public void Resolve_ReturnsMessageForNaturalKillRequest()
    {
        var interpretation = new NaturalCommandInterpretation(
            "command",
            "kill.request",
            new Dictionary<string, string>(),
            0.95d,
            string.Empty
        );

        var decision = NaturalCommandDispatchPolicy.Resolve("telegram", interpretation, "pid 12345 종료");

        Assert.False(decision.ShouldExecute);
        Assert.False(decision.IsChat);
        Assert.Null(decision.SlashCommand);
        Assert.Equal("natural_kill_disallowed", decision.Code);
        Assert.Contains("/kill <pid>", decision.Message);
    }
}
