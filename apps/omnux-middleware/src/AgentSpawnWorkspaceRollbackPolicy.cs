using System.Text;

namespace Omnux.Middleware;

public sealed class AgentSpawnWorkspaceRollbackPolicy
{
    private const int MaxSnapshotFiles = 400;
    private const int MaxFileBytes = 256 * 1024;
    private const int MaxTotalBytes = 4 * 1024 * 1024;
    private static readonly UTF8Encoding StrictUtf8 = new(false, true);
    private static readonly HashSet<string> ExcludedDirectoryNames = new(StringComparer.OrdinalIgnoreCase)
    {
        ".git",
        ".hg",
        ".svn",
        ".runtime",
        ".venv",
        "bin",
        "build",
        "dist",
        "node_modules",
        "obj",
        "out",
        "target"
    };

    private readonly string _workspaceRoot;
    private readonly DiffPreviewService _diffPreviewService;
    private readonly Func<DateTimeOffset> _utcNow;

    public AgentSpawnWorkspaceRollbackPolicy(
        PathOptions paths,
        DiffPreviewService diffPreviewService,
        Func<DateTimeOffset>? utcNow = null
    )
    {
        _workspaceRoot = Path.GetFullPath(paths.WorkspaceRootDir);
        _diffPreviewService = diffPreviewService;
        _utcNow = utcNow ?? (() => DateTimeOffset.UtcNow);
    }

    public AgentSpawnWorkspaceBaseline CaptureBaseline()
    {
        var scan = ScanWorkspace();
        return new AgentSpawnWorkspaceBaseline(
            _utcNow(),
            scan.Files,
            scan.ScannedFiles,
            scan.SkippedFiles,
            scan.Truncated
        );
    }

    public AgentSpawnWorkspaceRollbackSnapshot? SaveRollbackIfChanged(
        AgentSpawnWorkspaceBaseline? baseline,
        string runId,
        string childSessionKey
    )
    {
        if (baseline == null)
        {
            return null;
        }

        var current = ScanWorkspace();
        var files = new List<RefactorRollbackFile>();
        var modified = 0;
        var created = 0;
        var deleted = 0;
        var diffTruncated = false;

        foreach (var before in baseline.Files.Values.OrderBy(file => file.Path, StringComparer.Ordinal))
        {
            if (!current.Files.TryGetValue(before.Path, out var after))
            {
                if (files.Count >= MaxSnapshotFiles)
                {
                    diffTruncated = true;
                    break;
                }

                files.Add(new RefactorRollbackFile(
                    before.Path,
                    before.Text,
                    string.Empty,
                    before.Hash,
                    string.Empty,
                    OriginalExists: true,
                    AppliedExists: false
                ));
                deleted++;
                continue;
            }

            if (!string.Equals(before.Hash, after.Hash, StringComparison.Ordinal))
            {
                if (files.Count >= MaxSnapshotFiles)
                {
                    diffTruncated = true;
                    break;
                }

                files.Add(new RefactorRollbackFile(
                    before.Path,
                    before.Text,
                    after.Text,
                    before.Hash,
                    after.Hash,
                    OriginalExists: true,
                    AppliedExists: true
                ));
                modified++;
            }
        }

        if (!diffTruncated)
        {
            foreach (var after in current.Files.Values.OrderBy(file => file.Path, StringComparer.Ordinal))
            {
                if (baseline.Files.ContainsKey(after.Path))
                {
                    continue;
                }

                if (files.Count >= MaxSnapshotFiles)
                {
                    diffTruncated = true;
                    break;
                }

                files.Add(new RefactorRollbackFile(
                    after.Path,
                    string.Empty,
                    after.Text,
                    string.Empty,
                    after.Hash,
                    OriginalExists: false,
                    AppliedExists: true
                ));
                created++;
            }
        }

        if (files.Count == 0)
        {
            return null;
        }

        var now = _utcNow();
        var rollbackId = $"rollback_{now:yyyyMMddHHmmss}_{Guid.NewGuid():N}"[..32];
        var record = new RefactorRollbackRecord(
            rollbackId,
            $"sessions_spawn:{NormalizeToken(runId, "run")}",
            now.ToString("O"),
            files
        );
        var path = _diffPreviewService.SaveRollback(record);
        var partial = baseline.Partial || current.Truncated || diffTruncated;
        var skipped = baseline.SkippedFiles + current.SkippedFiles + (diffTruncated ? 1 : 0);
        return new AgentSpawnWorkspaceRollbackSnapshot(
            rollbackId,
            path,
            files.Count,
            created,
            deleted,
            modified,
            partial,
            skipped,
            NormalizeToken(childSessionKey, "child")
        );
    }

    private AgentSpawnWorkspaceScan ScanWorkspace()
    {
        var files = new Dictionary<string, AgentSpawnWorkspaceFileSnapshot>(StringComparer.Ordinal);
        var scanned = 0;
        var skipped = 0;
        var totalBytes = 0;
        var truncated = false;

        if (!Directory.Exists(_workspaceRoot))
        {
            return new AgentSpawnWorkspaceScan(files, scanned, skipped, truncated);
        }

        var pendingDirectories = new Stack<string>();
        pendingDirectories.Push(_workspaceRoot);
        while (pendingDirectories.Count > 0)
        {
            var directory = Path.GetFullPath(pendingDirectories.Pop());
            if (!IsInsideWorkspace(directory) || IsExcludedPath(directory))
            {
                skipped++;
                continue;
            }

            string[] directoryFiles;
            string[] childDirectories;
            try
            {
                directoryFiles = Directory.GetFiles(directory)
                    .OrderBy(path => path, StringComparer.Ordinal)
                    .ToArray();
                childDirectories = Directory.GetDirectories(directory)
                    .OrderBy(path => path, StringComparer.Ordinal)
                    .ToArray();
            }
            catch
            {
                truncated = true;
                skipped++;
                continue;
            }

            foreach (var candidate in directoryFiles)
            {
                if (files.Count >= MaxSnapshotFiles || totalBytes >= MaxTotalBytes)
                {
                    truncated = true;
                    skipped++;
                    return new AgentSpawnWorkspaceScan(files, scanned, skipped, truncated);
                }

                var fullPath = Path.GetFullPath(candidate);
                if (!IsInsideWorkspace(fullPath) || IsExcludedPath(fullPath))
                {
                    skipped++;
                    continue;
                }

                if (!TryReadTextFile(fullPath, out var text, out var byteCount))
                {
                    skipped++;
                    continue;
                }

                if (totalBytes + byteCount > MaxTotalBytes)
                {
                    truncated = true;
                    skipped++;
                    return new AgentSpawnWorkspaceScan(files, scanned, skipped, truncated);
                }

                scanned++;
                totalBytes += byteCount;
                files[fullPath] = new AgentSpawnWorkspaceFileSnapshot(
                    fullPath,
                    text,
                    DiffPreviewService.ComputeTextHash(text),
                    byteCount
                );
            }

            for (var index = childDirectories.Length - 1; index >= 0; index--)
            {
                var childDirectory = Path.GetFullPath(childDirectories[index]);
                if (IsExcludedPath(childDirectory))
                {
                    skipped++;
                    continue;
                }

                pendingDirectories.Push(childDirectory);
            }
        }

        return new AgentSpawnWorkspaceScan(files, scanned, skipped, truncated);
    }

    private bool IsInsideWorkspace(string fullPath)
    {
        var comparison = OperatingSystem.IsWindows()
            ? StringComparison.OrdinalIgnoreCase
            : StringComparison.Ordinal;
        return fullPath.Equals(_workspaceRoot, comparison)
            || fullPath.StartsWith(_workspaceRoot + Path.DirectorySeparatorChar, comparison);
    }

    private bool IsExcludedPath(string fullPath)
    {
        var relative = Path.GetRelativePath(_workspaceRoot, fullPath).Replace('\\', '/');
        if (relative.StartsWith("../", StringComparison.Ordinal) || relative.Equals("..", StringComparison.Ordinal))
        {
            return true;
        }

        var segments = relative.Split('/', StringSplitOptions.RemoveEmptyEntries);
        return segments.Any(segment => ExcludedDirectoryNames.Contains(segment));
    }

    private static bool TryReadTextFile(string path, out string text, out int byteCount)
    {
        text = string.Empty;
        byteCount = 0;
        try
        {
            var info = new FileInfo(path);
            if (!info.Exists || info.Length > MaxFileBytes)
            {
                return false;
            }

            var bytes = File.ReadAllBytes(path);
            byteCount = bytes.Length;
            if (bytes.Any(value => value == 0))
            {
                return false;
            }

            text = StrictUtf8.GetString(bytes);
            return true;
        }
        catch
        {
            text = string.Empty;
            byteCount = 0;
            return false;
        }
    }

    private static string NormalizeToken(string? value, string fallback)
    {
        var normalized = (value ?? string.Empty).Trim();
        return string.IsNullOrWhiteSpace(normalized) ? fallback : normalized;
    }
}

public sealed record AgentSpawnWorkspaceBaseline(
    DateTimeOffset CreatedAtUtc,
    IReadOnlyDictionary<string, AgentSpawnWorkspaceFileSnapshot> Files,
    int ScannedFiles,
    int SkippedFiles,
    bool Partial
);

public sealed record AgentSpawnWorkspaceRollbackSnapshot(
    string RollbackId,
    string Path,
    int ChangedFiles,
    int CreatedFiles,
    int DeletedFiles,
    int ModifiedFiles,
    bool Partial,
    int SkippedFiles,
    string ChildSessionKey
);

public sealed record AgentSpawnWorkspaceFileSnapshot(
    string Path,
    string Text,
    string Hash,
    int ByteCount
);

internal sealed record AgentSpawnWorkspaceScan(
    IReadOnlyDictionary<string, AgentSpawnWorkspaceFileSnapshot> Files,
    int ScannedFiles,
    int SkippedFiles,
    bool Truncated
);
