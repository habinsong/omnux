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

    [Fact]
    public void LaunchCommandDefinesVenvPythonBeforeUsingIt()
    {
        // 모듈 확인이 "$__omni_py" 를 쓰는데 그 변수를 정의하지 않으면 빈 명령이 실행돼
        // exit 127 로 죽는다(실측: /bin/bash: 줄 1: : 명령을 찾을 수 없음).
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

        var definitionIndex = command.IndexOf("__omni_py=", StringComparison.Ordinal);
        var usageIndex = command.IndexOf("\"$__omni_py\"", StringComparison.Ordinal);
        Assert.True(definitionIndex >= 0, "실행 명령이 __omni_py 를 정의해야 한다");
        Assert.True(usageIndex > definitionIndex, "변수를 쓰기 전에 정의해야 한다");
    }
}
