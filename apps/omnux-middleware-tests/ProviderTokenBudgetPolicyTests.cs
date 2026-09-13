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
    public void LargeWindowProvidersGetAReasoningSafeFloor()
    {
        // 추론 토큰이 출력 예산 안에 들어가므로, 작은 예산을 그대로 주면 본문이 비거나 잘린다.
        Assert.Equal(
            ProviderTokenBudgetPolicy.LargeWindowMinOutputTokens,
            ProviderTokenBudgetPolicy.ResolveOutputTokens("deepseek", 1024)
        );
        Assert.Equal(
            ProviderTokenBudgetPolicy.LargeWindowMinOutputTokens,
            ProviderTokenBudgetPolicy.ResolveOutputTokens("gemini", 2400)
        );
    }

    [Fact]
    public void LargeWindowProvidersKeepBiggerRequestsUpToTheWindow()
    {
        Assert.Equal(64_000, ProviderTokenBudgetPolicy.ResolveOutputTokens("deepseek", 64_000));
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
