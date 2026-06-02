namespace Omnux.Middleware;

internal static class TelegramCodingDownloadPolicy
{
    public const int MaxDocumentBytes = 8 * 1024 * 1024;

    public static bool IsAllowedDocumentSize(long sizeBytes)
        => sizeBytes >= 0 && sizeBytes <= MaxDocumentBytes;

    public static string ToRelativePath(string? runDirectory, string? path)
    {
        var fullPath = (path ?? string.Empty).Trim();
        var root = (runDirectory ?? string.Empty).Trim();
        if (fullPath.Length == 0)
        {
            return "(none)";
        }

        if (root.Length > 0 && TryGetRelativePath(root, fullPath, out var relative))
        {
            return relative.Length == 0 ? Path.GetFileName(fullPath) : relative;
        }

        return fullPath;
    }

    public static bool TryResolveChangedFile(
        ConversationCodingResultSnapshot? result,
        string? query,
        out string path,
        out string displayPath
    )
    {
        path = string.Empty;
        displayPath = string.Empty;
        if (result == null)
        {
            return false;
        }

        var files = result.ChangedFiles?
            .Where(item => !string.IsNullOrWhiteSpace(item))
            .ToArray() ?? Array.Empty<string>();
        if (files.Length == 0)
        {
            return false;
        }

        var normalizedQuery = (query ?? string.Empty).Trim();
        if (int.TryParse(normalizedQuery, out var parsedIndex) && parsedIndex >= 1 && parsedIndex <= files.Length)
        {
            return SetResolved(files[parsedIndex - 1], result, out path, out displayPath);
        }

        if (normalizedQuery.Length == 0)
        {
            return SetResolved(files[0], result, out path, out displayPath);
        }

        var matched = files.FirstOrDefault(item =>
        {
            var relative = ToRelativePath(result?.Execution.RunDirectory, item);
            return item.Equals(normalizedQuery, StringComparison.OrdinalIgnoreCase)
                   || relative.Equals(normalizedQuery, StringComparison.OrdinalIgnoreCase)
                   || item.EndsWith(normalizedQuery, StringComparison.OrdinalIgnoreCase)
                   || relative.EndsWith(normalizedQuery, StringComparison.OrdinalIgnoreCase);
        });
        return matched != null && SetResolved(matched, result, out path, out displayPath);
    }

    public static string BuildSafeDocumentName(string? displayPath, DateTimeOffset nowUtc)
    {
        var fileName = Path.GetFileName((displayPath ?? string.Empty).Trim());
        if (string.IsNullOrWhiteSpace(fileName))
        {
            fileName = $"coding-file-{nowUtc:yyyyMMddHHmmss}.txt";
        }

        foreach (var character in Path.GetInvalidFileNameChars())
        {
            fileName = fileName.Replace(character, '_');
        }

        return string.IsNullOrWhiteSpace(fileName) ? $"coding-file-{nowUtc:yyyyMMddHHmmss}.txt" : fileName;
    }

    private static bool SetResolved(
        string candidate,
        ConversationCodingResultSnapshot result,
        out string path,
        out string displayPath
    )
    {
        path = candidate;
        displayPath = ToRelativePath(result.Execution.RunDirectory, candidate);
        return true;
    }

    private static bool TryGetRelativePath(string root, string path, out string relative)
    {
        relative = string.Empty;
        try
        {
            var rootFullPath = Path.GetFullPath(root)
                .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
            var fileFullPath = Path.GetFullPath(path);
            if (string.Equals(rootFullPath, fileFullPath, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }

            var rootPrefix = rootFullPath + Path.DirectorySeparatorChar;
            if (!fileFullPath.StartsWith(rootPrefix, StringComparison.OrdinalIgnoreCase))
            {
                return false;
            }

            relative = Path.GetRelativePath(rootFullPath, fileFullPath);
            return true;
        }
        catch
        {
            return false;
        }
    }
}
