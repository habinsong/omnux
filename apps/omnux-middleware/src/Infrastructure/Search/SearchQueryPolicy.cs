using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Omnux.Middleware;

internal sealed record SearchRequirementDecision(
    bool Required,
    string DecisionLabel,
    string SourceFocus,
    string SourceDomain
);

internal readonly record struct WebPreferenceHint(string Category, string Text);

internal static class SearchQueryPolicy
{
    private static readonly Regex RequestedCountRegex = new(
        @"(?<n>[1-9]\d?)\s*(?:items?|results?|news)\b|(?<n>[1-9]\d?)\s*\p{Lo}{1,3}(?!\p{L})",
        RegexOptions.Compiled | RegexOptions.IgnoreCase | RegexOptions.CultureInvariant
    );

    private static readonly Regex TopCountRegex = new(
        @"(?:^|[^\p{L}\d])top\s*(?<n>[1-9]\d?)\b",
        RegexOptions.Compiled | RegexOptions.IgnoreCase | RegexOptions.CultureInvariant
    );

    private static readonly Regex NewsTokenRegex = new(
        @"\b(?:news|headlines|breaking)\b",
        RegexOptions.Compiled | RegexOptions.IgnoreCase | RegexOptions.CultureInvariant
    );

    private static readonly Regex ExplicitSearchRegex = new(
        @"\b(?:web\s+search|search\s+for|look\s*up|lookup)\b",
        RegexOptions.Compiled | RegexOptions.IgnoreCase | RegexOptions.CultureInvariant
    );

    private static readonly Regex UrlRegex = new(
        @"https?://|www\.",
        RegexOptions.Compiled | RegexOptions.IgnoreCase | RegexOptions.CultureInvariant
    );

    private static readonly Regex SiteOperatorRegex = new(
        @"site\s*:\s*(?<domain>[A-Za-z0-9][A-Za-z0-9\.\-]*\.[A-Za-z]{2,})",
        RegexOptions.Compiled | RegexOptions.IgnoreCase | RegexOptions.CultureInvariant
    );

    private static readonly Regex IsoDateRegex = new(
        @"\b\d{4}-\d{2}-\d{2}\b",
        RegexOptions.Compiled | RegexOptions.CultureInvariant
    );

    private static readonly Regex SourceFocusRegex = new(
        @"\b(?<focus>[A-Za-z][A-Za-z0-9.\-]{1,40})\b",
        RegexOptions.Compiled | RegexOptions.CultureInvariant
    );

    private static readonly Regex LanguageDirectiveRegex = new(
        @"\b(?:reply|respond|answer|write)\s+in\s+[a-z]{2,20}\b|\b(?:english|korean)\b",
        RegexOptions.Compiled | RegexOptions.IgnoreCase | RegexOptions.CultureInvariant
    );

    private static readonly HashSet<string> SourceFocusStopwords = new(StringComparer.OrdinalIgnoreCase)
    {
        "today", "yesterday", "latest", "recent", "breaking", "top", "news", "headlines",
        "table", "search", "lookup", "web", "the", "and", "for", "from", "with", "this",
        "that", "you", "please", "items", "results", "official", "item", "result",
        "markdown", "list", "compare", "vs", "site", "http", "https", "www"
    };

    public static SearchRequirementDecision BuildFastRequirementDecision(string input)
    {
        var normalized = (input ?? string.Empty).Trim();
        if (normalized.Length == 0)
        {
            return new SearchRequirementDecision(false, "llm:false:empty_input", string.Empty, string.Empty);
        }

        if (LooksLikeClearlyNonWebQuestion(normalized))
        {
            return new SearchRequirementDecision(false, "heuristic:false:non_web", string.Empty, string.Empty);
        }

        var heuristicNeedWeb = LooksLikeExplicitWebLookupQuestion(normalized) || LooksLikeRealtimeQuestion(normalized);
        return new SearchRequirementDecision(
            heuristicNeedWeb,
            heuristicNeedWeb
                ? (LooksLikeExplicitWebLookupQuestion(normalized) ? "fast:true:explicit_web" : "fast:true:heuristic")
                : "fast:false:heuristic",
            ExtractSourceFocusHintFromInput(normalized),
            ExtractSourceDomainHintFromInput(normalized)
        );
    }

    public static bool TryParseSearchRequirementDecisionJson(
        string? rawText,
        out bool needWeb,
        out string sourceFocus,
        out string sourceDomain
    )
    {
        needWeb = false;
        sourceFocus = string.Empty;
        sourceDomain = string.Empty;
        var text = (rawText ?? string.Empty).Trim();
        if (text.Length == 0)
        {
            return false;
        }

        var start = text.IndexOf('{');
        var end = text.LastIndexOf('}');
        if (start < 0 || end <= start)
        {
            return false;
        }

        var json = text[start..(end + 1)];
        try
        {
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            if (root.ValueKind != JsonValueKind.Object)
            {
                return false;
            }

            var needToken = string.Empty;
            if (TryGetPropertyIgnoreCase(root, "needWeb", out var needWebElement))
            {
                needToken = needWebElement.ValueKind switch
                {
                    JsonValueKind.True => "yes",
                    JsonValueKind.False => "no",
                    JsonValueKind.String => needWebElement.GetString() ?? string.Empty,
                    _ => string.Empty
                };
            }

            var normalizedNeed = NormalizeWebSearchDecisionToken(needToken);
            if (normalizedNeed == "yes")
            {
                needWeb = true;
            }
            else if (normalizedNeed == "no")
            {
                needWeb = false;
            }
            else
            {
                return false;
            }

            if (TryGetPropertyIgnoreCase(root, "sourceFocus", out var sourceFocusElement)
                && sourceFocusElement.ValueKind == JsonValueKind.String)
            {
                sourceFocus = (sourceFocusElement.GetString() ?? string.Empty).Trim();
            }

            if (TryGetPropertyIgnoreCase(root, "sourceDomain", out var sourceDomainElement)
                && sourceDomainElement.ValueKind == JsonValueKind.String)
            {
                sourceDomain = NormalizeSourceDomainHint(sourceDomainElement.GetString());
            }

            return true;
        }
        catch
        {
            return false;
        }
    }

    public static string ExtractSourceFocusHintFromInput(string input)
    {
        var normalized = (input ?? string.Empty).Trim();
        if (normalized.Length == 0)
        {
            return string.Empty;
        }

        foreach (Match match in SourceFocusRegex.Matches(normalized))
        {
            var focus = (match.Groups["focus"].Value ?? string.Empty).Trim();
            if (focus.Length < 2 || SourceFocusStopwords.Contains(focus))
            {
                continue;
            }

            return focus;
        }

        return string.Empty;
    }

    public static string ExtractSourceDomainHintFromInput(string input)
    {
        var normalized = (input ?? string.Empty).Trim();
        if (normalized.Length == 0)
        {
            return string.Empty;
        }

        var explicitSite = SiteOperatorRegex.Match(normalized);
        return explicitSite.Success
            ? NormalizeSourceDomainHint(explicitSite.Groups["domain"].Value)
            : string.Empty;
    }

    public static string NormalizeSourceDomainHint(string? domain)
    {
        var normalized = (domain ?? string.Empty).Trim().ToLowerInvariant();
        if (normalized.StartsWith("http://", StringComparison.Ordinal))
        {
            normalized = normalized["http://".Length..];
        }
        else if (normalized.StartsWith("https://", StringComparison.Ordinal))
        {
            normalized = normalized["https://".Length..];
        }

        normalized = normalized.Trim('/');
        if (normalized.StartsWith("www.", StringComparison.Ordinal))
        {
            normalized = normalized[4..];
        }

        return Regex.IsMatch(normalized, @"^[a-z0-9][a-z0-9\.-]*\.[a-z]{2,}$", RegexOptions.CultureInvariant)
            ? normalized
            : string.Empty;
    }

    public static string BuildEffectiveSearchQuery(
        string query,
        SearchRequirementDecision decision,
        Func<string, string, string> resolveSourceDomain
    )
    {
        var baseQuery = (query ?? string.Empty).Trim();
        if (baseQuery.Length == 0)
        {
            return baseQuery;
        }

        var sourceFocus = (decision.SourceFocus ?? string.Empty).Trim();
        if (sourceFocus.Length == 0)
        {
            if (LooksLikeListOutputRequest(baseQuery) && HasNewsToken(baseQuery) && !HasHeadlineExpansion(baseQuery))
            {
                return $"{baseQuery} latest breaking headlines";
            }

            return baseQuery;
        }

        var builder = new StringBuilder(baseQuery);
        if (!baseQuery.Contains(sourceFocus, StringComparison.OrdinalIgnoreCase))
        {
            builder.Append(' ').Append(sourceFocus);
        }

        var sourceDomain = NormalizeSourceDomainHint(decision.SourceDomain);
        if (sourceDomain.Length == 0)
        {
            sourceDomain = resolveSourceDomain(baseQuery, sourceFocus);
        }
        if (sourceDomain.Length > 0
            && !baseQuery.Contains(sourceDomain, StringComparison.OrdinalIgnoreCase))
        {
            builder.Append(' ').Append(sourceDomain);
        }

        if (LooksLikeListOutputRequest(baseQuery) && !HasHeadlineExpansion(baseQuery))
        {
            builder.Append(' ').Append(sourceFocus).Append(" official top headlines");
        }

        return builder.ToString().Trim();
    }

    public static string NormalizeWebSearchDecisionToken(string? decisionText)
    {
        var normalized = (decisionText ?? string.Empty).Trim().ToUpperInvariant();
        if (normalized.Length == 0)
        {
            return string.Empty;
        }

        if (normalized.StartsWith("YES", StringComparison.Ordinal)
            || normalized == "Y")
        {
            return "yes";
        }

        if (normalized.StartsWith("NO", StringComparison.Ordinal)
            || normalized == "N")
        {
            return "no";
        }

        var compact = Regex.Replace(normalized, @"[^A-Z]", string.Empty);
        if (compact.Contains("YES", StringComparison.Ordinal))
        {
            return "yes";
        }

        if (compact.Contains("NO", StringComparison.Ordinal))
        {
            return "no";
        }

        return string.Empty;
    }

    public static bool LooksLikeRealtimeQuestion(string input)
    {
        var normalized = (input ?? string.Empty).Trim().ToLowerInvariant();
        if (normalized.Length == 0 || LooksLikeLocalDateTimeQuestion(normalized))
        {
            return false;
        }

        return HasNewsToken(normalized)
               || IsoDateRegex.IsMatch(normalized)
               || ContainsAny(normalized, "today", "yesterday", "latest", "recent", "current")
               || Regex.IsMatch(normalized, @"\b(?:update|release)s?\b", RegexOptions.CultureInvariant | RegexOptions.IgnoreCase);
    }

    public static bool LooksLikeExplicitWebLookupQuestion(string input)
    {
        var normalized = (input ?? string.Empty).Trim().ToLowerInvariant();
        if (normalized.Length == 0 || LooksLikeLocalDateTimeQuestion(normalized))
        {
            return false;
        }

        return SiteOperatorRegex.IsMatch(normalized)
               || UrlRegex.IsMatch(normalized)
               || ExplicitSearchRegex.IsMatch(normalized);
    }

    public static bool LooksLikeClearlyNonWebQuestion(string input)
    {
        var normalized = (input ?? string.Empty).Trim().ToLowerInvariant();
        if (normalized.Length == 0)
        {
            return false;
        }

        if (LooksLikeLocalDateTimeQuestion(normalized))
        {
            return true;
        }

        if (LooksLikeRealtimeQuestion(normalized)
            || LooksLikeExplicitWebLookupQuestion(normalized))
        {
            return false;
        }

        if (LooksLikeConversationalFollowUp(normalized))
        {
            return true;
        }

        if (ContainsAny(normalized, "translate", "rewrite", "rephrase"))
        {
            return true;
        }

        if (normalized.Contains("code", StringComparison.Ordinal)
            && ContainsAny(normalized, "explain", "review"))
        {
            return true;
        }

        if (LooksLikeCasualOrIdentityQuestion(normalized))
        {
            return true;
        }

        if (ContainsAny(normalized, "summary", "summarize"))
        {
            return normalized.Contains('\n')
                || normalized.Contains("```", StringComparison.Ordinal)
                || normalized.Contains("\"", StringComparison.Ordinal);
        }

        return false;
    }

    public static bool LooksLikeCasualOrIdentityQuestion(string input)
    {
        var normalized = (input ?? string.Empty).Trim().ToLowerInvariant();
        if (LooksLikeStandaloneFreshGreeting(normalized))
        {
            return true;
        }

        if (ContainsAny(normalized, "who are you", "what can you do", "your name"))
        {
            return true;
        }

        return !HasStructuredLookupSignal(normalized)
               && normalized.Length > 0
               && normalized.Length <= 8
               && !normalized.Any(char.IsDigit);
    }

    public static bool LooksLikeStandaloneFreshGreeting(string input)
    {
        var normalized = Regex.Replace((input ?? string.Empty).Trim().ToLowerInvariant(), @"\s+", " ");
        if (normalized.Length == 0 || normalized.Length > 16)
        {
            return false;
        }

        if (HasStructuredLookupSignal(normalized) || normalized.Any(char.IsDigit) || normalized.Contains(' '))
        {
            return false;
        }

        var compact = Regex.Replace(normalized, @"[\s\p{P}\p{S}]+", "");
        return compact.Length is >= 1 and <= 10;
    }

    public static bool LooksLikeLocalDateTimeQuestion(string input)
    {
        var normalized = Regex.Replace((input ?? string.Empty).Trim().ToLowerInvariant(), @"\s+", " ");
        if (normalized.Length == 0)
        {
            return false;
        }

        if (ContainsAny(
                normalized,
                "time complexity",
                "runtime complexity",
                "timeout",
                "execution time",
                "response time"))
        {
            return false;
        }

        return ContainsAny(
            normalized,
            "what time is it",
            "current time",
            "local time",
            "today's date",
            "today date",
            "current date",
            "what date is it",
            "what day is it",
            "current timezone",
            "local timezone",
            "time zone");
    }

    public static bool LooksLikeComparisonRequest(string input)
    {
        var normalized = (input ?? string.Empty).Trim().ToLowerInvariant();
        if (normalized.Length == 0)
        {
            return false;
        }

        return Regex.IsMatch(normalized, @"\bvs\b", RegexOptions.CultureInvariant | RegexOptions.IgnoreCase)
               || ContainsAny(normalized, "compare", "difference", "compared");
    }

    public static bool LooksLikeListOutputRequest(string input)
    {
        var normalized = (input ?? string.Empty).Trim().ToLowerInvariant();
        if (normalized.Length == 0)
        {
            return false;
        }

        return RequestedCountRegex.IsMatch(normalized)
            || TopCountRegex.IsMatch(normalized)
            || HasNewsToken(normalized)
            || Regex.IsMatch(normalized, @"\blist\b", RegexOptions.CultureInvariant | RegexOptions.IgnoreCase);
    }

    public static bool LooksLikeTableRenderRequest(string input)
    {
        var normalized = (input ?? string.Empty).Trim().ToLowerInvariant();
        if (normalized.Length == 0)
        {
            return false;
        }

        return ContainsAny(normalized, "table", "tabular");
    }

    public static IReadOnlyList<WebPreferenceHint> ExtractWebPreferenceHints(string text, bool fromMemoryNote)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return Array.Empty<WebPreferenceHint>();
        }

        var normalized = text
            .Replace("\r\n", "\n", StringComparison.Ordinal)
            .Replace("\r", "\n", StringComparison.Ordinal);
        var lines = normalized.Split('\n', StringSplitOptions.None);
        var hints = new List<WebPreferenceHint>(8);
        foreach (var raw in lines.Take(120))
        {
            var line = (raw ?? string.Empty).Trim();
            if (line.Length == 0)
            {
                continue;
            }

            line = Regex.Replace(line, @"^[-*•\d\.\)\s]+", string.Empty).Trim();
            if (line.Length < 4 || line.Length > 96)
            {
                continue;
            }

            if (fromMemoryNote
                && (line.StartsWith("created_utc", StringComparison.OrdinalIgnoreCase)
                    || line.StartsWith("mode", StringComparison.OrdinalIgnoreCase)
                    || line.StartsWith("conversation_id", StringComparison.OrdinalIgnoreCase)
                    || line.StartsWith("conversation_title", StringComparison.OrdinalIgnoreCase)
                    || line.StartsWith("provider", StringComparison.OrdinalIgnoreCase)
                    || line.StartsWith("model", StringComparison.OrdinalIgnoreCase)
                    || line.StartsWith("#", StringComparison.Ordinal)))
            {
                continue;
            }

            if (!LooksLikeWebPreferenceLine(line, fromMemoryNote))
            {
                continue;
            }

            var category = ClassifyWebPreferenceCategory(line);
            if (category.Length == 0)
            {
                continue;
            }

            hints.Add(new WebPreferenceHint(category, line));
            if (hints.Count >= 8)
            {
                break;
            }
        }

        return hints;
    }

    public static string NormalizeWebPreferenceKey(string text)
    {
        return Regex.Replace((text ?? string.Empty).Trim().ToLowerInvariant(), @"\s+", " ");
    }

    public static bool ShouldBlockWebMemoryHintByOverride(string input)
    {
        var lowered = (input ?? string.Empty).Trim().ToLowerInvariant();
        if (lowered.Length == 0)
        {
            return false;
        }

        return ContainsAny(
            lowered,
            "instead",
            "except",
            "ignore",
            "override",
            "this time",
            " not ");
    }

    public static bool LooksLikeWebFormatDirective(string input)
    {
        var lowered = (input ?? string.Empty).Trim().ToLowerInvariant();
        if (lowered.Length == 0)
        {
            return false;
        }

        return ContainsAny(
            lowered,
            "table",
            "tabular",
            "markdown",
            "bullet",
            "numbered",
            "list format");
    }

    public static bool LooksLikeWebToneDirective(string input)
    {
        var lowered = (input ?? string.Empty).Trim().ToLowerInvariant();
        if (lowered.Length == 0)
        {
            return false;
        }

        return ContainsAny(lowered, "concise", "brief", "detailed", "tone", "formal", "casual");
    }

    public static bool LooksLikeWebLanguageDirective(string input)
    {
        var lowered = (input ?? string.Empty).Trim().ToLowerInvariant();
        if (lowered.Length == 0)
        {
            return false;
        }

        return LanguageDirectiveRegex.IsMatch(lowered);
    }

    public static int ResolveWebDefaultCount(string input, int newsDefaultCount, int listDefaultCount)
    {
        var normalized = (input ?? string.Empty).Trim().ToLowerInvariant();
        return HasNewsToken(normalized)
            ? Math.Clamp(newsDefaultCount, 1, 20)
            : Math.Clamp(listDefaultCount, 1, 20);
    }

    public static double ResolveForcedMemoryMinScore(string input)
    {
        var normalized = (input ?? string.Empty).Trim().ToLowerInvariant();
        if (normalized.Length == 0)
        {
            return 0.45d;
        }

        if (normalized.Length < 10 && !normalized.Contains('.'))
        {
            return 0.65d;
        }

        if (LooksLikeRealtimeQuestion(normalized))
        {
            return 0.3d;
        }

        if (ContainsAny(normalized, "compare", "difference", "summary"))
        {
            return 0.5d;
        }

        return 0.45d;
    }

    public static string ResolveSearchFreshnessForQuery(string input)
    {
        var normalized = (input ?? string.Empty).Trim().ToLowerInvariant();
        if (IsoDateRegex.IsMatch(normalized)
            || ContainsAny(normalized, "today", "yesterday", "breaking"))
        {
            return "day";
        }

        if (ContainsAny(normalized, "month", "monthly"))
        {
            return "month";
        }

        if (ContainsAny(normalized, "year", "yearly"))
        {
            return "year";
        }

        return "week";
    }

    public static int ResolveRequestedResultCountFromQuery(string input)
    {
        var normalized = (input ?? string.Empty).Trim().ToLowerInvariant();
        var defaultCount = HasNewsToken(normalized) ? 10 : 5;
        if (normalized.Length == 0)
        {
            return defaultCount;
        }

        var direct = RequestedCountRegex.Match(normalized);
        if (direct.Success
            && int.TryParse(direct.Groups["n"].Value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var directParsed))
        {
            return Math.Clamp(directParsed, 1, 10);
        }

        var top = TopCountRegex.Match(normalized);
        if (top.Success
            && int.TryParse(top.Groups["n"].Value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var topParsed))
        {
            return Math.Clamp(topParsed, 1, 10);
        }

        return defaultCount;
    }

    public static bool HasExplicitRequestedCountInQuery(string input)
    {
        var normalized = (input ?? string.Empty).Trim().ToLowerInvariant();
        if (normalized.Length == 0)
        {
            return false;
        }

        return RequestedCountRegex.IsMatch(normalized) || TopCountRegex.IsMatch(normalized);
    }

    private static bool LooksLikeConversationalFollowUp(string input)
    {
        var normalized = (input ?? string.Empty).Trim().ToLowerInvariant();
        if (normalized.Length == 0 || normalized.Length > 120)
        {
            return false;
        }

        if (ContainsAny(
                normalized,
                "what do you think",
                "would it work",
                "recommend",
                "compare"))
        {
            return true;
        }

        return normalized.Length <= 60
            && Regex.IsMatch(normalized, @"\b(?:this|that)\b", RegexOptions.CultureInvariant | RegexOptions.IgnoreCase);
    }

    private static bool LooksLikeWebPreferenceLine(string line, bool fromMemoryNote)
    {
        var lowered = (line ?? string.Empty).Trim().ToLowerInvariant();
        if (lowered.Length == 0 || UrlRegex.IsMatch(lowered))
        {
            return false;
        }

        if (!fromMemoryNote
            && !ContainsAny(lowered, "always", "prefer", "remember", "default"))
        {
            return false;
        }

        return ClassifyWebPreferenceCategory(lowered).Length > 0;
    }

    private static string ClassifyWebPreferenceCategory(string line)
    {
        var lowered = (line ?? string.Empty).Trim().ToLowerInvariant();
        if (lowered.Length == 0)
        {
            return string.Empty;
        }

        if (ContainsAny(lowered, "source", "site:")
            || Regex.IsMatch(lowered, @"\b(?:cnn|reuters|bbc)\b", RegexOptions.CultureInvariant | RegexOptions.IgnoreCase))
        {
            return "source";
        }

        if (LooksLikeWebFormatDirective(lowered))
        {
            return "format";
        }

        if (LooksLikeWebToneDirective(lowered))
        {
            return "tone";
        }

        if (LooksLikeWebLanguageDirective(lowered))
        {
            return "language";
        }

        if (HasExplicitRequestedCountInQuery(lowered) && (HasNewsToken(lowered) || LooksLikeListOutputRequest(lowered)))
        {
            return "count";
        }

        return string.Empty;
    }

    private static bool HasNewsToken(string text) => NewsTokenRegex.IsMatch(text ?? string.Empty);

    private static bool HasHeadlineExpansion(string text)
    {
        var lowered = (text ?? string.Empty).ToLowerInvariant();
        return ContainsAny(lowered, "latest", "breaking", "headlines", "official", "top stories");
    }

    private static bool HasStructuredLookupSignal(string text)
    {
        var normalized = text ?? string.Empty;
        return UrlRegex.IsMatch(normalized)
               || SiteOperatorRegex.IsMatch(normalized)
               || ExplicitSearchRegex.IsMatch(normalized)
               || HasNewsToken(normalized)
               || normalized.Contains('/')
               || IsoDateRegex.IsMatch(normalized);
    }

    private static bool TryGetPropertyIgnoreCase(JsonElement element, string propertyName, out JsonElement value)
    {
        if (element.ValueKind != JsonValueKind.Object)
        {
            value = default;
            return false;
        }

        foreach (var property in element.EnumerateObject())
        {
            if (string.Equals(property.Name, propertyName, StringComparison.OrdinalIgnoreCase))
            {
                value = property.Value;
                return true;
            }
        }

        value = default;
        return false;
    }

    private static bool ContainsAny(string text, params string[] patterns)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return false;
        }

        foreach (var pattern in patterns)
        {
            if (!string.IsNullOrWhiteSpace(pattern)
                && text.Contains(pattern, StringComparison.Ordinal))
            {
                return true;
            }
        }

        return false;
    }
}
