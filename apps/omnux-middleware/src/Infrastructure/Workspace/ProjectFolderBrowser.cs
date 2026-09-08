namespace Omnux.Middleware;

public sealed record ProjectFolderEntry(string Name, string Path);
public sealed record ProjectFolderSnapshot(bool Ok, string Path, string? Parent, bool CanSelect, string SelectionReason, IReadOnlyList<ProjectFolderEntry> Roots, IReadOnlyList<ProjectFolderEntry> Items, bool Truncated, string? Error);

internal sealed class ProjectFolderBrowser
{
    private readonly string _workspace;
    private readonly string _home;
    private readonly ProjectDirectoryAccess _access;

    public ProjectFolderBrowser(string workspace, string? privateStateRoot, string? home = null)
    {
        _workspace = workspace;
        _home = home ?? Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        _access = new ProjectDirectoryAccess(privateStateRoot);
    }

    public ProjectFolderSnapshot Browse(string? path, string? search)
    {
        var roots = new[] { new ProjectFolderEntry("작업 폴더", _workspace), new ProjectFolderEntry("홈 폴더", _home) }
            .Where(item => Directory.Exists(item.Path)).DistinctBy(item => item.Path).ToArray();
        try
        {
            var directory = _access.Resolve(string.IsNullOrWhiteSpace(path) ? _workspace : path);
            var filter = (search ?? "").Trim();
            var items = Directory.EnumerateDirectories(directory, "*", new EnumerationOptions { IgnoreInaccessible = true, AttributesToSkip = FileAttributes.Hidden | FileAttributes.System | FileAttributes.ReparsePoint })
                .Where(item => !Path.GetFileName(item).StartsWith('.') && !_access.IsPrivate(item))
                .Where(item => filter.Length == 0 || Path.GetFileName(item).Contains(filter, StringComparison.OrdinalIgnoreCase))
                .OrderBy(Path.GetFileName, StringComparer.OrdinalIgnoreCase).Take(501).Select(item => new ProjectFolderEntry(Path.GetFileName(item), item)).ToArray();
            var canSelect = _access.CanSelect(directory, out var reason);
            return new(true, directory, Directory.GetParent(directory)?.FullName, canSelect, reason, roots, items.Take(500).ToArray(), items.Length > 500, null);
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or ArgumentException or InvalidOperationException)
        {
            return new(false, path ?? "", null, false, "", roots, Array.Empty<ProjectFolderEntry>(), false, error.Message);
        }
    }
}
