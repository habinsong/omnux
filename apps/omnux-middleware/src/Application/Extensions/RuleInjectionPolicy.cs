using System.Text;

namespace Omnux.Middleware;

/// <summary>
/// 규칙 주입 본문 구성(순수 함수). 두 출처를 합친다.
/// 하나는 기존 전역 단일 파일(<see cref="UserRuleStore"/>), 다른 하나는 범위·우선순위가 있는 확장 규칙이다.
/// 중복 본문은 한 번만 넣고, 예산을 넘는 규칙은 잘라 넣지 않고 제외한다.
/// </summary>
internal static class RuleInjectionPolicy
{
    /// <summary>확장 규칙에 줄 문자 예산. 매 요청에 붙으므로 전역 파일보다 조금 넉넉하게만 둔다.</summary>
    public const int ExtensionBudgetChars = 800;

    public static string BuildBody(string? legacyText, ExtensionRuleSelection? selection)
    {
        var legacy = (legacyText ?? string.Empty).Trim();
        var extension = (selection?.Text ?? string.Empty).Trim();

        if (legacy.Length == 0)
        {
            return extension;
        }

        if (extension.Length == 0)
        {
            return legacy;
        }

        // 전역 파일 본문이 확장 규칙 본문에 이미 들어 있으면 두 번 넣지 않는다.
        if (extension.Contains(legacy, StringComparison.Ordinal))
        {
            return extension;
        }

        return new StringBuilder(legacy).Append('\n').Append(extension).ToString();
    }

    /// <summary>예산 때문에 빠진 규칙이 있으면 그 사실을 한 줄로 알린다. 조용히 버리지 않는다.</summary>
    public static string BuildSkippedNote(ExtensionRuleSelection? selection)
    {
        var skipped = selection?.Skipped;
        if (skipped == null || skipped.Count == 0)
        {
            return string.Empty;
        }

        var names = new List<string>(skipped.Count);
        foreach (var rule in skipped)
        {
            names.Add(rule.Title.Trim().Length > 0 ? rule.Title.Trim() : rule.Id);
        }

        return $"- 길이 제한으로 이번 요청에 넣지 못한 규칙 {skipped.Count}개: {string.Join(", ", names)}";
    }
}
