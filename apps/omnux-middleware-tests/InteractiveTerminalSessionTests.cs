using System.Text;
using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

/// <summary>
/// 빌드탭 "실행"이 진짜 터미널을 붙이는지 확인한다. isatty 가 false 면 curses 게임·입력 프롬프트가
/// 전부 죽기 때문에, 이 테스트가 그 전제를 지킨다.
/// </summary>
public sealed class InteractiveTerminalSessionTests
{
    private static async Task<(string Output, int ExitCode)> RunAsync(string command, string? input = null, int timeoutMs = 20000)
    {
        var directory = Directory.CreateTempSubdirectory("omnux-pty-test-").FullName;
        var output = new StringBuilder();
        var exited = new TaskCompletionSource<int>(TaskCreationOptions.RunContinuationsAsynchronously);
        await using var session = InteractiveTerminalSession.Start(
            "test-session",
            new TerminalSessionStartRequest(command, directory, 80, 24),
            chunk =>
            {
                lock (output)
                {
                    output.Append(chunk.Data);
                }
            },
            exit => exited.TrySetResult(exit.ExitCode)
        );

        if (input != null)
        {
            await Task.Delay(400);
            await session.WriteAsync(input, CancellationToken.None);
        }

        var completed = await Task.WhenAny(exited.Task, Task.Delay(timeoutMs));
        if (completed != exited.Task)
        {
            session.Stop();
            throw new TimeoutException($"프로그램이 끝나지 않았습니다. 출력=\n{output}");
        }

        try
        {
            Directory.Delete(directory, recursive: true);
        }
        catch
        {
        }

        lock (output)
        {
            return (output.ToString(), exited.Task.Result);
        }
    }

    [Fact]
    public async Task ProgramSeesARealTerminal()
    {
        if (!InteractiveTerminalSession.IsSupported)
        {
            return; // Windows 는 대화형 실행을 지원하지 않는다.
        }

        var (output, exitCode) = await RunAsync(
            "python3 -c \"import sys,os;print('TTY', sys.stdin.isatty(), os.get_terminal_size().columns)\""
        );

        Assert.Contains("TTY True 80", output.Replace("\r\n", "\n", StringComparison.Ordinal));
        Assert.Equal(0, exitCode);
    }

    [Fact]
    public async Task ProgramReceivesKeyboardInput()
    {
        if (!InteractiveTerminalSession.IsSupported)
        {
            return; // Windows 는 대화형 실행을 지원하지 않는다.
        }

        var (output, _) = await RunAsync(
            "python3 -c \"name=input('NAME? ');print('HELLO '+name)\"",
            input: "omnux\n"
        );

        Assert.Contains("NAME?", output);
        Assert.Contains("HELLO omnux", output);
    }

    [Fact]
    public async Task AnsiControlSequencesReachTheClient()
    {
        if (!InteractiveTerminalSession.IsSupported)
        {
            return; // Windows 는 대화형 실행을 지원하지 않는다.
        }

        var (output, _) = await RunAsync(
            "python3 -c \"import sys;sys.stdout.write(chr(27)+'[2J'+chr(27)+'[H'+'CLEARED');sys.stdout.flush()\""
        );

        Assert.Contains("[2J", output);
        Assert.Contains("CLEARED", output);
    }

    [Fact]
    public void PtyWrapperQuotesTheInnerCommandSafely()
    {
        var wrapper = InteractiveTerminalSession.BuildPtyWrapperCommand("echo 'it''s fine'");

        Assert.Contains("script", wrapper);
        Assert.DoesNotContain("echo 'it's fine'", wrapper);
    }
}
