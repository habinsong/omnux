namespace Omnux.Middleware;

internal static class GitAutomationSuggestionPolicy
{
    public static string BuildSuggestedCommitMessage(IReadOnlyList<GitAutomationChangedFile> files)
    {
        var type = ResolveCommitType(files);
        var scope = ResolveCommitScope(files);
        var subject = ResolveCommitSubject(scope);
        return string.IsNullOrWhiteSpace(scope)
            ? $"{type}: {subject}"
            : $"{type}({scope}): {subject}";
    }

    public static string BuildSuggestedBranchName(IReadOnlyList<GitAutomationChangedFile> files)
    {
        var scope = ResolveCommitScope(files);
        var slug = string.IsNullOrWhiteSpace(scope) ? "workspace-changes" : $"{scope}-changes";
        return $"codex/{slug}";
    }

    private static string ResolveCommitType(IReadOnlyList<GitAutomationChangedFile> files)
    {
        if (files.Count > 0 && files.All(file => IsDocsPath(file.Path)))
        {
            return "docs";
        }

        if (files.Count > 0 && files.All(file => IsTestPath(file.Path)))
        {
            return "test";
        }

        if (files.Any(file => file.Category == "added" || file.Untracked))
        {
            return "feat";
        }

        if (files.Any(file => file.Category == "deleted" || file.Category == "renamed"))
        {
            return "refactor";
        }

        if (files.Count > 0 && files.All(file => IsMaintenancePath(file.Path)))
        {
            return "chore";
        }

        return "chore";
    }

    private static string ResolveCommitScope(IReadOnlyList<GitAutomationChangedFile> files)
    {
        var scopes = files
            .Select(file => PathToScope(file.Path))
            .Where(scope => !string.IsNullOrWhiteSpace(scope))
            .GroupBy(scope => scope, StringComparer.Ordinal)
            .OrderByDescending(group => group.Count())
            .ThenBy(group => group.Key, StringComparer.Ordinal)
            .Select(group => group.Key)
            .ToArray();
        return scopes.FirstOrDefault() ?? string.Empty;
    }

    private static string ResolveCommitSubject(string scope)
    {
        return scope switch
        {
            "middleware" => "update backend changes",
            "desktop" => "update desktop shell changes",
            "docs" => "update documentation",
            "tests" => "update tests",
            _ => "update workspace changes"
        };
    }

    private static string PathToScope(string path)
    {
        var normalized = (path ?? string.Empty).Replace('\\', '/');
        if (normalized.StartsWith("apps/omnux-middleware", StringComparison.Ordinal))
        {
            return "middleware";
        }

        if (normalized.StartsWith("apps/desktop", StringComparison.Ordinal))
        {
            return "desktop";
        }

        if (IsTestPath(normalized))
        {
            return "tests";
        }

        if (IsDocsPath(normalized))
        {
            return "docs";
        }

        return string.Empty;
    }

    private static bool IsDocsPath(string path)
    {
        var normalized = (path ?? string.Empty).Replace('\\', '/');
        return normalized.StartsWith("docs/", StringComparison.Ordinal)
               || normalized.EndsWith(".md", StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsTestPath(string path)
    {
        var normalized = (path ?? string.Empty).Replace('\\', '/');
        return normalized.Contains("/tests/", StringComparison.Ordinal)
               || normalized.Contains("-tests/", StringComparison.Ordinal)
               || normalized.EndsWith("Tests.cs", StringComparison.Ordinal)
               || normalized.EndsWith(".test.ts", StringComparison.Ordinal)
               || normalized.EndsWith(".spec.ts", StringComparison.Ordinal);
    }

    private static bool IsMaintenancePath(string path)
    {
        var normalized = (path ?? string.Empty).Replace('\\', '/');
        return normalized.EndsWith(".json", StringComparison.OrdinalIgnoreCase)
               || normalized.EndsWith(".yml", StringComparison.OrdinalIgnoreCase)
               || normalized.EndsWith(".yaml", StringComparison.OrdinalIgnoreCase)
               || normalized.Contains("/.github/", StringComparison.Ordinal);
    }
}
