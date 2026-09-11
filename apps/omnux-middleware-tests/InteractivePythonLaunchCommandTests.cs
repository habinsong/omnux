using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class InteractivePythonLaunchCommandTests
{
    private const string RunDirectory = "/tmp/omnux-run";
    private const string EntryPath = "/tmp/omnux-run/main.py";

    [Fact]
    public void GameLaunchUsesPython3OutsideWindows()
    {
        var command = CodingApplicationService.BuildInteractivePythonLaunchCommand(
            RunDirectory,
            EntryPath,
            new[] { EntryPath },
            new[] { "pygame" }
        );

        if (OperatingSystem.IsWindows())
        {
            return;
        }

        Assert.Contains($"python3 '{EntryPath}'", command);
        Assert.DoesNotContain($"python '{EntryPath}'", command);
    }

    [Fact]
    public void CursesLaunchOpensPlatformTerminal()
    {
        var command = CodingApplicationService.BuildInteractivePythonLaunchCommand(
            RunDirectory,
            EntryPath,
            new[] { EntryPath },
            new[] { "curses" }
        );

        if (OperatingSystem.IsMacOS())
        {
            Assert.Contains("osascript", command);
            return;
        }

        Assert.DoesNotContain("osascript", command);
        if (OperatingSystem.IsLinux() && RefactorToolAvailability.FindExecutable(new[] { "x-terminal-emulator" }) is not null)
        {
            Assert.Contains("x-terminal-emulator -e sh -c", command);
            Assert.Contains("python3", command);
        }
    }
}
