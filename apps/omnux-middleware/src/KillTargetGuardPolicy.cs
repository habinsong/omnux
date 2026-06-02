using System.Diagnostics;

namespace Omnux.Middleware;

internal static class KillTargetGuardPolicy
{
    public static async Task<(bool Allowed, string Reason)> ValidateAsync(
        int pid,
        string source,
        string? killAllowlistCsv,
        CancellationToken cancellationToken
    )
    {
        var (selfUidOk, selfUid) = await ReadCurrentUidAsync(cancellationToken);
        if (!selfUidOk)
        {
            return (false, "현재 사용자 UID 확인 실패");
        }

        var (targetUidOk, targetUid) = await ReadProcessUidAsync(pid, cancellationToken);
        if (!targetUidOk)
        {
            return (false, "대상 프로세스 UID 확인 실패");
        }

        if (!string.Equals(selfUid, targetUid, StringComparison.Ordinal))
        {
            return (false, $"다른 사용자 프로세스(uid={targetUid})는 종료할 수 없습니다.");
        }

        var killAllowlist = ParseKillAllowlist(killAllowlistCsv);
        if (killAllowlist.Length > 0)
        {
            var processName = await ReadProcessCommandAsync(pid, cancellationToken);
            if (string.IsNullOrWhiteSpace(processName))
            {
                return (false, "대상 프로세스 이름 확인 실패");
            }

            var matched = killAllowlist.Any(item =>
                processName.Contains(item, StringComparison.OrdinalIgnoreCase));
            if (!matched)
            {
                return (false, $"allowlist 미일치 프로세스({processName})");
            }
        }

        if (source.Equals("telegram", StringComparison.OrdinalIgnoreCase))
        {
            return (true, "ok (telegram verified)");
        }

        return (true, "ok");
    }

    private static string[] ParseKillAllowlist(string? killAllowlistCsv)
    {
        return (killAllowlistCsv ?? string.Empty)
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .ToArray();
    }

    private static async Task<(bool Ok, string Uid)> ReadCurrentUidAsync(CancellationToken cancellationToken)
    {
        var result = await RunShellCaptureAsync("id -u", cancellationToken);
        if (result.ExitCode != 0)
        {
            return (false, string.Empty);
        }

        var uid = (result.StdOut ?? string.Empty).Trim();
        return (string.IsNullOrWhiteSpace(uid) ? false : true, uid);
    }

    private static async Task<(bool Ok, string Uid)> ReadProcessUidAsync(int pid, CancellationToken cancellationToken)
    {
        var result = await RunShellCaptureAsync($"ps -o uid= -p {pid}", cancellationToken);
        if (result.ExitCode != 0)
        {
            return (false, string.Empty);
        }

        var uid = (result.StdOut ?? string.Empty).Trim();
        return (string.IsNullOrWhiteSpace(uid) ? false : true, uid);
    }

    private static async Task<string> ReadProcessCommandAsync(int pid, CancellationToken cancellationToken)
    {
        var result = await RunShellCaptureAsync($"ps -o comm= -p {pid}", cancellationToken);
        if (result.ExitCode != 0)
        {
            return string.Empty;
        }

        return (result.StdOut ?? string.Empty).Trim();
    }

    private static async Task<ShellRunResult> RunShellCaptureAsync(string command, CancellationToken cancellationToken)
    {
        var startInfo = new ProcessStartInfo
        {
            FileName = OperatingSystem.IsWindows() ? "cmd.exe" : "/bin/zsh",
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true
        };

        if (OperatingSystem.IsWindows())
        {
            startInfo.ArgumentList.Add("/c");
            startInfo.ArgumentList.Add(command);
        }
        else
        {
            startInfo.ArgumentList.Add("-lc");
            startInfo.ArgumentList.Add(command);
        }

        using var process = new Process { StartInfo = startInfo };
        try
        {
            process.Start();
        }
        catch (Exception ex)
        {
            return new ShellRunResult(127, string.Empty, ex.Message, false);
        }

        using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeoutCts.CancelAfter(TimeSpan.FromSeconds(5));
        var stdoutTask = process.StandardOutput.ReadToEndAsync(timeoutCts.Token);
        var stderrTask = process.StandardError.ReadToEndAsync(timeoutCts.Token);
        try
        {
            await process.WaitForExitAsync(timeoutCts.Token);
            return new ShellRunResult(process.ExitCode, await stdoutTask, await stderrTask, false);
        }
        catch
        {
            try
            {
                if (!process.HasExited)
                {
                    process.Kill(entireProcessTree: true);
                }
            }
            catch
            {
            }

            return new ShellRunResult(124, string.Empty, "timeout", true);
        }
    }
}
