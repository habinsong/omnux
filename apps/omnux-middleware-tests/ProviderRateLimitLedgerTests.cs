using System.Net.Http;
using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class ProviderRateLimitLedgerTests
{
    private static HttpResponseMessage ResponseWith(params (string Name, string Value)[] headers)
    {
        var response = new HttpResponseMessage();
        foreach (var (name, value) in headers)
        {
            response.Headers.TryAddWithoutValidation(name, value);
        }

        return response;
    }

    [Fact]
    public void HeadersWithoutRateLimitSignalAreNotStored()
    {
        var ledger = new ProviderRateLimitLedger();
        using var response = ResponseWith(("x-request-id", "abc"));
        Assert.Null(ledger.Capture("cerebras", "gpt-oss-120b", response.Headers, DateTimeOffset.UtcNow));
        Assert.Empty(ledger.Snapshot());
    }

    [Fact]
    public void StandardHeadersAreStoredPerProviderAndModel()
    {
        var ledger = new ProviderRateLimitLedger();
        var now = DateTimeOffset.UtcNow;
        using var response = ResponseWith(
            ("x-ratelimit-limit-requests", "30"),
            ("x-ratelimit-remaining-requests", "7"),
            ("x-ratelimit-limit-tokens", "6000"),
            ("x-ratelimit-remaining-tokens", "1200")
        );
        var state = ledger.Capture("groq", "openai/gpt-oss-120b", response.Headers, now);
        Assert.NotNull(state);
        Assert.Equal(30, state!.LimitRequests);
        Assert.Equal(7, state.RemainingRequests);
        Assert.Equal(1200, state.RemainingTokens);
        // 같은 모델 이름이라도 제공자가 다르면 별개로 센다.
        Assert.Null(ledger.TryGet("cerebras", "openai/gpt-oss-120b"));
        Assert.Single(ledger.Snapshot("groq"));
    }

    [Fact]
    public void ImminentExhaustionIsSeenFromRemainingCounters()
    {
        var ledger = new ProviderRateLimitLedger();
        var now = DateTimeOffset.UtcNow;
        using var lowRequests = ResponseWith(("x-ratelimit-remaining-requests", "1"));
        ledger.Capture("groq", "a", lowRequests.Headers, now);
        Assert.True(ledger.IsExhaustionImminent("groq", "a", 100, now));

        using var lowTokens = ResponseWith(("x-ratelimit-remaining-tokens", "500"));
        ledger.Capture("groq", "b", lowTokens.Headers, now);
        Assert.True(ledger.IsExhaustionImminent("groq", "b", 2000, now));
        Assert.False(ledger.IsExhaustionImminent("groq", "b", 100, now));

        // 헤더를 못 받은 모델은 판단 근거가 없으니 막지 않는다.
        Assert.False(ledger.IsExhaustionImminent("groq", "unknown", 100_000, now));
    }

    [Fact]
    public void RetryAfterSetsCooldownAndBlocksTheModel()
    {
        var ledger = new ProviderRateLimitLedger();
        var now = DateTimeOffset.UtcNow;
        using var response = ResponseWith(("retry-after", "45"));
        var state = ledger.Capture("nvidia", "moonshotai/kimi-k3", response.Headers, now, isRateLimited: true);
        Assert.NotNull(state);
        Assert.True(ledger.IsCoolingDown("nvidia", "moonshotai/kimi-k3", now));
        Assert.False(ledger.IsCoolingDown("nvidia", "moonshotai/kimi-k3", now.AddSeconds(46)));
    }

    [Fact]
    public void RateLimitWithoutHeadersStillGetsAFallbackCooldown()
    {
        var ledger = new ProviderRateLimitLedger();
        var now = DateTimeOffset.UtcNow;
        ledger.MarkRateLimited("cerebras", "qwen-3.8-27b", now, TimeSpan.FromSeconds(20));
        Assert.True(ledger.IsCoolingDown("cerebras", "qwen-3.8-27b", now.AddSeconds(5)));
        Assert.False(ledger.IsCoolingDown("cerebras", "qwen-3.8-27b", now.AddSeconds(21)));
    }
}

public sealed class TelegramOtpSuppressionTests
{
    [Fact]
    public void DisableTelegramOtpDefaultsToOffSoTheRealAppKeepsSendingOtp()
    {
        // 기본값이 켜지면 실제 사용자가 OTP 를 못 받는다. 검증용 인스턴스에서만 끄는 스위치다.
        var config = AppConfig.LoadFromEnvironment();
        Assert.False(config.Security.DisableTelegramOtp);
    }
}
