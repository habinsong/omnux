namespace Omnux.Middleware;

internal static class CodingPreviewPolicy
{
    // 개발 UI, 패키징된 Tauri UI, 미들웨어가 제공하는 동일 출처 UI만 프레임을 표시한다.
    public const string FrameAncestors = "frame-ancestors 'self' http://localhost:1420 http://127.0.0.1:1420 http://[::1]:1420 tauri://localhost http://tauri.localhost https://tauri.localhost";

    public static string ContentType(string path) => Path.GetExtension(path).ToLowerInvariant() switch
    {
        ".html" or ".htm" => "text/html; charset=utf-8",
        ".css" => "text/css; charset=utf-8",
        ".js" or ".mjs" or ".cjs" => "application/javascript; charset=utf-8",
        ".json" => "application/json; charset=utf-8",
        ".svg" => "image/svg+xml",
        ".png" => "image/png",
        ".jpg" or ".jpeg" => "image/jpeg",
        ".gif" => "image/gif",
        ".webp" => "image/webp",
        ".ico" => "image/x-icon",
        ".txt" or ".md" or ".py" or ".pyi" or ".ts" or ".tsx" or ".jsx"
            or ".c" or ".h" or ".cc" or ".cpp" or ".hpp" or ".cs" or ".csproj"
            or ".java" or ".kt" or ".kts" or ".go" or ".rs" or ".php" or ".rb"
            or ".swift" or ".sh" or ".bash" or ".yml" or ".yaml" or ".toml"
            or ".xml" or ".sql" => "text/plain; charset=utf-8",
        _ => string.Empty
    };

    public static bool IsRegularFileWithinRun(string path, string runDirectory)
        => File.Exists(path) && IsPathWithinRunWithoutLinks(path, runDirectory);

    public static bool IsRegularDirectoryWithinRun(string path, string runDirectory)
        => Directory.Exists(path) && IsPathWithinRunWithoutLinks(path, runDirectory);

    private static bool IsPathWithinRunWithoutLinks(string path, string runDirectory)
    {
        var root = Path.TrimEndingDirectorySeparator(Path.GetFullPath(runDirectory));
        var candidate = Path.GetFullPath(path);
        var comparison = OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal;
        var prefix = Path.EndsInDirectorySeparator(root) ? root : root + Path.DirectorySeparatorChar;
        if (!candidate.StartsWith(prefix, comparison)) return false;
        // 미리보기에서 파일·폴더 링크를 따라 다른 위치의 파일을 제공하지 않는다.
        try
        {
            for (string? current = candidate; current != null; current = Path.GetDirectoryName(current))
            {
                if ((File.GetAttributes(current) & FileAttributes.ReparsePoint) != 0) return false;
                if (string.Equals(current, root, comparison)) return true;
            }
        }
        catch (IOException) { return false; }
        catch (UnauthorizedAccessException) { return false; }
        return false;
    }
}
