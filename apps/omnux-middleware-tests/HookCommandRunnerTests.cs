using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

/// <summary>실제 프로세스를 띄워 종료 코드·표준 입출력·시간 초과 계약을 확인한다.</summary>
public sealed class HookCommandRunnerTests : IDisposable
{
    private readonly string _dir = Path.Combine(
        Path.GetTempPath(),
        $"omnux-hook-runner-{Guid.NewGuid():N}"
    );

    public HookCommandRunnerTests()
    {
        Directory.CreateDirectory(_dir);
    }

    public void Dispose()
    {
        try { Directory.Delete(_dir, recursive: true); } catch { }
    }

    [Fact]
    public async Task ExitZeroWithJsonProducesDecision()
    {
        if (OperatingSystem.IsWindows())
        {
            return;
        }

        var run = await RunAsync("echo '{\"decision\":\"deny\",\"reason\":\"보호됨\"}'");
        Assert.Equal(HookRunStatus.Completed, run.Status);
        Assert.Equal(HookOutcome.Deny, run.Outcome);
        Assert.Equal("보호됨", run.Reason);
        Assert.Equal(0, run.ExitCode);
    }

    [Fact]
    public async Task ExitTwoBlocksAndKeepsStderrReason()
    {
        if (OperatingSystem.IsWindows())
        {
            return;
        }

        var run = await RunAsync("echo '금지된 경로' 1>&2; exit 2");
        Assert.Equal(HookRunStatus.Blocked, run.Status);
        Assert.Equal(HookOutcome.Deny, run.Outcome);
        Assert.Contains("금지된 경로", run.Reason);
        Assert.Equal(2, run.ExitCode);
    }

    [Fact]
    public async Task OtherNonZeroExitIsFailureNotBlock()
    {
        if (OperatingSystem.IsWindows())
        {
            return;
        }

        var run = await RunAsync("echo boom 1>&2; exit 7");
        Assert.Equal(HookRunStatus.Failed, run.Status);
        Assert.Equal(HookOutcome.None, run.Outcome);
        Assert.Equal(7, run.ExitCode);
        Assert.Contains("boom", run.Stderr);
    }

    [Fact]
    public async Task EventJsonReachesStandardInput()
    {
        if (OperatingSystem.IsWindows())
        {
            return;
        }

        var capturePath = Path.Combine(_dir, "stdin.json");
        var run = await RunAsync(
            $"cat > '{capturePath}'",
            input => input with
            {
                ToolName = "Bash",
                Command = "ls\t-a",
                FilePath = "/tmp/a.ts"
            }
        );

        Assert.Equal(HookRunStatus.Completed, run.Status);
        var captured = await File.ReadAllTextAsync(capturePath);
        using var document = System.Text.Json.JsonDocument.Parse(captured);
        var root = document.RootElement;
        Assert.Equal(HookEventCatalog.ToolPre, root.GetProperty("event").GetString());
        Assert.Equal("Bash", root.GetProperty("toolName").GetString());
        // 탭 문자가 들어가도 유효한 JSON 이어야 한다(OBS-01/API-01 회귀).
        Assert.Equal("ls\t-a", root.GetProperty("command").GetString());
    }

    [Fact]
    public async Task TimeoutKillsProcessAndReportsTimeout()
    {
        if (OperatingSystem.IsWindows())
        {
            return;
        }

        var run = await RunAsync("sleep 5", timeoutMs: 400);
        Assert.Equal(HookRunStatus.TimedOut, run.Status);
        Assert.Equal(HookOutcome.None, run.Outcome);
        Assert.Contains("400", run.Reason);
    }

    [Fact]
    public async Task CallerCancellationIsReportedAsCanceledNotTimeout()
    {
        if (OperatingSystem.IsWindows())
        {
            return;
        }

        using var source = new CancellationTokenSource();
        source.CancelAfter(200);
        var run = await new HookCommandRunner()
            .RunAsync(Definition("sleep 5", 30_000), Sample(), _dir, source.Token);
        Assert.Equal(HookRunStatus.Canceled, run.Status);
    }

    [Fact]
    public async Task EmptyCommandFailsWithoutSpawningShell()
    {
        var run = await new HookCommandRunner()
            .RunAsync(Definition("   ", HookDefinition.DefaultTimeoutMs), Sample(), _dir, CancellationToken.None);
        Assert.Equal(HookRunStatus.Failed, run.Status);
        Assert.Contains("명령이 비어 있다", run.Reason);
    }

    [Fact]
    public async Task WorkingDirectoryIsTheGivenPath()
    {
        if (OperatingSystem.IsWindows())
        {
            return;
        }

        var marker = Path.Combine(_dir, "cwd.txt");
        var run = await RunAsync($"pwd > '{marker}'");
        Assert.Equal(HookRunStatus.Completed, run.Status);
        var recorded = (await File.ReadAllTextAsync(marker)).Trim();
        // macOS 의 /var→/private/var 심볼릭 링크 때문에 문자열 전체 비교는 하지 않는다.
        Assert.EndsWith(Path.GetFileName(_dir), recorded, StringComparison.Ordinal);
    }

    [Fact]
    public void TimeoutIsClampedToSupportedRange()
    {
        Assert.Equal(HookDefinition.DefaultTimeoutMs, HookCommandRunner.ClampTimeout(0));
        Assert.Equal(HookDefinition.DefaultTimeoutMs, HookCommandRunner.ClampTimeout(-5));
        Assert.Equal(HookDefinition.MaxTimeoutMs, HookCommandRunner.ClampTimeout(999_999));
        Assert.Equal(1500, HookCommandRunner.ClampTimeout(1500));
    }

    private Task<HookRunResult> RunAsync(
        string command,
        Func<HookEventInput, HookEventInput>? shape = null,
        int timeoutMs = 10_000
    )
    {
        var input = Sample();
        if (shape != null)
        {
            input = shape(input);
        }

        return new HookCommandRunner()
            .RunAsync(Definition(command, timeoutMs), input, _dir, CancellationToken.None);
    }

    private static HookEventInput Sample()
    {
        return HookEventInput.ForEvent(HookEventCatalog.ToolPre) with { SessionId = "s1" };
    }

    private static HookDefinition Definition(string command, int timeoutMs)
    {
        return new HookDefinition(
            "runner-test",
            HookEventCatalog.ToolPre,
            HookHandlerKind.Command,
            command,
            string.Empty,
            string.Empty,
            HookMatcher.Any,
            timeoutMs,
            HookFailureMode.Open,
            true,
            string.Empty,
            string.Empty
        );
    }
}
