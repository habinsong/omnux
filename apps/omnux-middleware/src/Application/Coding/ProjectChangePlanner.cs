namespace Omnux.Middleware;

internal static class ProjectChangePlanner
{
    public static async Task<IReadOnlyList<ProjectFileChange>> BuildAsync(string project, string baseline, string candidate, CancellationToken token)
    {
        var originalPaths = ProjectWorkspaceFiles.Files(baseline, includeGenerated: true).Select(path => Path.GetRelativePath(baseline, path)).ToHashSet(StringComparer.Ordinal);
        var paths = ProjectWorkspaceFiles.Files(candidate, includeGenerated: true).Select(path => Path.GetRelativePath(candidate, path))
            .Where(path => originalPaths.Contains(path) || !CodingWorkspaceFilePolicy.ShouldSkip(path)).Concat(originalPaths).Distinct(StringComparer.Ordinal).OrderBy(path => path, StringComparer.Ordinal);
        var changes = new List<ProjectFileChange>();
        foreach (var path in paths)
        {
            token.ThrowIfCancellationRequested();
            var oldFile = ProjectChangeFiles.Resolve(baseline, path);
            var nextFile = ProjectChangeFiles.Resolve(candidate, path);
            var currentFile = ProjectChangeFiles.Resolve(project, path);
            var before = await ProjectChangeFiles.HashAsync(oldFile, token);
            var after = await ProjectChangeFiles.HashAsync(nextFile, token);
            if (before == after) continue;
            var current = await ProjectChangeFiles.HashAsync(currentFile, token);
            if (current == after && !Directory.Exists(currentFile)) continue;
            var conflict = current != before || Directory.Exists(currentFile) ? "원본이 바뀌었습니다. 현재 프로젝트에서 다시 작업해 주세요." : null;
            var diff = await ProjectChangeFiles.DiffAsync(path, oldFile, nextFile, token);
            changes.Add(new ProjectFileChange(path.Replace('\\', '/'), before == null ? "added" : after == null ? "deleted" : "modified", before, after, diff.Text, diff.Truncated, conflict));
        }
        return changes;
    }
}
