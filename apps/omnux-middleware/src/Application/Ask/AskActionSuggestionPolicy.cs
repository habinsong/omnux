using System.Text.RegularExpressions;

namespace Omnux.Middleware;

/// <summary>
/// 제안 카드 1건 — Kind: plan | routine | agent. Prompt 는 카드 클릭 시 그대로 쓸 원문.
/// Schedule* 는 routine 카드에서 자연어 파싱이 성공했을 때만 채워진다(P1-1b) —
/// 프론트가 create_routine 페이로드에 그대로 사용한다. Weekdays 는 DayOfWeek 정수(0=일…6=토).
/// </summary>
public sealed record AskActionSuggestion(
    string Kind,
    string Label,
    string Prompt,
    string? ScheduleKind = null,
    string? ScheduleTime = null,
    IReadOnlyList<int>? ScheduleWeekdays = null,
    int? ScheduleDayOfMonth = null
);

/// <summary>
/// 질문(Ask) 입력에서 후속 액션 의도(계획/루틴/에이전트 위임)를 보수적으로 감지해
/// "답변 + 원클릭 제안 카드" 페이로드를 만든다 (ASK_ORCHESTRATION_PLAN.md P0-6).
/// 자동 실행은 하지 않는다 — 카드 버튼이 기존 WS 타입(plan_create/create_routine/sessions_spawn)을
/// 그대로 호출한다. 오탐이 사용자 신뢰를 깎으므로 약한 신호는 버린다.
/// </summary>
internal static class AskActionSuggestionPolicy
{
    public const int MaxSuggestions = 2;
    public const int PromptMaxChars = 500;
    public const int MinInputLength = 6;

    private const string DisableEnvName = "OMNUX_ASK_ACTION_SUGGESTIONS";

    // "매일경제/매일신문" 같은 고유명사의 '매일'은 반복 의도가 아니다.
    private static readonly Regex NewspaperGuardRegex = new(
        @"매일\s*(경제|신문)",
        RegexOptions.Compiled | RegexOptions.CultureInvariant
    );

    private static readonly Regex RoutineScheduleRegex = new(
        @"(매일|매주|매달|매월|매시간|격주로?|평일\s*마다|주말\s*마다|(아침|점심|저녁|밤|새벽)\s*마다|\d{1,2}\s*시(\s*\d{1,2}\s*분)?\s*(마다|에\s)|정기적으로|주기적으로|반복적으로|스케줄로?)",
        RegexOptions.Compiled | RegexOptions.CultureInvariant
    );

    private static readonly Regex RoutineActionRegex = new(
        @"(해줘|해주라|해줄래|보내줘|알려줘|올려줘|요약|브리핑|정리해|체크해|확인해|실행해|돌려줘|보내|만들어\s*줘)",
        RegexOptions.Compiled | RegexOptions.CultureInvariant
    );

    private static readonly Regex PlanRegex = new(
        @"(계획\s*(좀\s*)?(세워|짜|만들|수립)|플랜\s*(세워|짜|만들)|로드맵|마일스톤|단계\s*(로|별로?)\s*(나눠|나누|쪼개|정리)|작업\s*(으로|단위로)\s*(나눠|나누|쪼개|분해)|할\s*일\s*(목록)?으?로\s*(정리|만들))",
        RegexOptions.Compiled | RegexOptions.CultureInvariant
    );

    private static readonly Regex AgentRegex = new(
        @"(백그라운드(로|에서)|시켜\s*놔|시켜놓|돌려\s*놔|돌려놓|맡겨\s*줘?|맡아서|에이전트(한테|에게|로|가)|알아서\s*(해|진행해|처리해)\s*놔)",
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

    public static IReadOnlyList<AskActionSuggestion> Detect(string? input)
    {
        if (IsDisabledByEnv())
        {
            return Array.Empty<AskActionSuggestion>();
        }

        var normalized = (input ?? string.Empty).Trim();
        if (normalized.Length < MinInputLength || normalized.StartsWith("/", StringComparison.Ordinal))
        {
            return Array.Empty<AskActionSuggestion>();
        }

        var prompt = normalized.Length <= PromptMaxChars ? normalized : normalized[..PromptMaxChars];
        var suggestions = new List<AskActionSuggestion>(MaxSuggestions);

        // 우선순위: 반복(루틴) > 위임(에이전트) > 계획 — 더 구체적인 의도를 앞세운다.
        var scheduleText = NewspaperGuardRegex.Replace(normalized, " ");
        if (RoutineScheduleRegex.IsMatch(scheduleText) && RoutineActionRegex.IsMatch(scheduleText))
        {
            // P1-1b: "매일 아침 9시" 류를 파싱해 카드 클릭 시 실제 스케줄로 생성되게 한다.
            // 파싱 실패면 manual 생성(기존 동작) — 라벨로 파싱 결과를 사용자에게 보여준다.
            var schedule = AskRoutineSchedulePolicy.TryParse(scheduleText);
            var label = schedule == null
                ? "이 요청으로 루틴 만들기"
                : $"루틴 만들기 ({AskRoutineSchedulePolicy.FormatForLabel(schedule)})";
            suggestions.Add(new AskActionSuggestion(
                "routine",
                label,
                prompt,
                schedule?.Kind,
                schedule?.Time,
                schedule?.Weekdays,
                schedule?.DayOfMonth
            ));
        }

        if (suggestions.Count < MaxSuggestions && AgentRegex.IsMatch(normalized))
        {
            suggestions.Add(new AskActionSuggestion("agent", "에이전트에게 맡기기", prompt));
        }

        if (suggestions.Count < MaxSuggestions && PlanRegex.IsMatch(normalized))
        {
            suggestions.Add(new AskActionSuggestion("plan", "작업계획으로 만들기", prompt));
        }

        return suggestions.Count == 0
            ? Array.Empty<AskActionSuggestion>()
            : suggestions;
    }
}
