using System.Text.RegularExpressions;

namespace Omnux.Middleware;

/// <summary>
/// 질문(Ask) 입력에서 스킬을 보수적으로 자동 선택한다 (ASK_ORCHESTRATION_PLAN.md P0-5).
/// v1 규칙: "스킬 이름이 입력에 등장"하는 스킬이 **정확히 하나**일 때만 선택한다.
/// 설명 키워드 매칭은 오탐 위험이 높아 v1 에서 제외(IntentPlanner P1-1 에서 격상 예정).
/// 명시 멘션·UI 선택·스레드 바인딩 스킬이 있으면 호출측에서 이 정책을 타지 않는다.
/// </summary>
internal static class AskSkillAutoSelectPolicy
{
    public const int MinSkillNameLength = 3;
    public const int MinInputLength = 6;

    private const string DisableEnvName = "OMNUX_ASK_SKILL_AUTO_SELECT";

    private static readonly Regex TokenRegex = new(
        @"[\p{L}\p{N}]+",
        RegexOptions.Compiled | RegexOptions.CultureInvariant
    );

    public static bool IsDisabledByEnv()
    {
        return IsDisabledValue(Environment.GetEnvironmentVariable(DisableEnvName));
    }

    /// <summary>기본 on — "0"/"false"/"off"/"no" 일 때만 비활성.</summary>
    public static bool IsDisabledValue(string? raw)
    {
        var normalized = (raw ?? string.Empty).Trim();
        return normalized.Equals("0", StringComparison.Ordinal)
            || normalized.Equals("false", StringComparison.OrdinalIgnoreCase)
            || normalized.Equals("off", StringComparison.OrdinalIgnoreCase)
            || normalized.Equals("no", StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// 이름이 입력에 등장하는 스킬이 정확히 하나면 그 이름을, 아니면 null 을 반환.
    /// 매칭: (a) 이름 연결형("code-review"→"codereview" 포함 검사 — "코드리뷰로 봐줘" 같은
    /// 조사 결합 커버) 또는 (b) 이름 토큰 전부가 입력 토큰에 존재.
    /// </summary>
    public static string? SelectSingleConfident(string? input, IReadOnlyList<SkillManifest>? skills)
    {
        var normalizedInput = (input ?? string.Empty).Trim();
        if (normalizedInput.Length < MinInputLength
            || normalizedInput.StartsWith("/", StringComparison.Ordinal)
            || skills == null
            || skills.Count == 0)
        {
            return null;
        }

        var inputLower = normalizedInput.ToLowerInvariant();
        var inputJoined = JoinTokens(inputLower);
        var inputTokens = new HashSet<string>(
            TokenRegex.Matches(inputLower).Select(match => match.Value),
            StringComparer.Ordinal
        );

        string? matched = null;
        foreach (var skill in skills)
        {
            var name = (skill.Name ?? string.Empty).Trim();
            if (name.Length < MinSkillNameLength)
            {
                continue;
            }

            if (!MatchesName(name, inputJoined, inputTokens))
            {
                continue;
            }

            if (matched != null && !matched.Equals(name, StringComparison.OrdinalIgnoreCase))
            {
                // 두 개 이상 매칭 — 자동 선택하지 않는다.
                return null;
            }

            matched = name;
        }

        return matched;
    }

    private static bool MatchesName(string name, string inputJoined, IReadOnlySet<string> inputTokens)
    {
        var nameLower = name.ToLowerInvariant();
        var nameJoined = JoinTokens(nameLower);
        if (nameJoined.Length >= MinSkillNameLength
            && inputJoined.Contains(nameJoined, StringComparison.Ordinal))
        {
            return true;
        }

        var nameTokens = TokenRegex.Matches(nameLower).Select(match => match.Value).ToArray();
        if (nameTokens.Length == 0)
        {
            return false;
        }

        // 토큰 1개짜리 이름은 흔한 단어 오탐 위험 — 길이 4 이상만 토큰 매칭 허용.
        if (nameTokens.Length == 1 && nameTokens[0].Length < 4)
        {
            return false;
        }

        return nameTokens.All(inputTokens.Contains);
    }

    /// <summary>구분자/공백 제거 연결형 — "code-review" → "codereview", "코드 리뷰" → "코드리뷰".</summary>
    private static string JoinTokens(string value)
    {
        return string.Concat(TokenRegex.Matches(value).Select(match => match.Value));
    }
}
