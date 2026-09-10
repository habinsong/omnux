using System.Net;
using System.Text.RegularExpressions;

namespace Omnux.Middleware;

internal static class CodingLanguagePolicy
{
    public static string NormalizeLanguageForCode(string? language)
    {
        var value = (language ?? string.Empty).Trim().ToLowerInvariant();
        return value switch
        {
            "py" or "python3" => "python",
            "js" or "node" => "javascript",
            "ts" or "tsx" => "typescript",
            "react" or "vite" or "react-vite" or "react_vite" => "react-vite",
            "golang" => "go",
            "rs" or "cargo" => "rust",
            "rb" => "ruby",
            "sh" or "shell" => "bash",
            "c++" or "cc" => "cpp",
            "cs" or "c#" => "csharp",
            "kt" => "kotlin",
            "htm" => "html",
            "" or "auto" => "auto",
            _ => value
        };
    }

    public static string NormalizeCodingLanguageHintPreservingAuto(string? languageHint)
    {
        var raw = (languageHint ?? string.Empty).Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(raw) || raw == "auto")
        {
            return "auto";
        }

        return NormalizeLanguageForCode(raw);
    }

    public static string ResolveExplicitObjectiveLanguage(string? objective)
    {
        var text = ExtractLatestCodingRequestText(WebUtility.HtmlDecode(objective ?? string.Empty));
        if (string.IsNullOrWhiteSpace(text))
        {
            return string.Empty;
        }

        var fromPath = LanguageFromRequestedPaths(text);
        if (!string.IsNullOrWhiteSpace(fromPath) && fromPath != "auto")
        {
            return fromPath;
        }

        return MatchLanguageToken(text);
    }

    public static string ResolveInitialCodingLanguage(string? languageHint, string objective)
    {
        var rawHint = (languageHint ?? string.Empty).Trim().ToLowerInvariant();
        if (!string.IsNullOrWhiteSpace(rawHint) && rawHint != "auto")
        {
            return NormalizeLanguageForCode(rawHint);
        }

        var explicitLanguage = ResolveExplicitObjectiveLanguage(objective);
        return string.IsNullOrWhiteSpace(explicitLanguage) ? "auto" : explicitLanguage;
    }

    public static string GuessLanguageFromPath(string path, string fallback)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            return fallback;
        }

        var ext = Path.GetExtension(path).ToLowerInvariant();
        return ext switch
        {
            ".py" => "python",
            ".js" or ".mjs" => "javascript",
            ".jsx" => "javascript",
            ".ts" or ".tsx" => "typescript",
            ".c" => "c",
            ".cpp" or ".cc" or ".cxx" => "cpp",
            ".cs" => "csharp",
            ".java" => "java",
            ".kt" or ".kts" => "kotlin",
            ".go" => "go",
            ".rs" => "rust",
            ".php" => "php",
            ".rb" => "ruby",
            ".swift" => "swift",
            ".html" or ".htm" => "html",
            ".vue" or ".svelte" => "html",
            ".css" => "css",
            ".sh" => "bash",
            _ => fallback
        };
    }

    public static string ResolveFinalResultLanguage(
        string currentLanguage,
        string languageHint,
        string objective,
        IReadOnlyCollection<string> changedFiles
    )
    {
        var normalizedCurrent = NormalizeLanguageForCode(currentLanguage);
        var normalizedInitial = ResolveInitialCodingLanguage(languageHint, objective);
        if (normalizedInitial == "html")
        {
            return "html";
        }

        if (normalizedCurrent is "javascript" or "css")
        {
            var hasHtmlFile = (changedFiles ?? Array.Empty<string>())
                .Where(path => !string.IsNullOrWhiteSpace(path))
                .Any(path =>
                {
                    var extension = Path.GetExtension(path).ToLowerInvariant();
                    return extension is ".html" or ".htm";
                });
            if (hasHtmlFile)
            {
                return "html";
            }
        }

        return normalizedCurrent;
    }

    public static string ExtractLatestCodingRequestText(string objective)
    {
        var text = (objective ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(text))
        {
            return string.Empty;
        }

        var lastNewRequestMarker = text.LastIndexOf("[새 요청]", StringComparison.Ordinal);
        if (lastNewRequestMarker >= 0)
        {
            var requestText = text[(lastNewRequestMarker + "[새 요청]".Length)..].Trim();
            if (string.IsNullOrWhiteSpace(requestText))
            {
                return string.Empty;
            }

            var lines = requestText
                .Replace("\r\n", "\n", StringComparison.Ordinal)
                .Replace('\r', '\n')
                .Split('\n', StringSplitOptions.None);
            var collected = new List<string>(lines.Length);
            foreach (var rawLine in lines)
            {
                var line = rawLine ?? string.Empty;
                var trimmed = line.Trim();
                if (collected.Count > 0
                    && trimmed.Length > 0
                    && Regex.IsMatch(trimmed, @"^\[[^\]\r\n]{1,80}\]$", RegexOptions.CultureInvariant))
                {
                    break;
                }

                collected.Add(line);
            }

            return string.Join('\n', collected).Trim();
        }

        return text;
    }

    private static readonly Regex RequestedPathRegex = new(
        @"(?:(?:[A-Za-z]:)?[\\/])?(?:[\w.-]+[\\/])*(?:[\w.-]+\.)+(?:json|html|java|tsx|jsx|mjs|cjs|cpp|cxx|hpp|htm|css|txt|md|py|ts|js|cs|kt|kts|sh|cc|hh|h|c|go|rs|php|rb|swift|yml|yaml|toml|xml|csproj|sln|gradle|svelte|vue)(?![A-Za-z0-9._-])",
        RegexOptions.Compiled | RegexOptions.IgnoreCase | RegexOptions.CultureInvariant
    );

    private static readonly (Regex Pattern, string Language)[] LanguageTokenPatterns =
    {
        (Token("python3"), "python"),
        (Token("python"), "python"),
        (Token("javascript"), "javascript"),
        (Token(@"node\.js"), "javascript"),
        (Token("nodejs"), "javascript"),
        (Token("typescript"), "typescript"),
        (Token("react-vite"), "react-vite"),
        (Token("react"), "react-vite"),
        (Token("vite"), "react-vite"),
        (Token("csharp"), "csharp"),
        (Token(@"asp\.net"), "csharp"),
        (Token("dotnet"), "csharp"),
        (Token("c#"), "csharp"),
        (Token("kotlin"), "kotlin"),
        (Token("golang"), "go"),
        (Token("rust"), "rust"),
        (Token("cargo"), "rust"),
        (Token("laravel"), "php"),
        (Token("php"), "php"),
        (Token("rails"), "ruby"),
        (Token("ruby"), "ruby"),
        (Token("swift"), "swift"),
        (Token("spring"), "java"),
        (Token("java(?!script)"), "java"),
        (Token("html"), "html"),
        (Token("css"), "css"),
        (Token("bash"), "bash"),
        (Token("shell"), "bash"),
        (Token("clang"), "c"),
        (Token("gcc"), "c"),
        (Token(@"c\+\+"), "cpp"),
        (Token("cpp"), "cpp"),
        (Token(@"(?<![a-z])go(?![a-z])"), "go"),
        (Token(@"(?<![a-z])c(?![a-z+#])"), "c")
    };

    private static Regex Token(string body)
    {
        return new Regex(
            $@"(?<![a-z0-9])(?:{body})(?![a-z0-9])",
            RegexOptions.Compiled | RegexOptions.IgnoreCase | RegexOptions.CultureInvariant
        );
    }

    private static string LanguageFromRequestedPaths(string text)
    {
        foreach (Match match in RequestedPathRegex.Matches(text ?? string.Empty))
        {
            var language = GuessLanguageFromPath(match.Value, "auto");
            if (!string.IsNullOrWhiteSpace(language) && language != "auto")
            {
                return language;
            }
        }

        return string.Empty;
    }

    private static string MatchLanguageToken(string text)
    {
        var lowered = (text ?? string.Empty).ToLowerInvariant();
        foreach (var (pattern, language) in LanguageTokenPatterns)
        {
            if (pattern.IsMatch(lowered))
            {
                return language;
            }
        }

        return string.Empty;
    }
}
