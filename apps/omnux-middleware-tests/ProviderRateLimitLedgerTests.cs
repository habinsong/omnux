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

public sealed class ProviderModelChainPolicyTests
{
    [Fact]
    public void RequestedModelComesFirstAndDuplicatesAreDropped()
    {
        var chain = ProviderModelChainPolicy.BuildChain("b", new[] { "a", "b", "c", "b" });
        Assert.Equal(new[] { "b", "a", "c" }, chain);
    }

    [Fact]
    public void EmptyRequestedModelStillUsesProviderFallbacks()
    {
        var chain = ProviderModelChainPolicy.BuildChain("  ", new[] { "a", "b" });
        Assert.Equal(new[] { "a", "b" }, chain);
    }

    [Fact]
    public void ProvidersWithoutFallbackListGetASingleEntryChain()
    {
        // codex·copilot 처럼 레지스트리에 대체 목록이 없는 제공자는 체인이 1개라 동작이 바뀌지 않는다.
        Assert.Equal(new[] { "only" }, ProviderModelChainPolicy.BuildChain("only", Array.Empty<string>()));
        Assert.Empty(ProviderModelChainPolicy.BuildChain(null, null));
    }

    [Fact]
    public void RegistryProvidesRealFallbackChainsForRateLimitedProviders()
    {
        // 모델 이름을 코드에 박지 않고 레지스트리에서 온다는 것을 고정한다.
        foreach (var provider in new[] { "groq", "cerebras", "nvidia", "deepseek", "gemini" })
        {
            var chain = ProviderModelChainPolicy.BuildChain(
                ModelRegistry.GetDefaultModel(provider),
                ModelRegistry.GetFallbackModels(provider)
            );
            Assert.True(chain.Count >= 2, $"{provider} 는 이어받을 모델이 2개 이상이어야 한다");
            Assert.Equal(ModelRegistry.GetDefaultModel(provider), chain[0]);
        }
    }
}

public sealed class ProviderAuthFailureClassificationTests
{
    [Theory]
    [InlineData("Cerebras 결제 필요 (402). 계정 크레딧이나 결제 수단을 확인하거나 다른 제공자를 골라 주세요.")]
    [InlineData("NVIDIA NIM 인증 실패 (403). API 키를 확인해 주세요.")]
    [InlineData("Groq 요청 실패: 401")]
    [InlineData("요청 실패: 402")]
    public void BillingAndAuthFailuresAreFatalSoWeSwitchProvider(string text)
    {
        var kind = CodingProviderFailurePolicy.Classify(text);
        Assert.Equal(CodingProviderFailureKind.Auth, kind);
        Assert.True(CodingProviderFailurePolicy.IsFatal(kind));
    }

    [Fact]
    public void RateLimitTextStaysRateLimitedNotAuth()
    {
        Assert.Equal(
            CodingProviderFailureKind.RateLimited,
            CodingProviderFailurePolicy.Classify("Groq 모델 한도에 도달했습니다. 잠시 후 다시 시도하세요.")
        );
    }

    [Fact]
    public void ProviderCooldownHidesTheProviderUntilItExpires()
    {
        var ledger = new ProviderRateLimitLedger();
        var now = DateTimeOffset.UtcNow;
        ledger.MarkProviderUnavailable("cerebras", now, TimeSpan.FromMinutes(10), "결제 필요 (402)");
        Assert.True(ledger.TryGetProviderCooldown("cerebras", now, out var reason));
        Assert.Contains("402", reason, StringComparison.Ordinal);
        Assert.False(ledger.IsProviderCoolingDown("cerebras", now.AddMinutes(11)));
        Assert.False(ledger.IsProviderCoolingDown("groq", now));
        ledger.ClearProviderCooldown("cerebras");
        Assert.False(ledger.IsProviderCoolingDown("cerebras", now));
    }
}

public sealed class ProviderModelAvailabilityPolicyTests
{
    [Theory]
    [InlineData("{\"code\":\"model_not_found\"}")]
    [InlineData("The model `foo` does not exist")]
    [InlineData("Unknown model: bar")]
    [InlineData("Groq 요청 실패: 404")]
    [InlineData("모델을 찾을 수 없습니다")]
    public void UnknownModelErrorsAreRecognized(string text)
    {
        Assert.True(ProviderModelAvailabilityPolicy.LooksLikeUnknownModel(text));
    }

    [Theory]
    [InlineData("DeepSeek 요청 실패: 400")]
    [InlineData("Groq 모델 한도에 도달했습니다")]
    [InlineData("")]
    public void OtherFailuresAreNotTreatedAsMissingModel(string text)
    {
        // 일반 400/한도 오류로 모델을 후보에서 빼면 멀쩡한 모델이 사라진다.
        Assert.False(ProviderModelAvailabilityPolicy.LooksLikeUnknownModel(text));
    }

    [Fact]
    public void LongAnswersAreNeverTreatedAsModelErrors()
    {
        var body = new string('가', 900) + " does not exist";
        Assert.False(ProviderModelAvailabilityPolicy.LooksLikeUnknownModel(body));
    }
}
