using System.Text.RegularExpressions;

namespace Omnux.Middleware;

internal static class CodingExpectedOutputPolicy
{
    private static readonly Regex OrderedExpectedOutputLineRegex = new(
        @"(?<label>first\s+line|second\s+line|line\s*[12]|[12](?:st|nd)?\s*line)[^'""`\r\n]{0,64}['""`](?<value>[^'""`\r\n]{1,200})['""`]",
        RegexOptions.Compiled | RegexOptions.IgnoreCase | RegexOptions.CultureInvariant
    );

    public static IReadOnlyList<string> ExtractExpectedConsoleOutputLines(string objective)
    {
        var text = CodingLanguagePolicy.ExtractLatestCodingRequestText(objective);
        if (string.IsNullOrWhiteSpace(text))
        {
            return Array.Empty<string>();
        }

        var lineOrdered = new SortedDictionary<int, string>();
        var appearance = new List<string>();
        foreach (var rawLine in text.Replace("\r\n", "\n", StringComparison.Ordinal).Replace('\r', '\n').Split('\n'))
        {
            var line = rawLine.Trim();
            if (string.IsNullOrWhiteSpace(line))
            {
                continue;
            }

            var quoted = CodingFallbackPolicy.ExtractQuotedTextLiterals(line);
            if (quoted.Length == 0)
            {
                continue;
            }

            appearance.Add(quoted[0]);
            var lowered = line.ToLowerInvariant();
            if (!lineOrdered.ContainsKey(0) && IsFirstLineCue(lowered))
            {
                lineOrdered[0] = quoted[0];
            }

            if (!lineOrdered.ContainsKey(1) && IsSecondLineCue(lowered))
            {
                lineOrdered[1] = quoted[^1];
            }
        }

        if (lineOrdered.Count > 0)
        {
            return lineOrdered
                .OrderBy(pair => pair.Key)
                .Select(pair => pair.Value)
                .ToArray();
        }

        var ordered = new SortedDictionary<int, string>();
        foreach (Match match in OrderedExpectedOutputLineRegex.Matches(text))
        {
            var index = ResolveExpectedOutputLineIndex(match.Groups["label"].Value);
            var value = match.Groups["value"].Value.Trim();
            if (index < 0 || string.IsNullOrWhiteSpace(value) || ordered.ContainsKey(index))
            {
                continue;
            }

            ordered[index] = value;
        }

        if (ordered.Count > 0)
        {
            return ordered
                .OrderBy(pair => pair.Key)
                .Select(pair => pair.Value)
                .ToArray();
        }

        if (appearance.Count >= 2)
        {
            return appearance.ToArray();
        }

        foreach (var rawLine in text.Replace("\r\n", "\n", StringComparison.Ordinal).Replace('\r', '\n').Split('\n'))
        {
            var line = rawLine.Trim();
            if (string.IsNullOrWhiteSpace(line))
            {
                continue;
            }

            if (!HasStdoutCue(line.ToLowerInvariant()))
            {
                continue;
            }

            var quoted = CodingFallbackPolicy.ExtractQuotedTextLiterals(line);
            if (quoted.Length > 0)
            {
                return quoted;
            }
        }

        return Array.Empty<string>();
    }

    public static IReadOnlyList<string> ExtractVisibleTextRequirementLiterals(string objective)
    {
        var text = CodingLanguagePolicy.ExtractLatestCodingRequestText(objective);
        if (string.IsNullOrWhiteSpace(text))
        {
            return Array.Empty<string>();
        }

        foreach (var rawLine in text.Replace("\r\n", "\n", StringComparison.Ordinal).Replace('\r', '\n').Split('\n'))
        {
            var line = rawLine.Trim();
            if (string.IsNullOrWhiteSpace(line))
            {
                continue;
            }

            var lowered = line.ToLowerInvariant();
            if (!lowered.Contains("visible text", StringComparison.Ordinal)
                && !lowered.Contains("innertext", StringComparison.Ordinal)
                && !lowered.Contains("innerhtml", StringComparison.Ordinal))
            {
                continue;
            }

            var quoted = CodingFallbackPolicy.ExtractQuotedTextLiterals(line);
            if (quoted.Length > 0)
            {
                return quoted;
            }
        }

        return Array.Empty<string>();
    }

    public static int ResolveExpectedOutputLineIndex(string label)
    {
        var normalized = Regex.Replace((label ?? string.Empty).Trim().ToLowerInvariant(), @"\s+", " ");
        if (normalized is "first line" or "1st line" or "1 line" or "line 1" or "line1")
        {
            return 0;
        }

        if (normalized is "second line" or "2nd line" or "2 line" or "line 2" or "line2")
        {
            return 1;
        }

        return -1;
    }

    private static bool IsFirstLineCue(string lowered)
    {
        return lowered.Contains("first line", StringComparison.Ordinal)
               || Regex.IsMatch(lowered, @"(?<![0-9])(?:line\s*1|1(?:st)?\s*line)(?![0-9])");
    }

    private static bool IsSecondLineCue(string lowered)
    {
        return lowered.Contains("second line", StringComparison.Ordinal)
               || Regex.IsMatch(lowered, @"(?<![0-9])(?:line\s*2|2(?:nd)?\s*line)(?![0-9])");
    }

    public static bool LooksLikeStdoutVerificationRequest(string objective)
    {
        if (ExtractExpectedConsoleOutputLines(objective).Count > 0)
        {
            return true;
        }

        var text = CodingLanguagePolicy.ExtractLatestCodingRequestText(objective ?? string.Empty);
        if (string.IsNullOrWhiteSpace(text))
        {
            return false;
        }

        var lowered = text.ToLowerInvariant();
        return HasStdoutCue(lowered)
               || Regex.IsMatch(lowered, @"\b(?:run|execute)\b", RegexOptions.CultureInvariant);
    }

    private static bool HasStdoutCue(string lowered)
    {
        return lowered.Contains("stdout", StringComparison.Ordinal)
               || lowered.Contains("print", StringComparison.Ordinal)
               || lowered.Contains("echo", StringComparison.Ordinal)
               || lowered.Contains("console.log", StringComparison.Ordinal);
    }
}
