namespace Omnux.Middleware.Tests;

public sealed class AppConfigTests
{
    [Fact]
    public void WebSocketLimitsClampToExpectedMinimums()
    {
        var config = AppConfig.LoadFromEnvironment();

        Assert.InRange(config.WebSocketMaxMessageBytes, 64 * 1024, 256 * 1024 * 1024);
        Assert.InRange(config.WebSocketCommandsPerMinute, 1, 1000);
        Assert.InRange(config.MetricsPushIntervalSec, 1, 60);
        Assert.InRange(config.CommandMaxLength, 1, 8192);
    }

    [Fact]
    public void AutoInstallDefaultsToDisabled()
    {
        var config = AppConfig.LoadFromEnvironment();

        Assert.False(config.EnableAutoInstall);
        Assert.False(config.Execution.EnableAutoInstall);
    }
}
