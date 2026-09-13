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

        // 자체 주제가 있고 물음표가 있거나 문장이 어느 정도 길면, 어떤 언어로 쓰였든 독립 질문으로 본다.
        // 예전에는 영어 의문사(what/how/why/explain)만 봐서 한국어 독립 질문이 늘 "후속"으로 분류됐다.
        return HasQuestionMark(text)
               || text.Length >= 25
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

        var shared = left.Where(token => right.Any(other => TokensReferToSameThing(token, other))).ToArray();
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

    /// <summary>
    /// 두 토큰이 같은 대상을 가리키는지. 정확히 같거나, 한쪽이 다른 쪽의 접두사면 같은 것으로 본다.
    ///
    /// 한국어는 조사가 붙어 "파이썬"과 "파이썬으로"가 다른 토큰이 된다. 정확 일치만 보면 이어지는
    /// 한국어 질문에서 겹치는 주제를 늘 놓쳤다. 영어의 복수형("python"/"pythons")도 같은 문제다.
    /// 접두사 길이 하한을 둬서 "파일"·"cat" 같은 짧은 낱말이 아무 데나 붙는 것은 막는다.
    /// </summary>
    /// <summary>
    /// 그 자체로 "무엇에 대한 질문인지"를 담을 수 있는 토큰인지. 조사·의문사 같은 짧은 낱말은 제외한다.
    /// 한글·한자·가나는 한 글자의 정보량이 커서 3자, 알파벳은 4자부터 본다.
    ///
    /// 이 판정은 "새 대상이 들어왔는가"를 넉넉히 잡는 쪽으로 치우쳐 있다. 되묻기 우회(웹검색 생략)를
    /// 막는 용도라 과하게 잡으면 검색이 한 번 더 도는 정도지만, 놓치면 최신 정보를 못 가져온다.
    /// 반대로 "이전 맥락을 실을지"는 놓치면 대화가 끊기므로 이 판정에 기대지 않는다.
    /// </summary>
    public static bool IsSubstantialTopicToken(string token)
    {
        var normalized = (token ?? string.Empty).Trim();
        if (normalized.Length == 0 || IsContextStopToken(normalized))
        {
            return false;
        }

        if (normalized.Any(char.IsDigit)
            || normalized.Contains('-', StringComparison.Ordinal)
            || normalized.Contains('.', StringComparison.Ordinal)
            || normalized.Contains('/', StringComparison.Ordinal))
        {
            return true;
        }

        return normalized.Length >= (HasDenseScript(normalized) ? 3 : 4);
    }

    public static bool TokensReferToSameThing(string left, string right)
    {
        var a = (left ?? string.Empty).Trim();
        var b = (right ?? string.Empty).Trim();
        if (a.Length == 0 || b.Length == 0)
        {
            return false;
        }

        if (string.Equals(a, b, StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        var shorter = a.Length <= b.Length ? a : b;
        var longer = a.Length <= b.Length ? b : a;
        if (!longer.StartsWith(shorter, StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        // 음절 하나가 정보량이 큰 문자(한글·한자·가나)는 2자, 알파벳은 4자부터 인정한다.
        var minimumPrefix = HasDenseScript(shorter) ? 2 : 4;
        return shorter.Length >= minimumPrefix;
    }

    private static bool HasDenseScript(string token)
    {
        foreach (var character in token)
        {
            if (character >= '\uAC00' && character <= '\uD7A3')
            {
                return true;
            }

            if (character >= '\u3040' && character <= '\u30FF')
            {
                return true;
            }

            if (character >= '\u4E00' && character <= '\u9FFF')
            {
                return true;
            }
        }

        return false;
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
