using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class PromptCachePolicyTests
{
    [Fact]
    public void AnalyzeBuildsStableCacheKeyFromStaticPrefix()
    {
        var prefix = string.Join('\n', Enumerable.Repeat("고정 시스템 규칙과 프로젝트 문맥입니다.", 120));
        var first = PromptCachePolicy.Analyze("gemini", "flash", $"{prefix}\n\n사용자 입력:\n첫 요청");
        var second = PromptCachePolicy.Analyze("gemini", "flash", $"{prefix}\n\n사용자 입력:\n다른 요청");

        Assert.True(first.Eligible);
        Assert.Equal("prefix_marker", first.Strategy);
        Assert.Equal(first.CacheKey, second.CacheKey);
        Assert.Equal(first.AffinityKey, second.AffinityKey);
        Assert.True(first.StaticPrefixChars > 0);
        Assert.True(first.EstimatedStaticPrefixTokens >= PromptCachePolicy.MinStaticPrefixTokens);
    }

    [Fact]
    public void AnalyzeReturnsNotEligibleWhenNoStaticPrefixMarkerExists()
    {
        var plan = PromptCachePolicy.Analyze("groq", "model", "단일 사용자 요청만 있습니다.");

        Assert.False(plan.Eligible);
        Assert.Empty(plan.CacheKey);
        Assert.Equal("no_static_prefix", plan.Reason);
        Assert.Equal(0, plan.StaticPrefixChars);
    }
}
