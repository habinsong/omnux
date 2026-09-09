using System.Diagnostics;
using System.Text;

namespace Omnux.Middleware;

/// <summary>
/// 명령 훅 실행기. 이벤트 JSON 을 표준 입력으로 전달하고 종료 코드로 상태를 판정한다.
/// 종료 코드 계약: 0=정상(표준 출력 JSON 해석), 2=차단, 그 외=실패.
/// 시간 초과·취소는 실패와 구분해 기록하고 프로세스를 종료한다.
/// </summary>
internal sealed class HookCommandRunner
{
    public const int BlockingExitCode = 2;
    public const int MaxStderrChars = 8 * 1024;

    private readonly string _shellPath;
    private readonly string _shellSwitch;

    public HookCommandRunner()
        : this(
            OperatingSystem.IsWindows() ? "cmd.exe" : "/bin/sh",
            OperatingSystem.IsWindows() ? "/c" : "-c"
        )
    {
    }

    public HookCommandRunner(string shellPath, string shellSwitch)
    {
        _shellPath = shellPath;
        _shellSwitch = shellSwitch;
    }

    public async Task<HookRunResult> RunAsync(
        HookDefinition definition,
        HookEventInput input,
        string workingDirectory,
        CancellationToken cancellationToken
    )
    {
        var eventId = HookEventCatalog.Normalize(input.Event);
        var command = definition.Command.Trim();
        if (command.Length == 0)
        {
            return Failure(definition.Id, eventId, "명령이 비어 있다", 0);
        }

        var stopwatch = Stopwatch.StartNew();
        var startInfo = new ProcessStartInfo
        {
            FileName = _shellPath,
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };
        startInfo.ArgumentList.Add(_shellSwitch);
        startInfo.ArgumentList.Add(command);
        if (Directory.Exists(workingDirectory))
        {
            startInfo.WorkingDirectory = workingDirectory;
        }

        startInfo.Environment["OMNUX_HOOK_EVENT"] = eventId;
        startInfo.Environment["OMNUX_HOOK_ID"] = definition.Id;

        using var process = new Process { StartInfo = startInfo };
        try
        {
            if (!process.Start())
            {
                return Failure(definition.Id, eventId, "프로세스를 시작하지 못했다", stopwatch.ElapsedMilliseconds);
            }
        }
        catch (Exception exception)
        {
            return Failure(definition.Id, eventId, exception.Message, stopwatch.ElapsedMilliseconds);
        }

        var stdoutTask = process.StandardOutput.ReadToEndAsync();
        var stderrTask = process.StandardError.ReadToEndAsync();

        try
        {
            await process.StandardInput.WriteAsync(HookEventJson.Serialize(input)).ConfigureAwait(false);
        }
        catch (IOException)
        {
            // 훅이 표준 입력을 읽지 않고 즉시 끝나는 경우다. 종료 코드로 판정한다.
        }
        finally
        {
            try
            {
                process.StandardInput.Close();
            }
            catch (IOException)
            {
            }
        }

        var timeoutMs = ClampTimeout(definition.TimeoutMs);
        using var timeoutSource = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeoutSource.CancelAfter(timeoutMs);

        try
        {
            await process.WaitForExitAsync(timeoutSource.Token).ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
            KillQuietly(process);
            var canceledByCaller = cancellationToken.IsCancellationRequested;
            var stderrOnStop = await ReadQuietlyAsync(stderrTask).ConfigureAwait(false);
            return new HookRunResult(
                definition.Id,
                eventId,
                canceledByCaller ? HookRunStatus.Canceled : HookRunStatus.TimedOut,
                HookOutcome.None,
                canceledByCaller ? "호출자가 취소했다" : $"시간 초과 {timeoutMs}ms",
                string.Empty,
                string.Empty,
                ExitCode: -1,
                DurationMs: stopwatch.ElapsedMilliseconds,
                Stderr: Clamp(stderrOnStop)
            );
        }

        var stdout = await ReadQuietlyAsync(stdoutTask).ConfigureAwait(false);
        var stderr = Clamp(await ReadQuietlyAsync(stderrTask).ConfigureAwait(false));
        var exitCode = process.ExitCode;
        stopwatch.Stop();

        if (exitCode == BlockingExitCode)
        {
            return new HookRunResult(
                definition.Id,
                eventId,
                HookRunStatus.Blocked,
                HookOutcome.Deny,
                stderr.Length > 0 ? stderr : "훅이 종료 코드 2로 차단했다",
                string.Empty,
                string.Empty,
                exitCode,
                stopwatch.ElapsedMilliseconds,
                stderr
            );
        }

        if (exitCode != 0)
        {
            return new HookRunResult(
                definition.Id,
                eventId,
                HookRunStatus.Failed,
                HookOutcome.None,
                stderr.Length > 0 ? stderr : $"훅이 종료 코드 {exitCode}로 끝났다",
                string.Empty,
                string.Empty,
                exitCode,
                stopwatch.ElapsedMilliseconds,
                stderr
            );
        }

        var parsed = HookOutputParser.Parse(stdout);
        var reason = parsed.Reason;
        if (parsed.ParseError.Length > 0)
        {
            reason = reason.Length > 0
                ? $"{reason} (출력 해석 실패: {parsed.ParseError})"
                : $"출력 해석 실패: {parsed.ParseError}";
        }

        return new HookRunResult(
            definition.Id,
            eventId,
            HookRunStatus.Completed,
            parsed.Outcome,
            reason,
            parsed.UpdatedInputJson,
            parsed.AdditionalContext,
            exitCode,
            stopwatch.ElapsedMilliseconds,
            stderr
        );
    }

    public static int ClampTimeout(int timeoutMs)
    {
        if (timeoutMs < HookDefinition.MinTimeoutMs)
        {
            return HookDefinition.DefaultTimeoutMs;
        }

        return timeoutMs > HookDefinition.MaxTimeoutMs ? HookDefinition.MaxTimeoutMs : timeoutMs;
    }

    private static async Task<string> ReadQuietlyAsync(Task<string> task)
    {
        try
        {
            return await task.ConfigureAwait(false);
        }
        catch (Exception)
        {
            return string.Empty;
        }
    }

    private static void KillQuietly(Process process)
    {
        try
        {
            if (!process.HasExited)
            {
                process.Kill(entireProcessTree: true);
            }
        }
        catch (Exception)
        {
            // 이미 종료했거나 권한이 없는 경우다. 상태는 호출부에서 시간 초과/취소로 남는다.
        }
    }

    private static string Clamp(string? text)
    {
        var value = (text ?? string.Empty).Trim();
        if (value.Length <= MaxStderrChars)
        {
            return value;
        }

        return new StringBuilder(value[..MaxStderrChars]).Append("…(이하 생략)").ToString();
    }

    private static HookRunResult Failure(string hookId, string eventId, string reason, long durationMs)
    {
        return new HookRunResult(
            hookId,
            eventId,
            HookRunStatus.Failed,
            HookOutcome.None,
            reason,
            string.Empty,
            string.Empty,
            ExitCode: -1,
            DurationMs: durationMs,
            Stderr: string.Empty
        );
    }
}
