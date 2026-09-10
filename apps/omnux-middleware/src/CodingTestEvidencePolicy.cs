using System.Text.RegularExpressions;

namespace Omnux.Middleware;

internal static class CodingTestEvidencePolicy
{
    public static bool ShouldRequireTestEvidence(
        string objective,
        string language,
        IReadOnlyCollection<string>? changedFiles,
        bool preferMultiFile
    )
    {
        var text = CodingLanguagePolicy.ExtractLatestCodingRequestText(objective ?? string.Empty).ToLowerInvariant();
        var fileCount = changedFiles?.Count ?? 0;
        if (fileCount == 0)
        {
            return false;
        }

        if (!preferMultiFile && fileCount <= 1 && CodingFallbackPolicy.HasSingleFileIntent(text))
        {
            return false;
        }

        return preferMultiFile
            || fileCount > 1
            || ContainsAny(
                text,
                "project",
                "app",
                "application",
                "service",
                "server",
                "backend",
                "api",
                "web",
                "frontend",
                "dashboard",
                "library",
                "package",
                "module",
                "cli",
                "command line",
                "game",
                "test",
                "unit test",
                "pytest",
                "jest",
                "playwright"
            );
    }

    public static bool HasTestEvidence(
        IEnumerable<string>? changedFiles,
        string? executionCommand
    )
    {
        if (changedFiles != null)
        {
            foreach (var path in changedFiles)
            {
                if (IsTestLikePath(path))
                {
                    return true;
                }
            }
        }

        var command = (executionCommand ?? string.Empty).ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(command))
        {
            return false;
        }

        return ContainsAny(
            command,
            "dotnet test",
            "pytest",
            "python -m pytest",
            "python3 -m pytest",
            "go test",
            "cargo test",
            "gradle test",
            "./gradlew test",
            "mvn test",
            "phpunit",
            "bundle exec rspec",
            "swift test",
            "npm test",
            "npm run test",
            "pnpm test",
            "pnpm run test",
            "yarn test",
            "yarn run test",
            "bun test",
            "vitest",
            "jest",
            "playwright",
            "smoke"
        );
    }

    private static bool IsTestLikePath(string? path)
    {
        var normalized = (path ?? string.Empty).Replace('\\', '/').ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return false;
        }

        if (normalized.Contains("/tests/") || normalized.Contains("/__tests__/"))
        {
            return true;
        }

        var fileName = Path.GetFileNameWithoutExtension(normalized);
        return fileName.StartsWith("test_", StringComparison.OrdinalIgnoreCase)
            || fileName.EndsWith("_test", StringComparison.OrdinalIgnoreCase)
            || fileName.Contains(".test", StringComparison.OrdinalIgnoreCase)
            || fileName.Contains(".spec", StringComparison.OrdinalIgnoreCase)
            || fileName.Equals("test", StringComparison.OrdinalIgnoreCase)
            || fileName.Equals("spec", StringComparison.OrdinalIgnoreCase);
    }

    private static bool ContainsAny(string text, params string[] patterns)
    {
        return patterns.Any(pattern => text.Contains(pattern, StringComparison.OrdinalIgnoreCase));
    }
}
