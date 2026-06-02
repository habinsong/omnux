namespace Omnux.Middleware.Tests;

public sealed class KillCommandPolicyTests
{
    [Theory]
    [InlineData("/kill 2", 2)]
    [InlineData("/KILL 123", 123)]
    [InlineData("/kill   9", 9)]
    public void TryParse_ReturnsPidForValidCommands(string text, int expectedPid)
    {
        var ok = KillCommandPolicy.TryParse(text, out var pid);

        Assert.True(ok);
        Assert.Equal(expectedPid, pid);
    }

    [Theory]
    [InlineData("")]
    [InlineData("kill 3")]
    [InlineData("/kill")]
    [InlineData("/kill 1")]
    [InlineData("/kill abc")]
    [InlineData("/kill 2 3")]
    public void TryParse_RejectsInvalidCommands(string text)
    {
        var ok = KillCommandPolicy.TryParse(text, out var pid);

        Assert.False(ok);
        Assert.Equal(0, pid);
    }
}
