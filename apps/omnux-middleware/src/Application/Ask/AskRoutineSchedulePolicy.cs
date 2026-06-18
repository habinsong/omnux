using System.Text.RegularExpressions;

namespace Omnux.Middleware;

/// <summary>파싱된 루틴 스케줄 — Weekdays 는 .NET DayOfWeek 정수(0=일 … 6=토).</summary>
public sealed record AskRoutineSchedule(
    string Kind,
    string? Time,
    IReadOnlyList<int>? Weekdays,
    int? DayOfMonth
);

/// <summary>
/// 루틴 제안 카드용 스케줄 자연어 파서 (ASK_ORCHESTRATION_PLAN.md P1-1b).
/// "매일 아침 9시" → daily 09:00, "매주 월요일 8시 반" → weekly [1] 08:30 처럼
/// 확실한 패턴만 파싱하고, 모호하면 null(카드가 manual 로 생성 — 기존 동작 유지).
/// </summary>
internal static class AskRoutineSchedulePolicy
{
    private static readonly Regex DailyRegex = new(
        @"(매일|하루\s*(에\s*한\s*번|마다)|(아침|점심|저녁|밤)\s*마다)",
        RegexOptions.Compiled | RegexOptions.CultureInvariant
    );

    private static readonly Regex WeeklyRegex = new(
        @"매주\s*(?<days>(?:[월화수목금토일]\s*,?\s*)+)(?:요일)?",
        RegexOptions.Compiled | RegexOptions.CultureInvariant
    );

    private static readonly Regex WeekdaySetRegex = new(
        @"평일\s*(마다|에)?",
        RegexOptions.Compiled | RegexOptions.CultureInvariant
    );

    private static readonly Regex WeekendSetRegex = new(
        @"주말\s*(마다|에)?",
        RegexOptions.Compiled | RegexOptions.CultureInvariant
    );

    private static readonly Regex MonthlyRegex = new(
        @"(매달|매월)\s*(?<day>\d{1,2})\s*일",
        RegexOptions.Compiled | RegexOptions.CultureInvariant
    );

    private static readonly Regex TimeRegex = new(
        @"(?<meridiem>오전|오후|아침|점심|저녁|밤|새벽)?\s*(?<hour>\d{1,2})\s*시(\s*(?<half>반)|\s*(?<minute>\d{1,2})\s*분)?",
        RegexOptions.Compiled | RegexOptions.CultureInvariant
    );

    private static readonly IReadOnlyDictionary<char, int> WeekdayByChar = new Dictionary<char, int>
    {
        ['일'] = 0,
        ['월'] = 1,
        ['화'] = 2,
        ['수'] = 3,
        ['목'] = 4,
        ['금'] = 5,
        ['토'] = 6
    };

    public static AskRoutineSchedule? TryParse(string? input)
    {
        var normalized = (input ?? string.Empty).Trim();
        if (normalized.Length == 0)
        {
            return null;
        }

        var time = TryParseTime(normalized);

        var monthly = MonthlyRegex.Match(normalized);
        if (monthly.Success
            && int.TryParse(monthly.Groups["day"].Value, out var dayOfMonth)
            && dayOfMonth >= 1
            && dayOfMonth <= 31)
        {
            return new AskRoutineSchedule("monthly", time, null, dayOfMonth);
        }

        var weekly = WeeklyRegex.Match(normalized);
        if (weekly.Success)
        {
            var days = weekly.Groups["days"].Value
                .Where(WeekdayByChar.ContainsKey)
                .Select(ch => WeekdayByChar[ch])
                .Distinct()
                .OrderBy(value => value)
                .ToArray();
            if (days.Length > 0)
            {
                return new AskRoutineSchedule("weekly", time, days, null);
            }
        }

        if (WeekdaySetRegex.IsMatch(normalized))
        {
            return new AskRoutineSchedule("weekly", time, new[] { 1, 2, 3, 4, 5 }, null);
        }

        if (WeekendSetRegex.IsMatch(normalized))
        {
            return new AskRoutineSchedule("weekly", time, new[] { 0, 6 }, null);
        }

        if (DailyRegex.IsMatch(normalized))
        {
            return new AskRoutineSchedule("daily", time, null, null);
        }

        return null;
    }

    /// <summary>배지/라벨용 짧은 표기 — "매일 09:00", "매주 월·수 08:30", "매달 1일".</summary>
    public static string FormatForLabel(AskRoutineSchedule schedule)
    {
        var time = string.IsNullOrWhiteSpace(schedule.Time) ? string.Empty : $" {schedule.Time}";
        return schedule.Kind switch
        {
            "daily" => $"매일{time}".Trim(),
            "monthly" => $"매달 {schedule.DayOfMonth ?? 1}일{time}".Trim(),
            "weekly" when schedule.Weekdays is { Count: > 0 } days =>
                $"매주 {string.Join("·", days.OrderBy(v => v).Select(WeekdayName))}{time}".Trim(),
            _ => schedule.Kind
        };
    }

    private static string WeekdayName(int value)
    {
        return value switch
        {
            0 => "일",
            1 => "월",
            2 => "화",
            3 => "수",
            4 => "목",
            5 => "금",
            6 => "토",
            _ => value.ToString()
        };
    }

    private static string? TryParseTime(string input)
    {
        foreach (Match match in TimeRegex.Matches(input))
        {
            if (!int.TryParse(match.Groups["hour"].Value, out var hour) || hour < 0 || hour > 24)
            {
                continue;
            }

            var meridiem = match.Groups["meridiem"].Value;
            if (meridiem.Length == 0)
            {
                // "저녁마다 8시"처럼 시간대 단어가 시각과 떨어져 있으면 선행 문맥(12자)에서 찾는다.
                var prefixStart = Math.Max(0, match.Index - 12);
                var prefix = input[prefixStart..match.Index];
                var contextual = Regex.Match(prefix, "(오전|오후|아침|점심|저녁|밤|새벽)", RegexOptions.CultureInvariant);
                if (contextual.Success)
                {
                    meridiem = contextual.Value;
                }
            }

            var isPm = meridiem is "오후" or "저녁" or "밤";
            var isLunch = meridiem == "점심";
            if (hour == 24)
            {
                hour = 0;
            }
            else if (isPm && hour < 12)
            {
                hour += 12;
            }
            else if (isLunch && hour < 11)
            {
                hour += 12;
            }

            var minute = 0;
            if (match.Groups["half"].Success)
            {
                minute = 30;
            }
            else if (match.Groups["minute"].Success
                && int.TryParse(match.Groups["minute"].Value, out var parsedMinute)
                && parsedMinute is >= 0 and < 60)
            {
                minute = parsedMinute;
            }

            if (hour is >= 0 and < 24)
            {
                return $"{hour:00}:{minute:00}";
            }
        }

        return null;
    }
}
