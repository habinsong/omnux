namespace Omnux.Middleware;

internal static class ProjectFileInventory
{
    public static async Task<IReadOnlyList<string>> ReadAsync(string root, CancellationToken cancellationToken)
    {
        var git = await GitAutomationProcessRunner.RunGitAsync(root, new[] { "ls-files", "-z", "--cached", "--others", "--exclude-standard", "--deduplicate" }, 10, cancellationToken);
        if (git.ExitCode == 124) throw new IOException("프로젝트 파일 목록 조회 시간이 초과되었습니다.");
        if (git.ExitCode != 0) return ProjectWorkspaceFiles.Files(root).ToArray();
        if (!Directory.Exists(Path.Combine(root, ".git")) && !File.Exists(Path.Combine(root, ".git")))
        {
            var ignored = await GitAutomationProcessRunner.RunGitAsync(root, new[] { "check-ignore", "--quiet", root }, 10, cancellationToken);
            if (ignored.ExitCode == 0) return ProjectWorkspaceFiles.Files(root).ToArray();
        }
        var files = new HashSet<string>(OperatingSystem.IsWindows() ? StringComparer.OrdinalIgnoreCase : StringComparer.Ordinal);
        foreach (var relative in git.StdOut.Split('\0', StringSplitOptions.RemoveEmptyEntries))
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (CodingWorkspaceFilePolicy.IsPrivate(relative)) continue;
            var path = Path.GetFullPath(Path.Combine(root, relative));
            if (CodingPreviewPolicy.IsRegularFileWithinRun(path, root)) files.Add(path);
            else if (CodingPreviewPolicy.IsRegularDirectoryWithinRun(path, root))
                foreach (var nested in await ReadAsync(path, cancellationToken)) files.Add(nested);
        }
        return files.OrderBy(path => path, StringComparer.Ordinal).ToArray();
    }
}
