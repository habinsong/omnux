namespace Omnux.Middleware;

internal static class ProjectWorkspaceFiles
{
    internal const string BaselineDirectory = ".project-baseline";

    public static string CanonicalDirectory(string path)
    {
        var full = Path.GetFullPath(path);
        if (!Directory.Exists(full)) throw new InvalidOperationException("프로젝트 폴더를 찾을 수 없습니다. 폴더를 복원하거나 다른 프로젝트를 선택해 주세요.");
        var root = Path.GetPathRoot(full)!;
        var current = root;
        foreach (var part in Path.GetRelativePath(root, full).Split(Path.DirectorySeparatorChar, StringSplitOptions.RemoveEmptyEntries))
        {
            if (part == ".") continue;
            current = Path.Combine(current, part);
            var info = new DirectoryInfo(current);
            if ((info.Attributes & FileAttributes.ReparsePoint) != 0)
                current = CanonicalDirectory(info.ResolveLinkTarget(returnFinalTarget: true)?.FullName ?? throw new IOException("프로젝트 폴더 링크를 해석하지 못했습니다."));
        }
        return Path.TrimEndingDirectorySeparator(current);
    }

    public static IEnumerable<string> Files(string root, bool includeGenerated = false)
    {
        var stack = new Stack<string>();
        stack.Push(root);
        var options = new EnumerationOptions { IgnoreInaccessible = false, AttributesToSkip = FileAttributes.ReparsePoint };
        while (stack.TryPop(out var directory))
        {
            foreach (var path in Directory.EnumerateFileSystemEntries(directory, "*", options))
            {
                var relative = Path.GetRelativePath(root, path);
                if (includeGenerated ? CodingWorkspaceFilePolicy.IsPrivate(relative) : CodingWorkspaceFilePolicy.ShouldSkip(relative)) continue;
                if (Directory.Exists(path)) stack.Push(path);
                else if (File.Exists(path)) yield return path;
            }
        }
    }

    public static async Task<Dictionary<string, string>> FingerprintsAsync(string root, CancellationToken cancellationToken, bool sourceProject = false)
    {
        var hashes = new Dictionary<string, string>(OperatingSystem.IsWindows() ? StringComparer.OrdinalIgnoreCase : StringComparer.Ordinal);
        var files = sourceProject ? await ProjectFileInventory.ReadAsync(root, cancellationToken) : Files(root).ToArray();
        foreach (var path in files)
        {
            cancellationToken.ThrowIfCancellationRequested();
            hashes[Path.GetRelativePath(root, path)] = await ProjectChangeFiles.HashAsync(path, cancellationToken) ?? throw new IOException("파일 목록 조회 중 파일이 삭제되었습니다.");
        }
        return hashes;
    }

    public static async Task CopyAsync(string source, string destination, CancellationToken cancellationToken, bool sourceProject = false)
    {
        var files = sourceProject ? await ProjectFileInventory.ReadAsync(source, cancellationToken) : Files(source, includeGenerated: true).ToArray();
        foreach (var path in files)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var target = Path.Combine(destination, Path.GetRelativePath(source, path));
            Directory.CreateDirectory(Path.GetDirectoryName(target)!);
            await using (var input = File.OpenRead(path))
            await using (var output = new FileStream(target, FileMode.CreateNew, FileAccess.Write, FileShare.None))
                await input.CopyToAsync(output, cancellationToken);
            if (!OperatingSystem.IsWindows()) File.SetUnixFileMode(target, File.GetUnixFileMode(path));
            File.SetLastWriteTimeUtc(target, File.GetLastWriteTimeUtc(path));
        }
        Directory.CreateDirectory(destination);
    }

    public static async Task PrepareComparisonAsync(CodingProjectBinding binding, string runRoot, CancellationToken cancellationToken)
    {
        var baseline = Path.Combine(runRoot, BaselineDirectory);
        if (Directory.Exists(baseline)) return;
        var temporary = Path.Combine(runRoot, ".project-copy-" + Guid.NewGuid().ToString("N"));
        try
        {
            await CopyAsync(binding.Path, temporary, cancellationToken, sourceProject: true);
            Directory.Move(temporary, baseline);
        }
        finally { if (Directory.Exists(temporary)) Directory.Delete(temporary, recursive: true); }
    }

    public static async Task<string> WorkerDirectoryAsync(CodingProjectBinding? binding, string runRoot, string provider, string model, CancellationToken cancellationToken)
    {
        var directory = CodingWorkerSelectionPolicy.BuildWorkerWorkspaceRoot(runRoot, provider, model);
        if (binding != null && !Directory.Exists(directory))
        {
            var temporary = Path.Combine(runRoot, ".project-copy-" + Guid.NewGuid().ToString("N"));
            try
            {
                await CopyAsync(Path.Combine(runRoot, BaselineDirectory), temporary, cancellationToken);
                Directory.Move(temporary, directory);
            }
            finally { if (Directory.Exists(temporary)) Directory.Delete(temporary, recursive: true); }
        }
        return directory;
    }
}
