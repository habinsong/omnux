using System.Diagnostics;

namespace Omnux.Middleware;

internal sealed class AgentWorktreeSnapshotService
{
    private const int GitTimeoutSeconds = 10;
    private static readonly TimeSpan CleanupCandidateAge = TimeSpan.FromHours(24);

    private readonly string _repositoryRoot;
    private readonly string _worktreeRoot;
    private readonly Func<DateTimeOffset> _utcNow;
    private readonly Func<string, string[], AgentWorktreeGitResult> _gitRunner;
    private readonly bool _enabledFromEnvironment;

    public AgentWorktreeSnapshotService(
        string repositoryRoot,
        string worktreeRoot,
        bool? enabledFromEnvironment = null,
        Func<DateTimeOffset>? utcNow = null,
        Func<string, string[], AgentWorktreeGitResult>? gitRunner = null
    )
    {
        _repositoryRoot = Path.GetFullPath(string.IsNullOrWhiteSpace(repositoryRoot) ? "." : repositoryRoot);
        _worktreeRoot = Path.GetFullPath(string.IsNullOrWhiteSpace(worktreeRoot)
            ? Path.Combine(Path.GetTempPath(), "omnux-agent-worktrees")
            : worktreeRoot);
        _enabledFromEnvironment = enabledFromEnvironment ?? GitWorktreeIsolationManager.IsEnabledFromEnvironment();
        _utcNow = utcNow ?? (() => DateTimeOffset.UtcNow);
        _gitRunner = gitRunner ?? RunGit;
    }

    public AgentWorktreeSnapshot GetSnapshot()
    {
        var now = _utcNow();
        var warnings = new List<string>();
        var checks = new List<AgentWorktreeCheck>
        {
            new(
                "worktree_mode",
                _enabledFromEnvironment ? "ok" : "disabled",
                _enabledFromEnvironment
                    ? "OMNUX_AGENT_SPAWN_WORKTREE_MODE enables worktree isolation"
                    : "OMNUX_AGENT_SPAWN_WORKTREE_MODE is not enabled"
            ),
            new(
                "destructive_operations",
                "skipped",
                "snapshot does not remove, merge, cherry-pick, or prune worktrees"
            )
        };

        if (!Directory.Exists(_worktreeRoot))
        {
            checks.Add(new AgentWorktreeCheck(
                "worktree_root",
                "missing",
                "agent worktree root directory does not exist"
            ));
            return BuildSnapshot(
                _enabledFromEnvironment ? "empty" : "disabled",
                Array.Empty<AgentWorktreeItem>(),
                checks,
                warnings,
                now
            );
        }

        checks.Add(new AgentWorktreeCheck(
            "worktree_root",
            "ok",
            "agent worktree root directory exists"
        ));

        var items = EnumerateWorktreeDirectories()
            .Select(path => InspectWorktree(path, now, warnings))
            .OrderByDescending(item => item.HasConflicts)
            .ThenByDescending(item => item.HasChanges)
            .ThenBy(item => item.Name, StringComparer.Ordinal)
            .ToArray();

        var status = ResolveSnapshotStatus(items);
        return BuildSnapshot(status, items, checks, warnings, now);
    }

    private AgentWorktreeSnapshot BuildSnapshot(
        string status,
        IReadOnlyList<AgentWorktreeItem> items,
        IReadOnlyList<AgentWorktreeCheck> checks,
        IReadOnlyList<string> warnings,
        DateTimeOffset now
    )
    {
        return new AgentWorktreeSnapshot(
            status,
            _repositoryRoot,
            _worktreeRoot,
            _enabledFromEnvironment,
            ReadOnly: true,
            items.Count,
            items.Count(item => item.CleanupCandidate),
            items,
            checks,
            new[]
            {
                "git_worktree_remove",
                "git_worktree_prune",
                "git_merge",
                "git_cherry_pick",
                "filesystem_delete"
            },
            warnings.Distinct(StringComparer.Ordinal).ToArray(),
            now
        );
    }

    private IEnumerable<string> EnumerateWorktreeDirectories()
    {
        try
        {
            return Directory.EnumerateDirectories(_worktreeRoot)
                .Select(Path.GetFullPath)
                .ToArray();
        }
        catch
        {
            return Array.Empty<string>();
        }
    }

    private AgentWorktreeItem InspectWorktree(
        string path,
        DateTimeOffset now,
        ICollection<string> warnings
    )
    {
        var name = Path.GetFileName(path);
        var info = new DirectoryInfo(path);
        if (!info.Exists)
        {
            return BuildMissingItem(name, path);
        }

        var ageSeconds = ResolveAgeSeconds(info.CreationTimeUtc, now);
        var lastWriteAgeSeconds = ResolveAgeSeconds(info.LastWriteTimeUtc, now);
        var gitCheck = _gitRunner(path, new[] { "rev-parse", "--is-inside-work-tree" });
        if (gitCheck.ExitCode != 0 || !gitCheck.StdOut.Trim().Equals("true", StringComparison.OrdinalIgnoreCase))
        {
            warnings.Add($"not_git_worktree:{name}");
            return new AgentWorktreeItem(
                name,
                path,
                "invalid",
                PathExists: true,
                IsGitWorktree: false,
                HasChanges: false,
                HasConflicts: false,
                Branch: string.Empty,
                HeadShortHash: string.Empty,
                WorktreeStatus: string.Empty,
                ageSeconds,
                lastWriteAgeSeconds,
                CleanupCandidate: false,
                CleanupReason: "not_git_worktree",
                new AgentWorktreeReadiness("blocked", new[] { "not_git_worktree" })
            );
        }

        var statusOutput = _gitRunner(path, new[] { "status", "--porcelain=v1", "-uall" });
        var worktreeStatus = statusOutput.ExitCode == 0 ? NormalizeStatus(statusOutput.StdOut) : string.Empty;
        if (statusOutput.ExitCode != 0)
        {
            warnings.Add($"git_status_failed:{name}:{TrimForMessage(statusOutput.StdErr)}");
        }

        var hasConflicts = HasConflicts(worktreeStatus);
        var hasChanges = !string.IsNullOrWhiteSpace(worktreeStatus);
        var branch = ReadGitSingleLine(path, "branch", "--show-current");
        var head = ReadGitSingleLine(path, "rev-parse", "--short", "HEAD");
        var cleanupCandidate = !hasChanges
            && !hasConflicts
            && TimeSpan.FromSeconds(lastWriteAgeSeconds) >= CleanupCandidateAge;

        var blockers = BuildMergeBlockers(hasChanges, hasConflicts);
        return new AgentWorktreeItem(
            name,
            path,
            ResolveItemStatus(hasChanges, hasConflicts),
            PathExists: true,
            IsGitWorktree: true,
            hasChanges,
            hasConflicts,
            branch,
            head,
            worktreeStatus,
            ageSeconds,
            lastWriteAgeSeconds,
            cleanupCandidate,
            cleanupCandidate ? "clean_and_older_than_24h" : string.Empty,
            new AgentWorktreeReadiness(
                blockers.Count == 0 ? "ready_for_manual_review" : "blocked",
                blockers
            )
        );
    }

    private string ReadGitSingleLine(string path, params string[] args)
    {
        var result = _gitRunner(path, args);
        return result.ExitCode == 0
            ? result.StdOut.Trim().Split('\n', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries).FirstOrDefault() ?? string.Empty
            : string.Empty;
    }

    private static AgentWorktreeItem BuildMissingItem(string name, string path)
    {
        return new AgentWorktreeItem(
            name,
            path,
            "missing",
            PathExists: false,
            IsGitWorktree: false,
            HasChanges: false,
            HasConflicts: false,
            Branch: string.Empty,
            HeadShortHash: string.Empty,
            WorktreeStatus: string.Empty,
            AgeSeconds: 0,
            LastWriteAgeSeconds: 0,
            CleanupCandidate: false,
            CleanupReason: "missing_path",
            new AgentWorktreeReadiness("blocked", new[] { "missing_path" })
        );
    }

    private static string ResolveSnapshotStatus(IReadOnlyList<AgentWorktreeItem> items)
    {
        if (items.Count == 0)
        {
            return "empty";
        }

        if (items.Any(item => item.HasConflicts || !item.IsGitWorktree))
        {
            return "review_required";
        }

        return items.Any(item => item.HasChanges) ? "dirty_worktrees" : "ok";
    }

    private static string ResolveItemStatus(bool hasChanges, bool hasConflicts)
    {
        if (hasConflicts)
        {
            return "conflicted";
        }

        return hasChanges ? "dirty" : "clean";
    }

    private static IReadOnlyList<string> BuildMergeBlockers(bool hasChanges, bool hasConflicts)
    {
        var blockers = new List<string>();
        if (hasConflicts)
        {
            blockers.Add("conflicts_present");
        }

        if (hasChanges)
        {
            blockers.Add("uncommitted_changes_present");
        }

        return blockers;
    }

    private static bool HasConflicts(string status)
    {
        return status
            .Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Any(line => line.Length >= 2 && (line[0] == 'U' || line[1] == 'U' || line.StartsWith("AA", StringComparison.Ordinal) || line.StartsWith("DD", StringComparison.Ordinal)));
    }

    private static string NormalizeStatus(string value)
    {
        var normalized = (value ?? string.Empty)
            .Replace("\r\n", "\n", StringComparison.Ordinal)
            .Replace('\r', '\n')
            .Trim();
        return normalized.Length <= 2000 ? normalized : normalized[..2000] + "...";
    }

    private static long ResolveAgeSeconds(DateTime utc, DateTimeOffset now)
    {
        if (utc == default)
        {
            return 0L;
        }

        var age = now - new DateTimeOffset(DateTime.SpecifyKind(utc, DateTimeKind.Utc));
        return Math.Max(0L, (long)age.TotalSeconds);
    }

    private static AgentWorktreeGitResult RunGit(string workingDirectory, string[] arguments)
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
            return new AgentWorktreeGitResult(127, string.Empty, ex.Message);
        }

        var stdoutTask = process.StandardOutput.ReadToEndAsync();
        var stderrTask = process.StandardError.ReadToEndAsync();
        if (!process.WaitForExit(TimeSpan.FromSeconds(GitTimeoutSeconds)))
        {
            TryKill(process);
            return new AgentWorktreeGitResult(124, string.Empty, "git command timed out");
        }

        return new AgentWorktreeGitResult(
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

    private static string TrimForMessage(string value)
    {
        var normalized = (value ?? string.Empty).Trim();
        return normalized.Length <= 240 ? normalized : normalized[..240] + "...";
    }
}
