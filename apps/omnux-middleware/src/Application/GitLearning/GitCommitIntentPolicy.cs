namespace Omnux.Middleware;

internal static class GitCommitIntentPolicy
{
    public static string Classify(string subject)
    {
        var text = (subject ?? string.Empty).Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(text))
        {
            return "change";
        }

        if (ContainsAny(text, "fix", "bug", "hotfix", "crash", "error", "fail", "regression"))
        {
            return "bug_fix";
        }

        if (ContainsAny(text, "test", "spec", "coverage"))
        {
            return "test";
        }

        if (ContainsAny(text, "refactor", "cleanup", "split", "extract", "rename"))
        {
            return "refactor";
        }

        if (ContainsAny(text, "perf", "performance", "optimize", "speed", "cache"))
        {
            return "performance";
        }

        if (ContainsAny(text, "doc", "readme", "docs"))
        {
            return "docs";
        }

        if (ContainsAny(text, "chore", "build", "ci", "deps", "dependency", "release"))
        {
            return "maintenance";
        }

        if (ContainsAny(text, "feat", "feature", "add", "implement"))
        {
            return "feature";
        }

        return "change";
    }

    private static bool ContainsAny(string text, params string[] values)
    {
        return values.Any(value => text.Contains(value, StringComparison.Ordinal));
    }
}
