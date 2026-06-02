namespace Omnux.Middleware.Tests;

public sealed class CommandHelpTextPolicyTests
{
    [Theory]
    [InlineData("telegram", "[텔레그램 LLM 도움말]", "/llm status")]
    [InlineData("web", "[웹 LLM 도움말]", "/llm usage")]
    public void BuildUnifiedLlmHelpText_ReturnsChannelSpecificHelp(string source, string expectedHeader, string expectedCommand)
    {
        var text = CommandHelpTextPolicy.BuildUnifiedLlmHelpText(source);

        Assert.Contains(expectedHeader, text);
        Assert.Contains(expectedCommand, text);
    }

    [Fact]
    public void BuildMemoryCommandHelpText_ReturnsMemoryHelp()
    {
        var text = CommandHelpTextPolicy.BuildMemoryCommandHelpText();

        Assert.Contains("[메모리 명령]", text);
        Assert.Contains("/memory create compact", text);
    }
}
