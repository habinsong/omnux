using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class ProviderTokenBudgetPolicyTests
{
    [Theory]
    [InlineData("deepseek", true)]
    [InlineData("DeepSeek", true)]
    [InlineData("gemini", true)]
    [InlineData("groq", false)]
    [InlineData("cerebras", false)]
    [InlineData("nvidia", false)]
    [InlineData("", false)]
    public void LargeWindowProvidersAreDeepseekAndGemini(string provider, bool expected)
    {
        Assert.Equal(expected, ProviderTokenBudgetPolicy.HasLargeWindow(provider));
    }

    [Fact]
    public void SmallWindowProvidersKeepTheRequestedBudget()
    {
        // Groq 무료 티어는 분당 토큰이 작아 기존 예산을 그대로 써야 한다.
        Assert.Equal(2048, ProviderTokenBudgetPolicy.ResolveOutputTokens("groq", 2048));
        Assert.Equal(ProviderTokenBudgetPolicy.DefaultOutputTokenCap, ProviderTokenBudgetPolicy.ResolveOutputTokenCap("groq"));
    }

    [Fact]
    public void LargeWindowProvidersGetTheWholeWindow()
    {
        // 추론 토큰이 출력 예산 안에 들어간다. 예산을 깎으면 본문이 비거나 잘리므로 창 전체를 준다.
        ProviderTokenBudgetPolicy.ResetLearnedOutputLimits();
        Assert.Equal(
            ProviderTokenBudgetPolicy.LargeWindowTokens,
            ProviderTokenBudgetPolicy.ResolveOutputTokens("deepseek", 1024)
        );
        Assert.Equal(
            ProviderTokenBudgetPolicy.LargeWindowTokens,
            ProviderTokenBudgetPolicy.ResolveOutputTokens("gemini", 2400)
        );
    }

    [Fact]
    public void RequestsBeyondTheWindowAreClampedToIt()
    {
        ProviderTokenBudgetPolicy.ResetLearnedOutputLimits();
        Assert.Equal(
            ProviderTokenBudgetPolicy.LargeWindowTokens,
            ProviderTokenBudgetPolicy.ResolveOutputTokens("gemini", 1_000_000)
        );
        Assert.Equal(
            ProviderTokenBudgetPolicy.LargeWindowTokens,
            ProviderTokenBudgetPolicy.ResolveOutputTokenCap("deepseek")
        );
    }

    [Fact]
    public void ContextBudgetsGrowOnlyForLargeWindowProviders()
    {
        Assert.Equal(
            ProviderTokenBudgetPolicy.DefaultContextPromptChars,
            ProviderTokenBudgetPolicy.ResolveContextPromptChars("groq")
        );
        Assert.Equal(
            ProviderTokenBudgetPolicy.DefaultHistoryChars,
            ProviderTokenBudgetPolicy.ResolveHistoryChars("groq")
        );
        Assert.True(
            ProviderTokenBudgetPolicy.ResolveContextPromptChars("deepseek")
            > ProviderTokenBudgetPolicy.DefaultContextPromptChars
        );
        Assert.True(
            ProviderTokenBudgetPolicy.ResolveHistoryChars("gemini")
            > ProviderTokenBudgetPolicy.DefaultHistoryChars
        );
    }
}

public sealed class ProviderTokenBudgetLearnedLimitTests
{
    [Fact]
    public void LargeWindowProvidersGetTheWholeWindowNotABudget()
    {
        ProviderTokenBudgetPolicy.ResetLearnedOutputLimits();
        Assert.Equal(ProviderTokenBudgetPolicy.LargeWindowTokens, ProviderTokenBudgetPolicy.ResolveOutputTokens("deepseek", 1024));
        Assert.Equal(ProviderTokenBudgetPolicy.LargeWindowTokens, ProviderTokenBudgetPolicy.ResolveOutputTokens("gemini", 2400));
    }

    [Fact]
    public void RejectedLimitIsLearnedAndUsedAfterwards()
    {
        ProviderTokenBudgetPolicy.ResetLearnedOutputLimits();
        const string error = "{\"error\":{\"message\":\"max_tokens must be less than or equal to 65536\"}}";
        Assert.True(ProviderTokenBudgetPolicy.TryLearnOutputLimit("deepseek", error, out var limit));
        Assert.Equal(65536, limit);
        Assert.Equal(65536, ProviderTokenBudgetPolicy.ResolveOutputTokens("deepseek", 1024));
        // 같은 한도를 다시 배우지는 않는다(무한 재시도 방지).
        Assert.False(ProviderTokenBudgetPolicy.TryLearnOutputLimit("deepseek", error, out _));
        ProviderTokenBudgetPolicy.ResetLearnedOutputLimits();
    }

    [Fact]
    public void SmallWindowProvidersAndUnrelatedErrorsAreIgnored()
    {
        ProviderTokenBudgetPolicy.ResetLearnedOutputLimits();
        Assert.False(ProviderTokenBudgetPolicy.TryLearnOutputLimit("groq", "max_tokens must be <= 8192", out _));
        Assert.False(ProviderTokenBudgetPolicy.TryLearnOutputLimit("gemini", "rate limit exceeded", out _));
        Assert.Equal(2048, ProviderTokenBudgetPolicy.ResolveOutputTokens("groq", 2048));
    }

    [Theory]
    [InlineData("gemini")]
    [InlineData("deepseek")]
    public void 창이_큰_제공자는_페이지_원문을_더_많이_싣는다(string provider)
    {
        Assert.True(
            ProviderTokenBudgetPolicy.ResolveFetchedPageCount(provider)
            > ProviderTokenBudgetPolicy.ResolveFetchedPageCount("groq")
        );
        Assert.True(
            ProviderTokenBudgetPolicy.ResolveFetchedPageChars(provider)
            > ProviderTokenBudgetPolicy.ResolveFetchedPageChars("groq")
        );
    }

    [Fact]
    public void 그_외_제공자의_페이지_예산은_기존값을_지킨다()
    {
        Assert.Equal(2, ProviderTokenBudgetPolicy.ResolveFetchedPageCount("groq"));
        Assert.Equal(8_000, ProviderTokenBudgetPolicy.ResolveFetchedPageChars("groq"));
    }
}
