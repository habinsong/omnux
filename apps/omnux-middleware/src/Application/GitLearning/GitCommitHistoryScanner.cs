using System.Diagnostics;
using System.Globalization;

namespace Omnux.Middleware;

internal sealed class GitCommitHistoryScanner
{
    private const int DefaultLimit = 30;
    private const int MaxLimit = 200;
    private const int GitTimeoutSeconds = 5;
    private const char RecordSeparator = '\u001e';
    private const char UnitSeparator = '\u001f';

    private readonly string _repositoryRoot;

    public GitCommitHistoryScanner(string repositoryRoot)
    {
        _repositoryRoot = Path.GetFullPath(string.IsNullOrWhiteSpace(repositoryRoot) ? "." : repositoryRoot);
    }

    public async Task<GitCommitLearningSnapshot> GetSnapshotAsync(
        int? requestedLimit,
        CancellationToken cancellationToken
    )
    {
        var limit = Math.Clamp(requestedLimit ?? DefaultLimit, 1, MaxLimit);
        var warnings = new List<string>();
        var git = await RunGitAsync(
            new[]
            {
                "log",
                $"--max-count={limit.ToString(CultureInfo.InvariantCulture)}",
                "--date=iso-strict",
                "--numstat",
                "--format=%x1e%H%x1f%an%x1f%aI%x1f%s"
            },
            cancellationToken
        ).ConfigureAwait(false);

        if (git.ExitCode != 0)
        {
            warnings.Add(string.IsNullOrWhiteSpace(git.StdErr)
                ? "git log failed"
                : TrimWarning(git.StdErr));
            return BuildSnapshot(limit, Array.Empty<GitCommitLearningEntry>(), warnings);
        }

        var commits = ParseLog(git.StdOut)
            .Take(limit)
            .ToArray();
        if (commits.Length == 0)
        {
            warnings.Add("no git commits found");
        }

        return BuildSnapshot(limit, commits, warnings);
    }

    private GitCommitLearningSnapshot BuildSnapshot(
        int limit,
        IReadOnlyList<GitCommitLearningEntry> commits,
        IReadOnlyList<string> warnings
    )
    {
        var intents = commits
            .GroupBy(commit => commit.Intent, StringComparer.Ordinal)
            .Select(group => new GitCommitIntentRollup(
                group.Key,
                group.Count(),
                group.Sum(commit => commit.AddedLines),
                group.Sum(commit => commit.DeletedLines)
            ))
            .OrderByDescending(item => item.CommitCount)
            .ThenBy(item => item.Intent, StringComparer.Ordinal)
            .ToArray();

        var hotspots = BuildHotspots(commits);
        return new GitCommitLearningSnapshot(
            _repositoryRoot,
            limit,
            commits,
            intents,
            hotspots,
            warnings,
            commits.Count,
            DateTimeOffset.UtcNow
        );
    }

    private static IReadOnlyList<GitCommitFileHotspot> BuildHotspots(IReadOnlyList<GitCommitLearningEntry> commits)
    {
        var map = new Dictionary<string, (int Count, string LastCommit, string LastSubject)>(StringComparer.Ordinal);
        foreach (var commit in commits)
        {
            foreach (var path in commit.TopPaths.Distinct(StringComparer.Ordinal))
            {
                if (!map.TryGetValue(path, out var current))
                {
                    map[path] = (1, commit.ShortHash, commit.Subject);
                    continue;
                }

                map[path] = (current.Count + 1, current.LastCommit, current.LastSubject);
            }
        }

        return map
            .Select(item => new GitCommitFileHotspot(
                item.Key,
                item.Value.Count,
                item.Value.LastCommit,
                item.Value.LastSubject
            ))
            .OrderByDescending(item => item.ChangeCount)
            .ThenBy(item => item.Path, StringComparer.Ordinal)
            .Take(20)
            .ToArray();
    }

    private static IReadOnlyList<GitCommitLearningEntry> ParseLog(string stdout)
    {
        var entries = new List<GitCommitLearningEntry>();
        foreach (var block in (stdout ?? string.Empty).Split(RecordSeparator, StringSplitOptions.RemoveEmptyEntries))
        {
            var lines = block
                .Replace("\r\n", "\n", StringComparison.Ordinal)
                .Replace('\r', '\n')
                .Split('\n', StringSplitOptions.RemoveEmptyEntries);
            if (lines.Length == 0)
            {
                continue;
            }

            var header = lines[0].Split(UnitSeparator);
            if (header.Length < 4)
            {
                continue;
            }

            var hash = header[0].Trim();
            var author = header[1].Trim();
            var subject = header[3].Trim();
            var date = ParseDate(header[2]);
            var changedPaths = new List<string>();
            var added = 0;
            var deleted = 0;

            for (var i = 1; i < lines.Length; i += 1)
            {
                var parts = lines[i].Split('\t');
                if (parts.Length < 3)
                {
                    continue;
                }

                if (int.TryParse(parts[0], NumberStyles.Integer, CultureInfo.InvariantCulture, out var addedLines))
                {
                    added += addedLines;
                }

                if (int.TryParse(parts[1], NumberStyles.Integer, CultureInfo.InvariantCulture, out var deletedLines))
                {
                    deleted += deletedLines;
                }

                var path = parts[2].Trim();
                if (!string.IsNullOrWhiteSpace(path))
                {
                    changedPaths.Add(path);
                }
            }

            entries.Add(new GitCommitLearningEntry(
                hash,
                hash.Length <= 12 ? hash : hash[..12],
                subject,
                author,
                date,
                GitCommitIntentPolicy.Classify(subject),
                changedPaths.Count,
                added,
                deleted,
                changedPaths.Take(8).ToArray()
            ));
        }

        return entries;
    }

    private async Task<GitProcessResult> RunGitAsync(
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
            return new GitProcessResult(127, string.Empty, ex.Message);
        }

        using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeoutCts.CancelAfter(TimeSpan.FromSeconds(GitTimeoutSeconds));
        var stdoutTask = process.StandardOutput.ReadToEndAsync(timeoutCts.Token);
        var stderrTask = process.StandardError.ReadToEndAsync(timeoutCts.Token);

        try
        {
            await process.WaitForExitAsync(timeoutCts.Token).ConfigureAwait(false);
            return new GitProcessResult(
                process.ExitCode,
                await stdoutTask.ConfigureAwait(false),
                await stderrTask.ConfigureAwait(false)
            );
        }
        catch (OperationCanceledException)
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

            return new GitProcessResult(124, string.Empty, "git command timed out");
        }
    }

    private static DateTimeOffset? ParseDate(string value)
    {
        return DateTimeOffset.TryParse(
            value,
            CultureInfo.InvariantCulture,
            DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal,
            out var parsed
        )
            ? parsed.ToUniversalTime()
            : null;
    }

    private static string TrimWarning(string text)
    {
        var normalized = (text ?? string.Empty).Trim();
        return normalized.Length <= 500 ? normalized : normalized[..500] + "...";
    }

    private sealed record GitProcessResult(int ExitCode, string StdOut, string StdErr);
}
