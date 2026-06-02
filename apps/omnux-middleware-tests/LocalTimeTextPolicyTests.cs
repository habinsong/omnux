namespace Omnux.Middleware.Tests;

public sealed class LocalTimeTextPolicyTests
{
    [Fact]
    public void BuildLocalNowText_UsesProvidedTimeAndTimezone()
    {
        var now = new DateTimeOffset(2026, 5, 31, 12, 34, 56, TimeSpan.FromHours(9));
        var timezone = TimeZoneInfo.CreateCustomTimeZone(
            "Test/Seoul",
            TimeSpan.FromHours(9),
            "Test/Seoul",
            "Test/Seoul"
        );

        var text = LocalTimeTextPolicy.BuildLocalNowText(now, timezone);

        Assert.Equal("2026-05-31 12:34:56 (UTC+09:00, Test/Seoul)", text);
    }

    [Theory]
    [InlineData(0, "UTC+00:00")]
    [InlineData(9, "UTC+09:00")]
    [InlineData(-5, "UTC-05:00")]
    public void FormatUtcOffsetLabel_FormatsSignedOffsets(int hours, string expected)
    {
        Assert.Equal(expected, LocalTimeTextPolicy.FormatUtcOffsetLabel(TimeSpan.FromHours(hours)));
    }
}
