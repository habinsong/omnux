using System.Globalization;

namespace Omnux.Middleware;

internal static class GitTimeMachineParsers
{
    private const char RecordSeparator = '\u001e';
    private const char UnitSeparator = '\u001f';

    public static IReadOnlyList<GitTimeMachineCheckpoint> ParseLog(string stdout, string headHash)
    {
        var checkpoints = new List<GitTimeMachineCheckpoint>();
        foreach (var block in (stdout ?? string.Empty).Split(RecordSeparator, StringSplitOptions.RemoveEmptyEntries))
        {
            var header = block
                .Replace("\r\n", "\n", StringComparison.Ordinal)
                .Replace('\r', '\n')
                .Split('\n', 2, StringSplitOptions.None)[0]
                .Split(UnitSeparator);
            if (header.Length < 5)
            {
                continue;
            }

            var hash = header[0].Trim();
            var parents = header[1]
                .Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Select(ShortenHash)
                .ToArray();
            var isHead = hash.Equals(headHash, StringComparison.OrdinalIgnoreCase);
            checkpoints.Add(new GitTimeMachineCheckpoint(
                hash,
                ShortenHash(hash),
                header[4].Trim(),
                header[2].Trim(),
                ParseDate(header[3]),
                parents,
                isHead,
                !isHead,
                BuildRiskFlags(isHead, parents.Length)
            ));
        }

        return checkpoints;
    }

    public static GitTimeMachineWorktreeStatus ParseWorktreeStatus(string stdout)
    {
        var changed = 0;
        var conflicted = 0;
        foreach (var rawLine in (stdout ?? string.Empty)
                     .Replace("\r\n", "\n", StringComparison.Ordinal)
                     .Replace('\r', '\n')
                     .Split('\n', StringSplitOptions.RemoveEmptyEntries))
        {
            if (rawLine.Length < 2)
            {
                continue;
            }

            changed += 1;
            if (IsConflictStatus(rawLine[0], rawLine[1]))
            {
                conflicted += 1;
            }
        }

        return new GitTimeMachineWorktreeStatus(changed, conflicted);
    }

    public static string ShortenHash(string hash)
    {
        var normalized = (hash ?? string.Empty).Trim();
        return normalized.Length <= 12 ? normalized : normalized[..12];
    }

    private static IReadOnlyList<string> BuildRiskFlags(bool isHead, int parentCount)
    {
        var flags = new List<string>
        {
            isHead ? "current_head" : "history_rewrite_required"
        };

        if (parentCount > 1)
        {
            flags.Add("merge_commit");
        }

        return flags;
    }

    private static bool IsConflictStatus(char indexStatus, char worktreeStatus)
    {
        return indexStatus == 'U'
               || worktreeStatus == 'U'
               || (indexStatus == 'A' && worktreeStatus == 'A')
               || (indexStatus == 'D' && worktreeStatus == 'D');
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
}
