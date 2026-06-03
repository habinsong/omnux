using System.Diagnostics;

namespace Omnux.Middleware;

internal sealed record GitAutomationProcessResult(
    int ExitCode,
    string StdOut,
    string StdErr
);

internal static class GitAutomationProcessRunner
{
    public static Task<GitAutomationProcessResult> RunGitAsync(
        string repositoryRoot,
        IReadOnlyList<string> arguments,
        int timeoutSeconds,
        CancellationToken cancellationToken
    )
    {
        var gitArguments = new List<string>(arguments.Count + 2)
        {
            "-C",
            repositoryRoot
        };
        gitArguments.AddRange(arguments);
        return RunAsync(repositoryRoot, "git", gitArguments, timeoutSeconds, cancellationToken);
    }

    public static async Task<GitAutomationProcessResult> RunAsync(
        string workingDirectory,
        string fileName,
        IReadOnlyList<string> arguments,
        int timeoutSeconds,
        CancellationToken cancellationToken
    )
    {
        var startInfo = new ProcessStartInfo
        {
            FileName = fileName,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            WorkingDirectory = workingDirectory
        };

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
            return new GitAutomationProcessResult(127, string.Empty, ex.Message);
        }

        var stdoutTask = process.StandardOutput.ReadToEndAsync(cancellationToken);
        var stderrTask = process.StandardError.ReadToEndAsync(cancellationToken);
        try
        {
            await process.WaitForExitAsync(cancellationToken)
                .WaitAsync(TimeSpan.FromSeconds(timeoutSeconds), cancellationToken)
                .ConfigureAwait(false);
        }
        catch (TimeoutException)
        {
            TryKill(process);
            return new GitAutomationProcessResult(124, string.Empty, $"{fileName} command timed out");
        }
        catch (OperationCanceledException)
        {
            TryKill(process);
            throw;
        }

        return new GitAutomationProcessResult(
            process.ExitCode,
            await stdoutTask.ConfigureAwait(false),
            await stderrTask.ConfigureAwait(false)
        );
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
