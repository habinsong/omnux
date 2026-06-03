using System.Globalization;

namespace Omnux.Middleware;

internal sealed class GitAutomationSnapshotService
{
    private const int DefaultLimit = 100;
    private const int MaxLimit = 300;
    private const int GitTimeoutSeconds = 5;

    private readonly string _repositoryRoot;
    private readonly GitAutomationRemoteSnapshotProbe _remoteProbe;
    private readonly GitAutomationToolchainProbe _toolchainProbe;

    public GitAutomationSnapshotService(string repositoryRoot)
    {
        _repositoryRoot = Path.GetFullPath(string.IsNullOrWhiteSpace(repositoryRoot) ? "." : repositoryRoot);
        _remoteProbe = new GitAutomationRemoteSnapshotProbe(_repositoryRoot);
        _toolchainProbe = new GitAutomationToolchainProbe(_repositoryRoot);
    }

    public async Task<GitAutomationSnapshot> GetSnapshotAsync(
        int? requestedLimit,
        CancellationToken cancellationToken
    )
    {
        var limit = Math.Clamp(requestedLimit ?? DefaultLimit, 1, MaxLimit);
        var warnings = new List<string>();
        var repoCheck = await RunGitAsync(new[] { "rev-parse", "--is-inside-work-tree" }, cancellationToken)
            .ConfigureAwait(false);
        if (repoCheck.ExitCode != 0 || !repoCheck.StdOut.Trim().Equals("true", StringComparison.OrdinalIgnoreCase))
        {
            var toolchain = await _toolchainProbe.GetSnapshotAsync(cancellationToken).ConfigureAwait(false);
            warnings.Add(GitAutomationSnapshotText.TrimWarning(repoCheck.StdErr, "workspace is not a git repository"));
            return BuildSnapshot(
                limit,
                string.Empty,
                string.Empty,
                Array.Empty<GitAutomationChangedFile>(),
                null,
                string.Empty,
                GitAutomationRemoteSnapshotProbe.Empty(),
                toolchain,
                warnings
            );
        }

        var branch = await ReadGitLineAsync(new[] { "rev-parse", "--abbrev-ref", "HEAD" }, cancellationToken)
            .ConfigureAwait(false);
        var head = await ReadGitLineAsync(new[] { "rev-parse", "--short", "HEAD" }, cancellationToken)
            .ConfigureAwait(false);
        var remote = await _remoteProbe.GetSnapshotAsync(branch, cancellationToken).ConfigureAwait(false);
        var toolchainSnapshot = await _toolchainProbe.GetSnapshotAsync(cancellationToken).ConfigureAwait(false);
        var status = await RunGitAsync(new[] { "status", "--porcelain=v1", "-uall" }, cancellationToken)
            .ConfigureAwait(false);
        if (status.ExitCode != 0)
        {
            warnings.Add(GitAutomationSnapshotText.TrimWarning(status.StdErr, "git status failed"));
            return BuildSnapshot(
                limit,
                branch,
                head,
                Array.Empty<GitAutomationChangedFile>(),
                null,
                string.Empty,
                remote,
                toolchainSnapshot,
                warnings
            );
        }

        var trackedStats = await BuildNumstatMapAsync(new[] { "diff", "--numstat", "HEAD" }, cancellationToken)
            .ConfigureAwait(false);
        var diffShortStat = await ReadGitLineAsync(new[] { "diff", "--shortstat", "HEAD" }, cancellationToken)
            .ConfigureAwait(false);
        var allFiles = ParseStatus(status.StdOut, trackedStats)
            .ToArray();
        var visibleFiles = allFiles.Take(limit).ToArray();

        return BuildSnapshot(limit, branch, head, allFiles, visibleFiles, diffShortStat, remote, toolchainSnapshot, warnings);
    }

    private GitAutomationSnapshot BuildSnapshot(
        int limit,
        string branchName,
        string headShortHash,
        IReadOnlyList<GitAutomationChangedFile> allFiles,
        IReadOnlyList<GitAutomationChangedFile>? visibleFiles,
        string diffShortStat,
        GitAutomationRemoteSnapshot remote,
        GitAutomationToolchainSnapshot toolchain,
        IReadOnlyList<string> warnings
    )
    {
        var staged = allFiles.Count(file => file.Staged);
        var unstaged = allFiles.Count(file => file.Unstaged);
        var untracked = allFiles.Count(file => file.Untracked);
        var conflicted = allFiles.Count(file => file.Category == "conflicted");
        var hasChanges = allFiles.Count > 0;
        var readiness = BuildReadiness(hasChanges, conflicted);
        var publishReadiness = GitAutomationPublishReadinessPolicy.Build(
            hasChanges,
            conflicted,
            branchName,
            remote,
            toolchain
        );
        var suggestedMessage = hasChanges && conflicted == 0
            ? GitAutomationSuggestionPolicy.BuildSuggestedCommitMessage(allFiles)
            : string.Empty;
        var suggestedBranch = hasChanges && conflicted == 0
            ? GitAutomationSuggestionPolicy.BuildSuggestedBranchName(allFiles)
            : string.Empty;
        var files = visibleFiles ?? allFiles;

        return new GitAutomationSnapshot(
            _repositoryRoot,
            branchName,
            headShortHash,
            true,
            hasChanges,
            !hasChanges,
            allFiles.Count,
            staged,
            unstaged,
            untracked,
            conflicted,
            limit,
            allFiles.Count > files.Count,
            files,
            diffShortStat,
            suggestedMessage,
            suggestedBranch,
            remote,
            toolchain,
            publishReadiness,
            readiness,
            warnings,
            DateTimeOffset.UtcNow
        );
    }

    private static GitAutomationReadiness BuildReadiness(bool hasChanges, int conflictedFileCount)
    {
        if (!hasChanges)
        {
            return new GitAutomationReadiness(
                "clean",
                false,
                false,
                true,
                new[] { "no_changes" }
            );
        }

        if (conflictedFileCount > 0)
        {
            return new GitAutomationReadiness(
                "blocked",
                false,
                false,
                true,
                new[] { "merge_conflicts_present" }
            );
        }

        return new GitAutomationReadiness(
            "ready_for_review",
            true,
            true,
            true,
            Array.Empty<string>()
        );
    }

    private static IReadOnlyList<GitAutomationChangedFile> ParseStatus(
        string stdout,
        IReadOnlyDictionary<string, (int? Added, int? Deleted)> trackedStats
    )
    {
        var files = new List<GitAutomationChangedFile>();
        foreach (var rawLine in (stdout ?? string.Empty)
                     .Replace("\r\n", "\n", StringComparison.Ordinal)
                     .Replace('\r', '\n')
                     .Split('\n', StringSplitOptions.RemoveEmptyEntries))
        {
            if (rawLine.Length < 3)
            {
                continue;
            }

            var indexStatus = rawLine[0].ToString();
            var worktreeStatus = rawLine[1].ToString();
            var path = NormalizeStatusPath(rawLine[3..]);
            var category = ClassifyStatus(rawLine[0], rawLine[1]);
            var untracked = rawLine.StartsWith("?? ", StringComparison.Ordinal);
            var staged = !untracked && rawLine[0] != ' ';
            var unstaged = !untracked && rawLine[1] != ' ';
            trackedStats.TryGetValue(path, out var stats);

            files.Add(new GitAutomationChangedFile(
                path,
                indexStatus,
                worktreeStatus,
                category,
                staged,
                unstaged,
                untracked,
                stats.Added,
                stats.Deleted
            ));
        }

        return files;
    }

    private static string NormalizeStatusPath(string rawPath)
    {
        var path = (rawPath ?? string.Empty).Trim();
        var renameArrow = path.LastIndexOf(" -> ", StringComparison.Ordinal);
        if (renameArrow >= 0)
        {
            path = path[(renameArrow + 4)..].Trim();
        }

        return path.Trim('"');
    }

    private static string ClassifyStatus(char indexStatus, char worktreeStatus)
    {
        if ((indexStatus == '?' && worktreeStatus == '?'))
        {
            return "untracked";
        }

        if (indexStatus == 'U'
            || worktreeStatus == 'U'
            || (indexStatus == 'A' && worktreeStatus == 'A')
            || (indexStatus == 'D' && worktreeStatus == 'D'))
        {
            return "conflicted";
        }

        if (indexStatus == 'R' || worktreeStatus == 'R')
        {
            return "renamed";
        }

        if (indexStatus == 'C' || worktreeStatus == 'C')
        {
            return "copied";
        }

        if (indexStatus == 'A' || worktreeStatus == 'A')
        {
            return "added";
        }

        if (indexStatus == 'D' || worktreeStatus == 'D')
        {
            return "deleted";
        }

        if (indexStatus == 'M' || worktreeStatus == 'M')
        {
            return "modified";
        }

        return "changed";
    }

    private async Task<IReadOnlyDictionary<string, (int? Added, int? Deleted)>> BuildNumstatMapAsync(
        IReadOnlyList<string> arguments,
        CancellationToken cancellationToken
    )
    {
        var result = await RunGitAsync(arguments, cancellationToken).ConfigureAwait(false);
        if (result.ExitCode != 0)
        {
            return new Dictionary<string, (int? Added, int? Deleted)>(StringComparer.Ordinal);
        }

        var map = new Dictionary<string, (int? Added, int? Deleted)>(StringComparer.Ordinal);
        foreach (var line in (result.StdOut ?? string.Empty).Split('\n', StringSplitOptions.RemoveEmptyEntries))
        {
            var parts = line.Split('\t');
            if (parts.Length < 3)
            {
                continue;
            }

            var path = NormalizeStatusPath(parts[^1]);
            map[path] = (
                int.TryParse(parts[0], NumberStyles.Integer, CultureInfo.InvariantCulture, out var added) ? added : null,
                int.TryParse(parts[1], NumberStyles.Integer, CultureInfo.InvariantCulture, out var deleted) ? deleted : null
            );
        }

        return map;
    }

    private async Task<string> ReadGitLineAsync(
        IReadOnlyList<string> arguments,
        CancellationToken cancellationToken
    )
    {
        var result = await RunGitAsync(arguments, cancellationToken).ConfigureAwait(false);
        return result.ExitCode == 0 ? result.StdOut.Trim() : string.Empty;
    }

    private Task<GitAutomationProcessResult> RunGitAsync(
        IReadOnlyList<string> arguments,
        CancellationToken cancellationToken
    )
    {
        return GitAutomationProcessRunner.RunGitAsync(
            _repositoryRoot,
            arguments,
            GitTimeoutSeconds,
            cancellationToken
        );
    }
}
