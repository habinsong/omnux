namespace Omnux.Middleware;

internal static class LogicRunRecoveryScanner
{
    private const string SnapshotFileName = "snapshot.json";
    private const int DefaultLimit = 50;
    private const int MaxLimit = 200;

    public static LogicRunRecoveryListResult List(string runtimeRoot, int? limit = null)
    {
        var scannedAtUtc = DateTimeOffset.UtcNow.ToString("O");
        if (string.IsNullOrWhiteSpace(runtimeRoot) || !Directory.Exists(runtimeRoot))
        {
            return new LogicRunRecoveryListResult(Array.Empty<LogicRunRecoveryCandidate>(), 0, scannedAtUtc);
        }

        var candidates = new List<LogicRunRecoveryCandidate>();
        foreach (var snapshot in EnumerateSnapshots(runtimeRoot))
        {
            if (LogicNodeRuntimePolicy.IsTerminalStatus(snapshot.Status))
            {
                continue;
            }

            candidates.Add(ToCandidate(snapshot));
        }

        var ordered = candidates
            .OrderByDescending(item => ParseTimestamp(item.UpdatedAtUtc))
            .ThenBy(item => item.GraphId, StringComparer.Ordinal)
            .ThenBy(item => item.RunId, StringComparer.Ordinal)
            .ToArray();
        var resolvedLimit = Math.Clamp(limit ?? DefaultLimit, 1, MaxLimit);
        return new LogicRunRecoveryListResult(
            ordered.Take(resolvedLimit).ToArray(),
            ordered.Length,
            scannedAtUtc
        );
    }

    private static IEnumerable<LogicRunSnapshot> EnumerateSnapshots(string runtimeRoot)
    {
        IEnumerable<string> graphDirectories;
        try
        {
            graphDirectories = Directory.EnumerateDirectories(runtimeRoot);
        }
        catch
        {
            yield break;
        }

        foreach (var graphDirectory in graphDirectories)
        {
            IEnumerable<string> runDirectories;
            try
            {
                runDirectories = Directory.EnumerateDirectories(graphDirectory);
            }
            catch
            {
                continue;
            }

            foreach (var runDirectory in runDirectories)
            {
                var snapshotPath = Path.Combine(runDirectory, SnapshotFileName);
                LogicRunSnapshot? snapshot = null;
                try
                {
                    if (File.Exists(snapshotPath))
                    {
                        snapshot = LogicGraphJson.DeserializeSnapshot(File.ReadAllText(snapshotPath));
                    }
                }
                catch
                {
                    snapshot = null;
                }

                if (snapshot != null)
                {
                    yield return snapshot;
                }
            }
        }
    }

    private static LogicRunRecoveryCandidate ToCandidate(LogicRunSnapshot snapshot)
    {
        var nodes = snapshot.Nodes ?? Array.Empty<LogicNodeRunState>();
        return new LogicRunRecoveryCandidate(
            snapshot.RunId,
            snapshot.GraphId,
            snapshot.Title,
            NormalizeStatus(snapshot.Status),
            snapshot.Source,
            snapshot.StartedAtUtc,
            snapshot.UpdatedAtUtc,
            nodes.Count(node => string.Equals(node.Status, "completed", StringComparison.OrdinalIgnoreCase)),
            nodes.Count(node => string.Equals(node.Status, "error", StringComparison.OrdinalIgnoreCase)),
            nodes.Count(node =>
                string.Equals(node.Status, "pending", StringComparison.OrdinalIgnoreCase)
                || string.Equals(node.Status, "running", StringComparison.OrdinalIgnoreCase)),
            (snapshot.Logs ?? Array.Empty<string>()).LastOrDefault() ?? string.Empty
        );
    }

    private static DateTimeOffset ParseTimestamp(string value)
    {
        return DateTimeOffset.TryParse(value, out var parsed)
            ? parsed
            : DateTimeOffset.MinValue;
    }

    private static string NormalizeStatus(string? status)
    {
        var normalized = (status ?? string.Empty).Trim().ToLowerInvariant();
        return string.IsNullOrWhiteSpace(normalized) ? "unknown" : normalized;
    }
}
