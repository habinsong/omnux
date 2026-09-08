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
    public void AutoInstallDefaultsToEnabled()
    {
        // 코딩 에이전트가 requirements/import 의존성을 자동 설치할 수 있어야 실사용이 된다.
        // (OMNUX_ENABLE_AUTO_INSTALL=0/false 로 끌 수 있음.)
        var previous = Environment.GetEnvironmentVariable("OMNUX_ENABLE_AUTO_INSTALL");
        Environment.SetEnvironmentVariable("OMNUX_ENABLE_AUTO_INSTALL", null);
        try
        {
            var config = AppConfig.LoadFromEnvironment();

            Assert.True(config.EnableAutoInstall);
            Assert.True(config.Execution.EnableAutoInstall);
        }
        finally
        {
            Environment.SetEnvironmentVariable("OMNUX_ENABLE_AUTO_INSTALL", previous);
        }
    }
}
