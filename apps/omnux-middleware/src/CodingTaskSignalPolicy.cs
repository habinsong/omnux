using System.Net;
using System.Text.RegularExpressions;

namespace Omnux.Middleware;

/// <summary>
/// Coding-task kind from language-agnostic signals: paths, extensions, quoted
/// literals, and canonical tokens. No translated synonym chains.
/// </summary>
internal static class CodingTaskSignalPolicy
{
    private static readonly Regex BrowserTokenRegex = new(
        @"\b(?:react|vite|canvas|browser|frontend|html|css)\b",
        RegexOptions.Compiled | RegexOptions.IgnoreCase | RegexOptions.CultureInvariant
    );

    private static readonly Regex CliTokenRegex = new(
        @"\b(?:cli|command[ -]?line|argv|stdin|argument)\b",
        RegexOptions.Compiled | RegexOptions.IgnoreCase | RegexOptions.CultureInvariant
    );

    private static readonly Regex RunTokenRegex = new(
        @"\b(?:run|execute|stdout|print|echo|console\.log)\b",
        RegexOptions.Compiled | RegexOptions.IgnoreCase | RegexOptions.CultureInvariant
    );

    private static readonly Regex BrowserPathRegex = new(
        @"\.(?:html?|css|jsx|tsx|vue|svelte)\b",
        RegexOptions.Compiled | RegexOptions.IgnoreCase | RegexOptions.CultureInvariant
    );

    public static bool LooksLikeBrowserApp(string? objective)
    {
        var text = Latest(objective);
        if (string.IsNullOrWhiteSpace(text))
        {
            return false;
        }

        return BrowserPathRegex.IsMatch(text) || BrowserTokenRegex.IsMatch(text);
    }

    public static bool LooksLikeCli(string? objective)
    {
        var text = Latest(objective);
        return !string.IsNullOrWhiteSpace(text) && CliTokenRegex.IsMatch(text);
    }

    public static bool LooksLikeProgramRunRequest(string? objective)
    {
        var text = Latest(objective);
        if (string.IsNullOrWhiteSpace(text))
        {
            return false;
        }

        if (CodingExpectedOutputPolicy.ExtractExpectedConsoleOutputLines(text).Count > 0)
        {
            return true;
        }

        return RunTokenRegex.IsMatch(text);
    }

    public static bool LooksLikeCsharpProjectRequest(string? objective)
    {
        var text = Latest(objective);
        if (string.IsNullOrWhiteSpace(text))
        {
            return false;
        }

        return text.Contains(".csproj", StringComparison.OrdinalIgnoreCase)
               || Regex.IsMatch(text, @"\b(?:nuget|project|asp\.net)\b", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
    }

    public static bool LooksLikeUiHeavy(string? objective)
    {
        var text = Latest(objective);
        if (string.IsNullOrWhiteSpace(text))
        {
            return false;
        }

        return LooksLikeBrowserApp(text)
               || Regex.IsMatch(text, @"\b(?:ui|ux|layout|component)\b", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
    }

    public static bool LooksLikeReviewHeavy(string? objective)
    {
        var text = Latest(objective);
        if (string.IsNullOrWhiteSpace(text))
        {
            return false;
        }

        return Regex.IsMatch(
            text,
            @"\b(?:bug|error|fix|debug|test|review|regression)\b",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant
        );
    }

    private static string Latest(string? objective)
    {
        return CodingLanguagePolicy.ExtractLatestCodingRequestText(WebUtility.HtmlDecode(objective ?? string.Empty));
    }
}
