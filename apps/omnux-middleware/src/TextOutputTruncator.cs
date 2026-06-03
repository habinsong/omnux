namespace Omnux.Middleware;

internal static class TextOutputTruncator
{
    public const string DefaultTruncationMarker = "...(truncated)";

    public static string TruncateWithMin200(string text, int limit)
    {
        var normalized = text ?? string.Empty;
        var safeLimit = Math.Max(200, limit);
        if (normalized.Length <= safeLimit)
        {
            return normalized;
        }

        return normalized[..safeLimit] + DefaultTruncationMarker;
    }

    public static string TruncateRaw(string text, int maxChars)
    {
        if (string.IsNullOrEmpty(text) || maxChars <= 0 || text.Length <= maxChars)
        {
            return text ?? string.Empty;
        }

        return text[..maxChars] + DefaultTruncationMarker;
    }

    public static string TruncatePreservingStructure(string text, int limit)
    {
        var normalized = text ?? string.Empty;
        var safeLimit = Math.Max(200, limit);
        if (normalized.Length <= safeLimit)
        {
            return normalized;
        }

        var cutoff = FindStableCutoff(normalized, safeLimit);
        var body = normalized[..cutoff].TrimEnd();
        if (HasOpenMarkdownFence(body))
        {
            body += "\n```";
        }

        return body + "\n" + DefaultTruncationMarker;
    }

    public static string TruncateWithEllipsis(string text, int limit)
    {
        var normalized = (text ?? string.Empty).Trim();
        if (normalized.Length <= limit)
        {
            return normalized;
        }

        return normalized[..Math.Max(0, limit - 3)] + "...";
    }

    private static int FindStableCutoff(string text, int safeLimit)
    {
        var lastStableLineEnd = 0;
        var cursor = 0;
        while (cursor < text.Length)
        {
            var next = text.IndexOf('\n', cursor);
            if (next < 0 || next > safeLimit)
            {
                break;
            }

            var line = text[cursor..next].Trim();
            if (IsStableLineBoundary(line))
            {
                lastStableLineEnd = next + 1;
            }

            cursor = next + 1;
        }

        var minimumUsefulCutoff = Math.Min(safeLimit, Math.Max(80, safeLimit / 2));
        if (lastStableLineEnd >= minimumUsefulCutoff)
        {
            return lastStableLineEnd;
        }

        var lastNewline = text.LastIndexOf('\n', Math.Min(safeLimit, text.Length - 1));
        return lastNewline >= minimumUsefulCutoff ? lastNewline + 1 : safeLimit;
    }

    private static bool IsStableLineBoundary(string line)
    {
        if (line.Length == 0 || line == "```")
        {
            return true;
        }

        return line.EndsWith("}", StringComparison.Ordinal)
               || line.EndsWith("};", StringComparison.Ordinal)
               || line.EndsWith("];", StringComparison.Ordinal)
               || line.EndsWith("),", StringComparison.Ordinal)
               || line.EndsWith(");", StringComparison.Ordinal)
               || line.EndsWith("]", StringComparison.Ordinal)
               || line.EndsWith(",", StringComparison.Ordinal);
    }

    private static bool HasOpenMarkdownFence(string text)
    {
        var count = 0;
        var index = 0;
        while ((index = text.IndexOf("```", index, StringComparison.Ordinal)) >= 0)
        {
            count += 1;
            index += 3;
        }

        return count % 2 == 1;
    }
}
