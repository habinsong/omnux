using System.Text.RegularExpressions;

namespace Omnux.Middleware;

internal static class ConversationContextPolicy
{
    public static bool ShouldUsePriorConversationContext(string input, out bool isAmbiguous)
    {
        isAmbiguous = false;
        var normalized = NormalizeInput(input);
        if (normalized.Length == 0)
        {
            return false;
        }

        if (SearchQueryPolicy.LooksLikeCasualOrIdentityQuestion(normalized))
        {
            return false;
        }

        if (HasContinuationCue(normalized) || LooksLikeStrongFollowupQuestion(normalized))
        {
            return true;
        }

        if (LooksLikeJudgmentCue(normalized))
        {
            isAmbiguous = true;
            return true;
        }

        if (normalized.Length <= 60)
        {
            if (HasAnaphoricShape(normalized))
            {
                return true;
            }

            if (Regex.IsMatch(normalized, @"\d") && normalized.Length <= 30)
            {
                return true;
            }
        }

        return false;
    }

    public static bool LooksLikeStrongFollowupQuestion(string input)
    {
        var text = NormalizeInput(input);
        if (text.Length == 0)
        {
            return false;
        }

        if (text.Length <= 40 && HasQuestionMark(text))
        {
            return true;
        }

        return text.Length <= 48
               && HasContinuationCue(text)
               && (HasQuestionMark(text) || ContainsAny(text, "why", "how", "example", "detail"));
    }

    public static bool LooksLikeExplicitStandaloneQuestion(string input)
    {
        var text = NormalizeInput(input);
        if (text.Length == 0)
        {
            return false;
        }

        if (LooksLikeStrongFollowupQuestion(text) || HasContinuationCue(text))
        {
            return false;
        }

        var hasStandaloneTopic = ExtractContextTokens(text).Any(token =>
            token.Length >= 4
            || token.Any(char.IsDigit)
            || token.Contains('-', StringComparison.Ordinal)
            || token.Contains('/', StringComparison.Ordinal)
            || token.Contains('.', StringComparison.Ordinal));
        if (!hasStandaloneTopic)
        {
            return false;
        }

        return HasQuestionMark(text)
               || ContainsAny(text, "what", "how", "why", "explain");
    }

    public static bool LooksLikeAnswerVerificationFollowUp(string input)
    {
        var text = NormalizeInput(input);
        if (text.Length == 0 || text.Length > 40)
        {
            return false;
        }

        if (ContainsAny(text, "search", "look up", "lookup"))
        {
            return false;
        }

        return HasQuestionMark(text)
               && ExtractContextTokens(text).Count <= 4;
    }

    public static bool HasMeaningfulTokenOverlap(
        IReadOnlySet<string> left,
        IReadOnlySet<string> right,
        int minimumShared = 2
    )
    {
        if (left.Count == 0 || right.Count == 0)
        {
            return false;
        }

        var shared = left.Where(right.Contains).ToArray();
        if (shared.Length == 0)
        {
            return false;
        }

        if (shared.Any(token => token.Length >= 5 || token.Any(char.IsDigit) || token.Contains('-', StringComparison.Ordinal)))
        {
            return true;
        }

        return shared.Length >= minimumShared;
    }

    public static IReadOnlySet<string> ExtractContextTokens(string text)
    {
        var tokens = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (Match match in Regex.Matches((text ?? string.Empty).ToLowerInvariant(), @"[\p{L}\p{N}][\p{L}\p{N}._/-]*"))
        {
            var token = NormalizeContextToken(match.Value);
            if (IsContextStopToken(token))
            {
                continue;
            }

            tokens.Add(token);
        }

        return tokens;
    }

    public static string NormalizeContextToken(string token)
    {
        return (token ?? string.Empty)
            .Trim()
            .Trim('.', ',', ':', ';', '!', '?', '\'', '"', '`', '(', ')', '[', ']', '{', '}');
    }

    public static bool IsContextStopToken(string token)
    {
        if (string.IsNullOrWhiteSpace(token) || token.Length <= 1)
        {
            return true;
        }

        return token is
            "the" or "a" or "an" or "and" or "or" or "to" or "of" or "for" or "with" or "in" or
            "on" or "about" or "what" or "why" or "how" or "is" or "are" or "it" or "this" or "that";
    }

    private static bool HasContinuationCue(string text)
    {
        return ContainsAny(
            text,
            "previous",
            "continue",
            "again",
            "instead",
            "look it up",
            "search it",
            "that answer",
            "this answer"
        );
    }

    private static bool LooksLikeJudgmentCue(string text)
    {
        if (ContainsAny(text, "what do you think", "would it work", "recommend", "compare"))
        {
            return true;
        }

        return Regex.Matches(text, @"(?<![a-z0-9])[a-z]{1,4}\d[a-z0-9]{0,4}(?![a-z0-9])").Count >= 2;
    }

    private static bool HasAnaphoricShape(string text)
    {
        return ContainsAny(text, "this ", "that ", " those ", " it ", "them");
    }

    private static bool HasQuestionMark(string text)
    {
        return text.Contains('?', StringComparison.Ordinal) || text.Contains('？', StringComparison.Ordinal);
    }

    private static string NormalizeInput(string input)
    {
        return Regex.Replace((input ?? string.Empty).Trim().ToLowerInvariant(), @"\s+", " ");
    }

    private static bool ContainsAny(string text, params string[] patterns)
    {
        return patterns.Any(pattern => text.Contains(pattern, StringComparison.OrdinalIgnoreCase));
    }
}
