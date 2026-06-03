using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class ModelRoutingReadinessPolicyTests
{
    [Fact]
    public void AnalyzeClassifiesSimpleTransformAsEconomyCascadeCandidate()
    {
        var plan = ModelRoutingReadinessPolicy.Analyze(
            "groq",
            "fast-model",
            "이 JSON을 정리하고 핵심 필드만 추출해줘."
        );

        Assert.Equal(ModelRoutingReadinessPolicy.Simple, plan.Complexity);
        Assert.Equal("economy", plan.RecommendedTier);
        Assert.True(plan.CascadeEligible);
        Assert.Contains("transform", plan.Signals);
    }

    [Fact]
    public void AnalyzeClassifiesArchitectureCodeWorkAsComplex()
    {
        var plan = ModelRoutingReadinessPolicy.Analyze(
            "gemini",
            "pro-model",
            "대공사 수준의 아키텍처 마이그레이션을 설계하고 구현 전략을 분석해줘."
        );

        Assert.Equal(ModelRoutingReadinessPolicy.Complex, plan.Complexity);
        Assert.Equal("frontier", plan.RecommendedTier);
        Assert.False(plan.CascadeEligible);
        Assert.Contains("architecture", plan.Signals);
    }

    [Fact]
    public void AnalyzeDoesNotMarkPinnedControlProvidersAsCascadeEligible()
    {
        var plan = ModelRoutingReadinessPolicy.Analyze(
            "codex",
            "gpt-test",
            "요약해줘."
        );

        Assert.Equal(ModelRoutingReadinessPolicy.Simple, plan.Complexity);
        Assert.False(plan.CascadeEligible);
    }
}
