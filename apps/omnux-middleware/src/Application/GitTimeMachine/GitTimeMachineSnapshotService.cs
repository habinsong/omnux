using System.Globalization;

namespace Omnux.Middleware;

internal sealed class GitTimeMachineSnapshotService
{
    private const int DefaultLimit = 30;
    private const int MaxLimit = 100;
    private const string SnapshotNamespace = "snapshots";

    private readonly string _repositoryRoot;
    private readonly GitTimeMachineGitClient _git;
    private readonly Func<DateTimeOffset> _utcNow;

    public GitTimeMachineSnapshotService(
        string repositoryRoot,
        Func<DateTimeOffset>? utcNow = null
    )
    {
        _repositoryRoot = Path.GetFullPath(string.IsNullOrWhiteSpace(repositoryRoot) ? "." : repositoryRoot);
        _git = new GitTimeMachineGitClient(_repositoryRoot);
        _utcNow = utcNow ?? (() => DateTimeOffset.UtcNow);
    }

    public async Task<GitTimeMachineSnapshot> GetSnapshotAsync(
        int? requestedLimit,
        CancellationToken cancellationToken
    )
    {
        var limit = Math.Clamp(requestedLimit ?? DefaultLimit, 1, MaxLimit);
        var warnings = new List<string>();
        var checks = new List<GitTimeMachineCheck>();
        var repoCheck = await _git.RunAsync(new[] { "rev-parse", "--is-inside-work-tree" }, cancellationToken)
            .ConfigureAwait(false);

        if (repoCheck.ExitCode != 0
            || !repoCheck.StdOut.Trim().Equals("true", StringComparison.OrdinalIgnoreCase))
        {
            warnings.Add(TrimWarning(repoCheck.StdErr, "workspace is not a git repository"));
            checks.Add(new GitTimeMachineCheck("repository", "failed", "workspace is not a git repository"));
            AddDeferredOperationChecks(checks);
            return BuildSnapshot(
                limit,
                isRepository: false,
                worktreeStatusAvailable: false,
                branchName: string.Empty,
                headHash: string.Empty,
                hasChanges: false,
                changedFileCount: 0,
                conflictedFileCount: 0,
                diffShortStat: string.Empty,
                checkpointsTruncated: false,
                checkpoints: Array.Empty<GitTimeMachineCheckpoint>(),
                checks,
                warnings
            );
        }

        checks.Add(new GitTimeMachineCheck("repository", "ok", "workspace is inside a git repository"));
        var branchName = await _git.ReadLineAsync(new[] { "rev-parse", "--abbrev-ref", "HEAD" }, cancellationToken)
            .ConfigureAwait(false);
        var headHash = await _git.ReadLineAsync(new[] { "rev-parse", "HEAD" }, cancellationToken)
            .ConfigureAwait(false);
        var status = await _git.RunAsync(new[] { "status", "--porcelain=v1", "-uall" }, cancellationToken)
            .ConfigureAwait(false);
        var statusSummary = status.ExitCode == 0
            ? GitTimeMachineParsers.ParseWorktreeStatus(status.StdOut)
            : new GitTimeMachineWorktreeStatus(0, 0);

        if (status.ExitCode != 0)
        {
            warnings.Add(TrimWarning(status.StdErr, "git status failed"));
            checks.Add(new GitTimeMachineCheck("worktree_status", "failed", "git status failed"));
        }
        else if (statusSummary.ConflictedFileCount > 0)
        {
            checks.Add(new GitTimeMachineCheck("worktree_status", "failed", "merge conflicts are present"));
        }
        else if (statusSummary.ChangedFileCount > 0)
        {
            checks.Add(new GitTimeMachineCheck("worktree_status", "warning", "uncommitted changes are present"));
        }
        else
        {
            checks.Add(new GitTimeMachineCheck("worktree_status", "ok", "worktree is clean"));
        }

        var diffShortStat = string.IsNullOrWhiteSpace(headHash)
            ? string.Empty
            : await _git.ReadLineAsync(new[] { "diff", "--shortstat", "HEAD" }, cancellationToken)
                .ConfigureAwait(false);
        var (checkpoints, checkpointsTruncated) = string.IsNullOrWhiteSpace(headHash)
            ? (Array.Empty<GitTimeMachineCheckpoint>(), false)
            : await ReadCheckpointsAsync(headHash, limit, checks, warnings, cancellationToken)
                .ConfigureAwait(false);

        if (string.IsNullOrWhiteSpace(headHash))
        {
            checks.Add(new GitTimeMachineCheck("commit_history", "warning", "no commits were found"));
        }

        AddDeferredOperationChecks(checks);
        return BuildSnapshot(
            limit,
            isRepository: true,
            worktreeStatusAvailable: status.ExitCode == 0,
            branchName,
            headHash,
            statusSummary.ChangedFileCount > 0,
            statusSummary.ChangedFileCount,
            statusSummary.ConflictedFileCount,
            diffShortStat,
            checkpointsTruncated,
            checkpoints,
            checks,
            warnings
        );
    }

    private async Task<(GitTimeMachineCheckpoint[] Checkpoints, bool Truncated)> ReadCheckpointsAsync(
        string headHash,
        int limit,
        ICollection<GitTimeMachineCheck> checks,
        ICollection<string> warnings,
        CancellationToken cancellationToken
    )
    {
        var logLimit = (limit + 1).ToString(CultureInfo.InvariantCulture);
        var git = await _git.RunAsync(
            new[]
            {
                "log",
                $"--max-count={logLimit}",
                "--date=iso-strict",
                "--format=%x1e%H%x1f%P%x1f%an%x1f%aI%x1f%s"
            },
            cancellationToken
        ).ConfigureAwait(false);

        if (git.ExitCode != 0)
        {
            warnings.Add(TrimWarning(git.StdErr, "git log failed"));
            checks.Add(new GitTimeMachineCheck("commit_history", "failed", "git log failed"));
            return (Array.Empty<GitTimeMachineCheckpoint>(), false);
        }

        var commits = GitTimeMachineParsers.ParseLog(git.StdOut, headHash).ToArray();
        var truncated = commits.Length > limit;
        var visible = commits.Take(limit).ToArray();
        checks.Add(visible.Length == 0
            ? new GitTimeMachineCheck("commit_history", "warning", "no commits were found")
            : new GitTimeMachineCheck("commit_history", "ok", "recent commits were scanned"));
        return (visible, truncated);
    }

    private GitTimeMachineSnapshot BuildSnapshot(
        int limit,
        bool isRepository,
        bool worktreeStatusAvailable,
        string branchName,
        string headHash,
        bool hasChanges,
        int changedFileCount,
        int conflictedFileCount,
        string diffShortStat,
        bool checkpointsTruncated,
        IReadOnlyList<GitTimeMachineCheckpoint> checkpoints,
        IReadOnlyList<GitTimeMachineCheck> checks,
        IReadOnlyList<string> warnings
    )
    {
        var headShortHash = GitTimeMachineParsers.ShortenHash(headHash);
        return new GitTimeMachineSnapshot(
            _repositoryRoot,
            branchName,
            headHash,
            headShortHash,
            isRepository,
            true,
            hasChanges,
            !hasChanges,
            changedFileCount,
            conflictedFileCount,
            diffShortStat,
            limit,
            checkpointsTruncated,
            SnapshotNamespace,
            isRepository ? BuildSuggestedSnapshotBranch(branchName, headShortHash) : string.Empty,
            checkpoints,
            GitTimeMachineReadinessPolicy.Evaluate(
                isRepository,
                worktreeStatusAvailable,
                hasChanges,
                conflictedFileCount,
                checkpoints.Count
            ),
            checks,
            warnings,
            _utcNow()
        );
    }

    private string BuildSuggestedSnapshotBranch(string branchName, string headShortHash)
    {
        var safeBranch = SanitizeBranchPart(string.IsNullOrWhiteSpace(branchName) || branchName == "HEAD"
            ? "detached"
            : branchName);
        var safeHash = string.IsNullOrWhiteSpace(headShortHash) ? "no-head" : headShortHash;
        return $"{SnapshotNamespace}/{safeBranch}/{_utcNow():yyyyMMddHHmmss}-{safeHash}";
    }

    private static void AddDeferredOperationChecks(ICollection<GitTimeMachineCheck> checks)
    {
        checks.Add(new GitTimeMachineCheck("auto_snapshot_commit", "skipped", "background git commit is not enabled"));
        checks.Add(new GitTimeMachineCheck("snapshot_branch_creation", "skipped", "snapshot branch creation is not enabled"));
        checks.Add(new GitTimeMachineCheck("rollback_execution", "skipped", "git reset --hard is not enabled"));
        checks.Add(new GitTimeMachineCheck("worktree_clean", "skipped", "git clean -fd is not enabled"));
        checks.Add(new GitTimeMachineCheck("snapshot_gc", "skipped", "automatic checkpoint branch deletion is not enabled"));
    }

    private static string SanitizeBranchPart(string value)
    {
        var chars = value
            .Select(ch => char.IsLetterOrDigit(ch) || ch == '-' || ch == '_' || ch == '/' ? ch : '-')
            .ToArray();
        var normalized = new string(chars).Trim('/', '-');
        while (normalized.Contains("//", StringComparison.Ordinal))
        {
            normalized = normalized.Replace("//", "/", StringComparison.Ordinal);
        }

        return string.IsNullOrWhiteSpace(normalized) ? "workspace" : normalized;
    }

    private static string TrimWarning(string value, string fallback)
    {
        var normalized = (value ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            normalized = fallback;
        }

        return normalized.Length <= 500 ? normalized : normalized[..500] + "...";
    }

}
