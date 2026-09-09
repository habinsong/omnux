namespace Omnux.Middleware;

/// <summary>
/// 훅 매칭 규칙(순수 함수). 부분 문자열 일치를 쓰지 않는다.
/// 도구 패턴은 `a|b` 목록과 `*` 와일드카드만 지원하며 전체 이름과 대조한다.
/// 경로는 `*`(구분자 제외), `**`(구분자 포함), `?` 를 지원하는 glob 이다.
/// </summary>
internal static class HookMatchPolicy
{
    /// <summary>패턴 길이 상한. 사용자 입력이 과도한 역추적을 만들지 않도록 제한한다.</summary>
    public const int MaxPatternChars = 512;

    public static bool Matches(HookDefinition definition, HookEventInput input)
    {
        if (!definition.Enabled)
        {
            return false;
        }

        if (!string.Equals(
                HookEventCatalog.Normalize(definition.Event),
                HookEventCatalog.Normalize(input.Event),
                StringComparison.Ordinal
            ))
        {
            return false;
        }

        if (!MatchesTool(definition.Matcher.ToolPattern, input.ToolName))
        {
            return false;
        }

        return MatchesPath(definition.Matcher.PathGlob, input.FilePath);
    }

    /// <summary>도구 패턴 대조. 패턴이 비면 모든 도구에 해당한다.</summary>
    public static bool MatchesTool(string? pattern, string? toolName)
    {
        var normalizedPattern = (pattern ?? string.Empty).Trim();
        if (normalizedPattern.Length == 0)
        {
            return true;
        }

        if (normalizedPattern.Length > MaxPatternChars)
        {
            return false;
        }

        var name = (toolName ?? string.Empty).Trim();
        foreach (var alternative in normalizedPattern.Split('|', StringSplitOptions.RemoveEmptyEntries))
        {
            var candidate = alternative.Trim();
            if (candidate.Length == 0)
            {
                continue;
            }

            if (Match(candidate, 0, name, 0, separatorAware: false))
            {
                return true;
            }
        }

        return false;
    }

    /// <summary>경로 glob 대조. glob 이 비면 모든 경로에 해당한다.</summary>
    public static bool MatchesPath(string? glob, string? path)
    {
        var normalizedGlob = (glob ?? string.Empty).Trim();
        if (normalizedGlob.Length == 0)
        {
            return true;
        }

        if (normalizedGlob.Length > MaxPatternChars)
        {
            return false;
        }

        var normalizedPath = (path ?? string.Empty).Trim().Replace('\\', '/');
        if (normalizedPath.Length == 0)
        {
            return false;
        }

        return Match(normalizedGlob.Replace('\\', '/'), 0, normalizedPath, 0, separatorAware: true);
    }

    private static bool Match(string pattern, int patternIndex, string value, int valueIndex, bool separatorAware)
    {
        while (patternIndex < pattern.Length)
        {
            var token = pattern[patternIndex];

            if (token == '*')
            {
                var isDoubleStar = separatorAware
                    && patternIndex + 1 < pattern.Length
                    && pattern[patternIndex + 1] == '*';
                var restIndex = isDoubleStar ? patternIndex + 2 : patternIndex + 1;

                // `**/` 는 0개 이상의 경로 구간과 대응하므로 구분자를 건너뛴 대조도 시도한다.
                if (isDoubleStar && restIndex < pattern.Length && pattern[restIndex] == '/')
                {
                    if (Match(pattern, restIndex + 1, value, valueIndex, separatorAware))
                    {
                        return true;
                    }
                }

                for (var candidate = valueIndex; candidate <= value.Length; candidate++)
                {
                    if (Match(pattern, restIndex, value, candidate, separatorAware))
                    {
                        return true;
                    }

                    if (candidate < value.Length
                        && separatorAware
                        && !isDoubleStar
                        && value[candidate] == '/')
                    {
                        return false;
                    }
                }

                return false;
            }

            if (valueIndex >= value.Length)
            {
                return false;
            }

            if (token == '?')
            {
                if (separatorAware && value[valueIndex] == '/')
                {
                    return false;
                }

                patternIndex++;
                valueIndex++;
                continue;
            }

            if (token != value[valueIndex])
            {
                return false;
            }

            patternIndex++;
            valueIndex++;
        }

        return valueIndex == value.Length;
    }
}
