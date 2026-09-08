namespace Omnux.Middleware;

internal static class CodingWorkspaceFilePolicy
{
    private static readonly string[] PrivateDirectories = { ".git", ".project-baseline", ".project-state", ".ssh", ".aws", ".kube" };
    private static readonly string[] GeneratedDirectories = { "node_modules", "venv", ".venv", "site-packages", "__pycache__", "bin", "obj", "dist", "build", ".pytest_cache", ".mypy_cache", ".ruff_cache", ".idea", ".vscode" };

    public static bool IsPrivate(string? relativePath)
    {
        var relative = (relativePath ?? string.Empty).Replace('\\', '/').Trim();
        if (relative.Length == 0 || relative.Split('/').Any(part => part == "..")) return true;
        if (("/" + relative.Trim('/') + "/").Contains("/.config/gh/", StringComparison.OrdinalIgnoreCase)) return true;
        return relative.Split('/', StringSplitOptions.RemoveEmptyEntries).Any(segment =>
            PrivateDirectories.Contains(segment, StringComparer.OrdinalIgnoreCase)
            || segment.StartsWith(".project-copy-", StringComparison.Ordinal)
            || segment.Equals(".env", StringComparison.OrdinalIgnoreCase)
            || segment.StartsWith(".env.", StringComparison.OrdinalIgnoreCase)
            || segment.Equals("id_rsa", StringComparison.OrdinalIgnoreCase)
            || segment.Equals("id_ed25519", StringComparison.OrdinalIgnoreCase)
            || segment.EndsWith(".pem", StringComparison.OrdinalIgnoreCase)
            || segment.EndsWith(".key", StringComparison.OrdinalIgnoreCase));
    }

    public static bool ShouldSkip(string? relativePath)
    {
        if (IsPrivate(relativePath)) return true;
        var relative = relativePath!.Replace('\\', '/');
        return relative.Split('/', StringSplitOptions.RemoveEmptyEntries).Any(segment =>
                GeneratedDirectories.Contains(segment, StringComparer.OrdinalIgnoreCase)
                || segment.EndsWith(".egg-info", StringComparison.OrdinalIgnoreCase))
            || relative.EndsWith(".pyc", StringComparison.OrdinalIgnoreCase)
            || relative.EndsWith(".pyo", StringComparison.OrdinalIgnoreCase)
            || relative.EndsWith(".DS_Store", StringComparison.OrdinalIgnoreCase);
    }
}
