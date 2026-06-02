namespace Omnux.Middleware.Tests;

public sealed class TelegramHelpTextPolicyTests
{
    [Theory]
    [InlineData("llm", "[LLM 도움말]", "/llm status")]
    [InlineData("routine", "[루틴 도움말]", "/routine list")]
    [InlineData("skills", "[스킬 도움말]", "/skill quick")]
    [InlineData("coding", "[코딩 도움말]", "/coding run")]
    [InlineData("refactor", "[Safe Refactor 도움말]", "/refactor preview")]
    [InlineData("doctor", "[진단 도움말]", "/doctor last json")]
    [InlineData("plan", "[계획 도움말]", "/plan create")]
    [InlineData("task", "[작업 도움말]", "/task output")]
    [InlineData("handoff", "[노트북 도움말]", "/handoff")]
    [InlineData("memory", "[메모리 도움말]", "/memory create")]
    [InlineData("natural", "[자연어 제어 도움말]", "/kill <pid>")]
    public void Build_ReturnsTopicSpecificHelp(string topic, string expectedHeader, string expectedCommand)
    {
        var text = TelegramHelpTextPolicy.Build(topic);

        Assert.Contains(expectedHeader, text);
        Assert.Contains(expectedCommand, text);
    }

    [Fact]
    public void Build_ReturnsDefaultHelpForUnknownTopic()
    {
        var text = TelegramHelpTextPolicy.Build("unknown");

        Assert.Contains("[omnux Telegram 도움말]", text);
        Assert.Contains("/help natural", text);
    }

    [Fact]
    public void Build_HandoffHelpExplainsTelegramIsTriggerNotHeavyWorkspace()
    {
        var text = TelegramHelpTextPolicy.Build("handoff");

        Assert.Contains("텔레그램은 알림/트리거", text);
        Assert.Contains("무거운 작업은 데스크톱", text);
        Assert.Contains("`/handoff`", text);
    }
}
