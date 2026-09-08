namespace Omnux.Middleware;

internal static class UnifiedTextDiff
{
    public static string Build(string label, string originalText, string updatedText)
    {
        var before = AnchorReadService.SplitLines(originalText);
        var after = AnchorReadService.SplitLines(updatedText);

        var prefix = 0;
        while (prefix < before.Count && prefix < after.Count && before[prefix] == after[prefix])
        {
            prefix++;
        }

        var suffix = 0;
        while (suffix < before.Count - prefix
            && suffix < after.Count - prefix
            && before[before.Count - 1 - suffix] == after[after.Count - 1 - suffix])
        {
            suffix++;
        }

        var context = 3;
        var oldChangeStart = prefix;
        var newChangeStart = prefix;
        var oldChangeEnd = before.Count - suffix;
        var newChangeEnd = after.Count - suffix;
        var oldHunkStart = Math.Max(0, oldChangeStart - context);
        var newHunkStart = Math.Max(0, newChangeStart - context);
        var oldHunkEnd = Math.Min(before.Count, oldChangeEnd + context);
        var newHunkEnd = Math.Min(after.Count, newChangeEnd + context);
        var oldCount = oldHunkEnd - oldHunkStart;
        var newCount = newHunkEnd - newHunkStart;

        var lines = new List<string>
        {
            $"--- a/{label}",
            $"+++ b/{label}",
            $"@@ -{FormatRange(oldHunkStart, oldCount)} +{FormatRange(newHunkStart, newCount)} @@"
        };

        for (var index = oldHunkStart; index < oldChangeStart; index++)
        {
            lines.Add($" {before[index]}");
        }

        for (var index = oldChangeStart; index < oldChangeEnd; index++)
        {
            lines.Add($"-{before[index]}");
        }

        for (var index = newChangeStart; index < newChangeEnd; index++)
        {
            lines.Add($"+{after[index]}");
        }

        for (var index = oldChangeEnd; index < oldHunkEnd; index++)
        {
            lines.Add($" {before[index]}");
        }

        return string.Join("\n", lines);
    }

    private static string FormatRange(int zeroBasedStart, int count)
    {
        var start = count == 0 ? zeroBasedStart : zeroBasedStart + 1;
        return count == 1
            ? $"{start}"
            : $"{start},{count}";
    }
}
