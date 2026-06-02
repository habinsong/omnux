using System.Net.Http;
using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class GroqRateLimitHeaderParserTests
{
    [Fact]
    public void ParseExtractsAllRateLimitHeadersAndStampsCapturedAt()
    {
        using var response = new HttpResponseMessage();
        response.Headers.Add("x-ratelimit-limit-requests", "1000");
        response.Headers.Add("x-ratelimit-remaining-requests", "997");
        response.Headers.Add("x-ratelimit-limit-tokens", "100000");
        response.Headers.Add("x-ratelimit-remaining-tokens", "99500");
        response.Headers.Add("x-ratelimit-reset-requests", "1m20s");
        response.Headers.Add("x-ratelimit-reset-tokens", "45s");

        var capturedAt = new DateTimeOffset(2026, 5, 18, 12, 0, 0, TimeSpan.Zero);
        var snapshot = GroqRateLimitHeaderParser.Parse(response.Headers, capturedAt);

        Assert.Equal(1000, snapshot.LimitRequests);
        Assert.Equal(997, snapshot.RemainingRequests);
        Assert.Equal(100000, snapshot.LimitTokens);
        Assert.Equal(99500, snapshot.RemainingTokens);
        Assert.Equal("1m20s", snapshot.ResetRequests);
        Assert.Equal("45s", snapshot.ResetTokens);
        Assert.Null(snapshot.CooldownUntilUtc);
        Assert.Equal(capturedAt, snapshot.LastUpdatedUtc);
    }

    [Fact]
    public void ParseReturnsNullableFieldsWhenHeadersAreAbsent()
    {
        using var response = new HttpResponseMessage();

        var snapshot = GroqRateLimitHeaderParser.Parse(response.Headers, DateTimeOffset.UtcNow);

        Assert.Null(snapshot.LimitRequests);
        Assert.Null(snapshot.RemainingRequests);
        Assert.Null(snapshot.LimitTokens);
        Assert.Null(snapshot.RemainingTokens);
        Assert.Null(snapshot.ResetRequests);
        Assert.Null(snapshot.ResetTokens);
        Assert.Null(snapshot.CooldownUntilUtc);
    }

    [Fact]
    public void ParseIgnoresNonNumericLongHeaders()
    {
        using var response = new HttpResponseMessage();
        response.Headers.Add("x-ratelimit-limit-requests", "not-a-number");
        response.Headers.Add("x-ratelimit-reset-requests", "12s");

        var snapshot = GroqRateLimitHeaderParser.Parse(response.Headers, DateTimeOffset.UtcNow);

        Assert.Null(snapshot.LimitRequests);
        Assert.Equal("12s", snapshot.ResetRequests);
    }

    [Fact]
    public void ParseStoresRetryAfterCooldownOnlyForRateLimitedResponses()
    {
        using var response = new HttpResponseMessage();
        response.Headers.Add("retry-after", "12");
        var capturedAt = new DateTimeOffset(2026, 5, 18, 12, 0, 0, TimeSpan.Zero);

        var regular = GroqRateLimitHeaderParser.Parse(response.Headers, capturedAt);
        var limited = GroqRateLimitHeaderParser.Parse(response.Headers, capturedAt, isRateLimited: true);

        Assert.Null(regular.CooldownUntilUtc);
        Assert.Equal(capturedAt.AddSeconds(12), limited.CooldownUntilUtc);
    }

    [Fact]
    public void ParseClampsLargeRetryAfterCooldown()
    {
        using var response = new HttpResponseMessage();
        response.Headers.Add("retry-after", "999999");
        var capturedAt = new DateTimeOffset(2026, 5, 18, 12, 0, 0, TimeSpan.Zero);

        var snapshot = GroqRateLimitHeaderParser.Parse(response.Headers, capturedAt, isRateLimited: true);

        Assert.Equal(capturedAt.AddMinutes(30), snapshot.CooldownUntilUtc);
    }
}
