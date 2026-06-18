using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class AskRoutineSchedulePolicyTests
{
    [Theory]
    [InlineData("매일 아침 9시에 뉴스 요약해줘", "daily", "09:00")]
    [InlineData("매일 오후 3시 반에 알려줘", "daily", "15:30")]
    [InlineData("저녁마다 8시 15분에 일정 정리해줘", "daily", "20:15")]
    [InlineData("매일 밤 11시에 백업 돌려줘", "daily", "23:00")]
    [InlineData("매일 요약해줘", "daily", null)]
    public void TryParseDailySchedules(string input, string kind, string? time)
    {
        var schedule = AskRoutineSchedulePolicy.TryParse(input);
        Assert.NotNull(schedule);
        Assert.Equal(kind, schedule!.Kind);
        Assert.Equal(time, schedule.Time);
        Assert.Null(schedule.Weekdays);
    }

    [Fact]
    public void TryParseWeeklySingleDay()
    {
        var schedule = AskRoutineSchedulePolicy.TryParse("매주 월요일 아침 9시에 주간 보고 정리해줘");
        Assert.NotNull(schedule);
        Assert.Equal("weekly", schedule!.Kind);
        Assert.Equal("09:00", schedule.Time);
        Assert.Equal(new[] { 1 }, schedule.Weekdays);
    }

    [Fact]
    public void TryParseWeeklyMultipleDays()
    {
        var schedule = AskRoutineSchedulePolicy.TryParse("매주 월수금 7시에 운동 알림 보내줘");
        Assert.NotNull(schedule);
        Assert.Equal("weekly", schedule!.Kind);
        Assert.Equal(new[] { 1, 3, 5 }, schedule.Weekdays);
    }

    [Fact]
    public void TryParseWeekdaySet()
    {
        var schedule = AskRoutineSchedulePolicy.TryParse("평일 아침 8시 반에 일정 브리핑해줘");
        Assert.NotNull(schedule);
        Assert.Equal("weekly", schedule!.Kind);
        Assert.Equal("08:30", schedule.Time);
        Assert.Equal(new[] { 1, 2, 3, 4, 5 }, schedule.Weekdays);
    }

    [Fact]
    public void TryParseMonthly()
    {
        var schedule = AskRoutineSchedulePolicy.TryParse("매달 1일 오전 10시에 청구서 정리해줘");
        Assert.NotNull(schedule);
        Assert.Equal("monthly", schedule!.Kind);
        Assert.Equal("10:00", schedule.Time);
        Assert.Equal(1, schedule.DayOfMonth);
    }

    [Theory]
    [InlineData("오늘 비트코인 시세 알려줘")]
    [InlineData("이 코드 리뷰해줘")]
    [InlineData("")]
    public void TryParseReturnsNullWithoutScheduleSignal(string input)
    {
        Assert.Null(AskRoutineSchedulePolicy.TryParse(input));
    }

    [Fact]
    public void FormatForLabelRendersCompactKorean()
    {
        Assert.Equal("매일 09:00", AskRoutineSchedulePolicy.FormatForLabel(new AskRoutineSchedule("daily", "09:00", null, null)));
        Assert.Equal("매주 월·수 07:00", AskRoutineSchedulePolicy.FormatForLabel(new AskRoutineSchedule("weekly", "07:00", new[] { 1, 3 }, null)));
        Assert.Equal("매달 1일", AskRoutineSchedulePolicy.FormatForLabel(new AskRoutineSchedule("monthly", null, null, 1)));
    }

    [Fact]
    public void DetectAttachesParsedScheduleToRoutineSuggestion()
    {
        var suggestions = AskActionSuggestionPolicy.Detect("매주 월요일 아침 9시에 주간 일정 정리해줘");
        var routine = Assert.Single(suggestions, s => s.Kind == "routine");
        Assert.Equal("weekly", routine.ScheduleKind);
        Assert.Equal("09:00", routine.ScheduleTime);
        Assert.Equal(new[] { 1 }, routine.ScheduleWeekdays);
        Assert.Contains("매주 월 09:00", routine.Label);
    }
}
