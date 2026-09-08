namespace Omnux.Middleware;

internal sealed class ProjectDirectoryAccess
{
    private readonly string? _privateStateRoot;
    private static readonly StringComparison Comparison = OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal;
    private static readonly HashSet<string> PrivateDirectories = new(StringComparer.OrdinalIgnoreCase) { ".ssh", ".aws", ".kube", ".gnupg" };

    public ProjectDirectoryAccess(string? privateStateRoot) => _privateStateRoot = privateStateRoot == null ? null : Path.GetFullPath(privateStateRoot);

    public static string Normalize(string path)
    {
        var value = path.Trim();
        if (value == "~" || value.StartsWith("~/", StringComparison.Ordinal) || value.StartsWith("~\\", StringComparison.Ordinal))
            value = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), value.Length > 2 ? value[2..] : "");
        return Path.GetFullPath(Environment.ExpandEnvironmentVariables(value));
    }

    public string Resolve(string path)
    {
        var full = Normalize(path);
        if (!Directory.Exists(full)) throw new DirectoryNotFoundException("존재하는 폴더 경로를 입력해 주세요.");
        var canonical = ProjectWorkspaceFiles.CanonicalDirectory(full);
        if (IsPrivate(canonical)) throw new UnauthorizedAccessException("개인 자격증명이나 omnux 상태 폴더는 프로젝트로 사용할 수 없습니다.");
        return canonical;
    }

    public bool CanSelect(string directory, out string reason)
    {
        if (directory.Equals(Path.GetPathRoot(directory), Comparison))
        {
            reason = "파일 시스템 전체를 프로젝트로 사용할 수 없습니다. 하위 폴더를 선택해 주세요.";
            return false;
        }
        var state = CanonicalStateRoot();
        if (state != null && (state.Equals(directory, Comparison) || state.StartsWith(Path.TrimEndingDirectorySeparator(directory) + Path.DirectorySeparatorChar, Comparison)))
        {
            reason = "개인 상태 폴더를 포함합니다. 작업할 하위 폴더를 선택해 주세요.";
            return false;
        }
        reason = "";
        return true;
    }

    public bool IsPrivate(string directory)
    {
        var parts = directory.Split(Path.DirectorySeparatorChar, StringSplitOptions.RemoveEmptyEntries);
        if (parts.Any(PrivateDirectories.Contains)) return true;
        for (var i = 1; i < parts.Length; i++)
            if (parts[i - 1].Equals(".config", StringComparison.OrdinalIgnoreCase) && parts[i].Equals("gh", StringComparison.OrdinalIgnoreCase)) return true;
        var state = CanonicalStateRoot();
        return state != null && (directory.Equals(state, Comparison) || directory.StartsWith(state + Path.DirectorySeparatorChar, Comparison));
    }

    private string? CanonicalStateRoot()
    {
        if (_privateStateRoot == null) return null;
        var ancestor = _privateStateRoot;
        while (!Directory.Exists(ancestor))
        {
            var parent = Path.GetDirectoryName(ancestor);
            if (string.IsNullOrEmpty(parent)) return _privateStateRoot;
            ancestor = parent;
        }
        return Path.GetFullPath(Path.Combine(ProjectWorkspaceFiles.CanonicalDirectory(ancestor), Path.GetRelativePath(ancestor, _privateStateRoot)));
    }
}
