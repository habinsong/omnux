namespace Omnux.Middleware.Tests;

public sealed class NaturalCommandDeterministicPolicyTests
{
    [Theory]
    [InlineData("추론모드와 스킬 꺼", 2)]
    [InlineData("스킬과 웹 다 해제", 2)]
    [InlineData("추론·웹·스킬 모두 꺼", 3)]
    public void TryResolveCompoundOffToggle_ReturnsExpectedOffCommands(string input, int expectedCount)
    {
        var commands = NaturalCommandDeterministicPolicy.TryResolveCompoundOffToggle(input);

        Assert.NotNull(commands);
        Assert.Equal(expectedCount, commands!.Count);
    }

    [Theory]
    [InlineData("casual-chat 스킬을 c 라는 별명으로 등록해줘", "/skill quick c casual-chat")]
    [InlineData("별명 e로 eli5 스킬 등록", "/skill quick e eli5")]
    [InlineData("최근 대화 7개 보여줘", "/history 7")]
    [InlineData("웹 검색 꺼", "/web off")]
    public void TryResolveDeterministicNaturalCommand_ReturnsExpectedSlashCommand(string input, string expected)
    {
        var command = NaturalCommandDeterministicPolicy.TryResolveDeterministicNaturalCommand(input);

        Assert.Equal(expected, command);
    }
}
