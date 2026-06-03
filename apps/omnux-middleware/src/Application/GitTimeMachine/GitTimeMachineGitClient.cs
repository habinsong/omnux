using System.Diagnostics;

namespace Omnux.Middleware;

internal sealed class GitTimeMachineGitClient
{
    private const int GitTimeoutSeconds = 5;

    private readonly string _repositoryRoot;

    public GitTimeMachineGitClient(string repositoryRoot)
    {
        _repositoryRoot = repositoryRoot;
    }

    public async Task<string> ReadLineAsync(
        IReadOnlyList<string> arguments,
        CancellationToken cancellationToken
    )
    {
        var result = await RunAsync(arguments, cancellationToken).ConfigureAwait(false);
        return result.ExitCode == 0 ? result.StdOut.Trim() : string.Empty;
    }

    public async Task<GitTimeMachineGitResult> RunAsync(
        IReadOnlyList<string> arguments,
        CancellationToken cancellationToken
    )
    {
        var startInfo = new ProcessStartInfo
        {
            FileName = "git",
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            WorkingDirectory = _repositoryRoot
        };

        startInfo.ArgumentList.Add("-C");
        startInfo.ArgumentList.Add(_repositoryRoot);
        foreach (var argument in arguments)
        {
            startInfo.ArgumentList.Add(argument);
        }

        using var process = new Process { StartInfo = startInfo };
        try
        {
            process.Start();
        }
        catch (Exception ex)
        {
            return new GitTimeMachineGitResult(127, string.Empty, ex.Message);
        }

        using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeoutCts.CancelAfter(TimeSpan.FromSeconds(GitTimeoutSeconds));
        var stdoutTask = process.StandardOutput.ReadToEndAsync(timeoutCts.Token);
        var stderrTask = process.StandardError.ReadToEndAsync(timeoutCts.Token);

        try
        {
            await process.WaitForExitAsync(timeoutCts.Token).ConfigureAwait(false);
            return new GitTimeMachineGitResult(
                process.ExitCode,
                await stdoutTask.ConfigureAwait(false),
                await stderrTask.ConfigureAwait(false)
            );
        }
        catch (OperationCanceledException)
        {
            TryKill(process);
            if (cancellationToken.IsCancellationRequested)
            {
                throw;
            }

            return new GitTimeMachineGitResult(124, string.Empty, "git command timed out");
        }
    }

    private static void TryKill(Process process)
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
    }
}
