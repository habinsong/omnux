using System.Text;

namespace Omnux.Middleware;

/// <summary>
/// 규칙 선택(순수 함수). 예산을 넘는 규칙은 잘라 넣지 않고 건너뛴 목록으로 보고한다.
/// 문자열 중간 절단으로 코드·유니코드가 깨지는 경로를 만들지 않는다.
/// </summary>
internal static class ExtensionRuleResolver
{
    public const int DefaultBudgetChars = 2000;

    public static ExtensionRuleSelection Resolve(
        IReadOnlyList<ExtensionRule> rules,
        string scope,
        string? targetPath,
        int budgetChars = DefaultBudgetChars
    )
    {
        var budget = budgetChars > 0 ? budgetChars : DefaultBudgetChars;
        var normalizedScope = (scope ?? string.Empty).Trim().ToLowerInvariant();
        var candidates = new List<ExtensionRule>();
        var skipped = new List<ExtensionRule>();

        foreach (var rule in rules)
        {
            if (!rule.Enabled)
            {
                continue;
            }

            if (!ScopeApplies(rule.Scope, normalizedScope))
            {
                continue;
            }

            if (rule.PathGlob.Trim().Length > 0)
            {
                var path = (targetPath ?? string.Empty).Trim();
                if (path.Length == 0 || !HookMatchPolicy.MatchesPath(rule.PathGlob, path))
                {
                    continue;
                }
            }

            if (rule.Body.Trim().Length == 0)
            {
                continue;
            }

            candidates.Add(rule);
        }

        candidates.Sort(Compare);

        var selected = new List<ExtensionRule>();
        var builder = new StringBuilder();
        var used = 0;
        foreach (var rule in candidates)
        {
            var block = FormatRule(rule);
            if (used + block.Length > budget)
            {
                skipped.Add(rule);
                continue;
            }

            builder.Append(block);
            used += block.Length;
            selected.Add(rule);
        }

        return new ExtensionRuleSelection(selected, skipped, builder.ToString().TrimEnd(), used, budget);
    }

    public static bool ScopeApplies(string ruleScope, string requestedScope)
    {
        var normalized = (ruleScope ?? string.Empty).Trim().ToLowerInvariant();
        if (normalized == ExtensionRule.ScopeGlobal)
        {
            return true;
        }

        return normalized == requestedScope;
    }

    private static int Compare(ExtensionRule left, ExtensionRule right)
    {
        var byPriority = left.Priority.CompareTo(right.Priority);
        if (byPriority != 0)
        {
            return byPriority;
        }

        return string.CompareOrdinal(left.Id, right.Id);
    }

    private static string FormatRule(ExtensionRule rule)
    {
        var builder = new StringBuilder();
        var title = rule.Title.Trim();
        if (title.Length > 0)
        {
            builder.Append("- ").Append(title).Append(": ");
        }
        else
        {
            builder.Append("- ");
        }

        builder.Append(rule.Body.Trim().Replace("\r\n", "\n", StringComparison.Ordinal));
        builder.Append('\n');
        return builder.ToString();
    }
}
