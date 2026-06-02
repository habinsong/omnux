using System.Text.RegularExpressions;

namespace Omnux.Middleware;

internal static class NaturalCommandDeterministicPolicy
{
    public static IReadOnlyList<string>? TryResolveCompoundOffToggle(string input)
    {
        var raw = (input ?? string.Empty).Trim();
        if (raw.Length == 0)
        {
            return null;
        }

        var normalized = Regex.Replace(raw, @"\s+", " ").Trim();

        var hasOffVerb = Regex.IsMatch(
            normalized,
            @"(꺼|끄|off|비활성|해제|중지|그만|disable|deactivate|stop)",
            RegexOptions.IgnoreCase
        );
        if (!hasOffVerb)
        {
            return null;
        }

        var hasOnVerb = Regex.IsMatch(
            normalized,
            @"(켜|on|활성화|시작|enable|activate)",
            RegexOptions.IgnoreCase
        );
        if (hasOnVerb)
        {
            return null;
        }

        var hasThink = Regex.IsMatch(normalized, @"(추론(\s*모드)?|think\+?|thinking)", RegexOptions.IgnoreCase);
        var hasSkill = Regex.IsMatch(normalized, @"(스킬|skill)", RegexOptions.IgnoreCase);
        var hasWeb = Regex.IsMatch(normalized, @"웹(\s*(검색|컨텍스트|context))?", RegexOptions.IgnoreCase);

        var subjectCount = (hasThink ? 1 : 0) + (hasSkill ? 1 : 0) + (hasWeb ? 1 : 0);
        if (subjectCount < 2)
        {
            return null;
        }

        var hasGroupModifier = Regex.IsMatch(normalized, @"(다|모두|싹|전부|both|all)\s*(꺼|끄|off|해제|중지|그만)", RegexOptions.IgnoreCase);
        var hasConnector = Regex.IsMatch(normalized, @"(와|과|랑|이랑|하고|및|·|,| and )", RegexOptions.IgnoreCase);
        if (!hasGroupModifier && !hasConnector)
        {
            return null;
        }

        if (Regex.IsMatch(normalized, @"(사용해|사용해서|적용해|활성화|켜줘|적용)", RegexOptions.IgnoreCase))
        {
            return null;
        }

        var commands = new List<string>(3);
        if (hasThink) commands.Add("/think off");
        if (hasSkill) commands.Add("/skill off");
        if (hasWeb) commands.Add("/web off");
        return commands;
    }

    public static string? TryResolveDeterministicNaturalCommand(string input)
    {
        var raw = (input ?? string.Empty).Trim();
        if (raw.Length == 0)
        {
            return null;
        }

        var normalized = Regex.Replace(raw, @"\s+", " ").Trim();

        var aliasAdd1 = Regex.Match(
            normalized,
            @"^(?<name>[A-Za-z0-9가-힣_-]{2,40})\s*스킬을?\s*(?<alias>[A-Za-z0-9가-힣_-]{1,16})\s*(?:라는|로|으로)?\s*(?:별명|단축|단축키|alias)\s*(?:으로|로|키)?\s*(?:등록|추가|지정|만들|만들어|저장)",
            RegexOptions.IgnoreCase
        );
        if (aliasAdd1.Success)
        {
            return BuildSkillQuickAddCommand(aliasAdd1.Groups["alias"].Value, aliasAdd1.Groups["name"].Value);
        }

        var aliasAdd2 = Regex.Match(
            normalized,
            @"^(?:스킬\s*)?(?:별명|단축|단축키|alias)\s*(?<alias>[A-Za-z0-9_-]{1,16}|[가-힣]{1,8})\s*(?:으로|로|에)?\s*(?<name>[A-Za-z0-9가-힣_-]{2,40})\s*스킬\s*(?:등록|추가|지정|만들|만들어|저장)",
            RegexOptions.IgnoreCase
        );
        if (aliasAdd2.Success)
        {
            return BuildSkillQuickAddCommand(aliasAdd2.Groups["alias"].Value, aliasAdd2.Groups["name"].Value);
        }

        var aliasAdd3 = Regex.Match(
            normalized,
            @"^(?<name>[A-Za-z0-9가-힣_-]{2,40})\s*(?:을|를)?\s*(?<alias>[A-Za-z0-9가-힣_-]{1,16})\s*(?:로|으로)\s*(?:등록|추가|지정|만들|만들어|저장)\s*해?\s*줘?$",
            RegexOptions.IgnoreCase
        );
        if (aliasAdd3.Success
            && (normalized.Contains("스킬", StringComparison.OrdinalIgnoreCase)
                || normalized.Contains("별명", StringComparison.OrdinalIgnoreCase)
                || normalized.Contains("단축", StringComparison.OrdinalIgnoreCase)))
        {
            return BuildSkillQuickAddCommand(aliasAdd3.Groups["alias"].Value, aliasAdd3.Groups["name"].Value);
        }

        var aliasRemove = Regex.Match(
            normalized,
            @"(?:스킬\s*)?(?:별명|단축|단축키|alias)\s*(?<alias>[A-Za-z0-9가-힣_-]{1,16})\s*(?:을|를)?\s*(?:지워|삭제|제거|remove|delete|rm)",
            RegexOptions.IgnoreCase
        );
        if (aliasRemove.Success)
        {
            return $"/skill quick remove {aliasRemove.Groups["alias"].Value.TrimStart('/')}";
        }

        if (Regex.IsMatch(
                normalized,
                @"(?:스킬\s*)?(?:별명|단축|단축키|alias)\s*(?:목록|리스트|보여\s*줘?|list)",
                RegexOptions.IgnoreCase))
        {
            return "/skill quick list";
        }

        if (Regex.IsMatch(
                normalized,
                @"(?:현재|지금)?\s*(?:활성|활성화된|active)?\s*스킬\s*(?:상태|뭐(야|에요)?|확인|status)",
                RegexOptions.IgnoreCase))
        {
            return "/skill status";
        }

        if (Regex.IsMatch(normalized, @"^(추론\s*모드|think\+?|thinking)\s*(켜|on|활성|시작)$", RegexOptions.IgnoreCase))
        {
            return "/think on";
        }

        if (Regex.IsMatch(normalized, @"^(추론\s*모드|think\+?|thinking)\s*(꺼|끄|off|비활성|중지|해제|그만)$", RegexOptions.IgnoreCase))
        {
            return "/think off";
        }

        if (Regex.IsMatch(normalized, @"^(추론\s*모드|think\+?|thinking)\s*(상태|status|확인)$", RegexOptions.IgnoreCase))
        {
            return "/think status";
        }

        if (Regex.IsMatch(normalized, @"^웹\s*(검색|컨텍스트|context)\s*(켜|on|활성|시작)$", RegexOptions.IgnoreCase))
        {
            return "/web on";
        }

        if (Regex.IsMatch(normalized, @"^웹\s*(검색|컨텍스트|context)\s*(꺼|끄|off|비활성|중지|해제|그만)$", RegexOptions.IgnoreCase))
        {
            return "/web off";
        }

        var history = Regex.Match(
            normalized,
            @"(?:최근|지난|이전)\s*대화\s*(?<n>\d{1,2})?\s*(?:개|건)?\s*(?:보여|확인|보기)?",
            RegexOptions.IgnoreCase
        );
        if (history.Success)
        {
            var nStr = history.Groups["n"].Value;
            if (!string.IsNullOrEmpty(nStr) && int.TryParse(nStr, out var n) && n >= 1 && n <= 20)
            {
                return $"/history {n}";
            }

            return "/history";
        }

        return null;
    }

    private static string? BuildSkillQuickAddCommand(string alias, string name)
    {
        var a = (alias ?? string.Empty).Trim().TrimStart('/');
        var n = (name ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(a) || string.IsNullOrWhiteSpace(n))
        {
            return null;
        }

        return $"/skill quick {a} {n}";
    }
}
