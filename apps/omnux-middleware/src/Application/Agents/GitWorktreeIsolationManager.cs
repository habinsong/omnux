using System.Diagnostics;

namespace Omnux.Middleware;

internal sealed class GitWorktreeIsolationManager
{
    private const int GitTimeoutSeconds = 20;

    private readonly string _repositoryRoot;
    private readonly string _worktreeRoot;
    private readonly bool _enabled;

    public GitWorktreeIsolationManager(string repositoryRoot, string worktreeRoot, bool enabled)
    {
        _repositoryRoot = Path.GetFullPath(string.IsNullOrWhiteSpace(repositoryRoot) ? "." : repositoryRoot);
        _worktreeRoot = Path.GetFullPath(string.IsNullOrWhiteSpace(worktreeRoot)
            ? Path.Combine(Path.GetTempPath(), "omnux-agent-worktrees")
            : worktreeRoot);
        _enabled = enabled;
    }

    public static GitWorktreeIsolationManager FromEnvironment(string repositoryRoot, string worktreeRoot)
    {
        return new GitWorktreeIsolationManager(repositoryRoot, worktreeRoot, IsEnabledFromEnvironment());
    }

    public GitWorktreeIsolationLease Prepare(string runId)
    {
        if (!_enabled)
        {
            return GitWorktreeIsolationLease.Disabled();
        }

        var normalizedRunId = NormalizeToken(runId, "run");
        var targetPath = Path.Combine(_worktreeRoot, normalizedRunId);
        Directory.CreateDirectory(_worktreeRoot);

        if (Directory.Exists(targetPath))
        {
            return IsGitWorktree(targetPath)
                ? GitWorktreeIsolationLease.Reused(targetPath)
                : GitWorktreeIsolationLease.Error(
                    targetPath,
                    "target_exists",
                    "worktree target already exists but is not a git worktree"
                );
        }

        var repoCheck = RunGit(_repositoryRoot, "rev-parse", "--is-inside-work-tree");
        if (repoCheck.ExitCode != 0 || !repoCheck.StdOut.Trim().Equals("true", StringComparison.OrdinalIgnoreCase))
        {
            return GitWorktreeIsolationLease.Error(
                targetPath,
                "not_git_repository",
                TrimForMessage(repoCheck.StdErr, "workspace is not a git repository")
            );
        }

        var add = RunGit(_repositoryRoot, "worktree", "add", "--detach", targetPath, "HEAD");
        if (add.ExitCode != 0)
        {
            return GitWorktreeIsolationLease.Error(
                targetPath,
                "git_worktree_add_failed",
                TrimForMessage(add.StdErr, "git worktree add failed")
            );
        }

        return GitWorktreeIsolationLease.Created(targetPath);
    }

    internal static bool IsEnabledFromEnvironment()
    {
        var raw = (Env.Get("OMNUX_AGENT_SPAWN_WORKTREE_MODE") ?? string.Empty).Trim().ToLowerInvariant();
        return raw is "auto" or "on" or "enabled" or "true" or "1";
    }

    private static bool IsGitWorktree(string path)
    {
        if (!Directory.Exists(path))
        {
            return false;
        }

        var result = RunGit(path, "rev-parse", "--is-inside-work-tree");
        return result.ExitCode == 0 && result.StdOut.Trim().Equals("true", StringComparison.OrdinalIgnoreCase);
    }

    private static GitCommandResult RunGit(string workingDirectory, params string[] arguments)
    {
        var startInfo = new ProcessStartInfo
        {
            FileName = "git",
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            WorkingDirectory = workingDirectory
        };

        startInfo.ArgumentList.Add("-C");
        startInfo.ArgumentList.Add(workingDirectory);
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
            return new GitCommandResult(127, string.Empty, ex.Message);
        }

        var stdoutTask = process.StandardOutput.ReadToEndAsync();
        var stderrTask = process.StandardError.ReadToEndAsync();
        if (!process.WaitForExit(TimeSpan.FromSeconds(GitTimeoutSeconds)))
        {
            TryKill(process);
            return new GitCommandResult(124, string.Empty, "git command timed out");
        }

        return new GitCommandResult(
            process.ExitCode,
            stdoutTask.GetAwaiter().GetResult(),
            stderrTask.GetAwaiter().GetResult()
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

    private static string NormalizeToken(string value, string fallback)
    {
        var normalized = new string((value ?? string.Empty)
            .Where(char.IsLetterOrDigit)
            .Take(32)
            .ToArray());
        return string.IsNullOrWhiteSpace(normalized)
            ? $"{fallback}{Guid.NewGuid():N}"[..32]
            : normalized;
    }

    private static string TrimForMessage(string value, string fallback)
    {
        var normalized = (value ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            normalized = fallback;
        }

        return normalized.Length <= 500 ? normalized : normalized[..500] + "...";
    }

    private sealed record GitCommandResult(int ExitCode, string StdOut, string StdErr);
}

internal sealed record GitWorktreeIsolationLease(
    bool Enabled,
    bool Ready,
    bool CreatedWorktree,
    string Status,
    string WorktreePath,
    string Message
)
{
    public static GitWorktreeIsolationLease Disabled()
    {
        return new GitWorktreeIsolationLease(false, false, false, "disabled", string.Empty, "worktree isolation disabled");
    }

    public static GitWorktreeIsolationLease Created(string path)
    {
        return new GitWorktreeIsolationLease(true, true, true, "created", path, "git worktree created for agent run");
    }

    public static GitWorktreeIsolationLease Reused(string path)
    {
        return new GitWorktreeIsolationLease(true, true, false, "reused", path, "existing git worktree reused for agent run");
    }

    public static GitWorktreeIsolationLease Error(string path, string status, string message)
    {
        return new GitWorktreeIsolationLease(true, false, false, status, path, message);
    }
}
