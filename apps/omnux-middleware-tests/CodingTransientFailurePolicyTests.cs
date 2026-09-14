using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class CodingTransientFailurePolicyTests
{
    [Theory]
    [InlineData("Groq 요청 실패: 503 — upstream error")]
    [InlineData("Gemini 요청 실패: 502")]
    [InlineData("DeepSeek 요청 실패: 504")]
    [InlineData("NVIDIA NIM 서버가 일시적으로 불안정합니다 (503). 잠시 후 다시 시도해 주세요.")]
    [InlineData("DeepSeek 요청 실패: 500 — The model is overloaded")]
    public void 일시_장애는_따로_분류한다(string text)
    {
        Assert.Equal(CodingProviderFailureKind.Transient, CodingProviderFailurePolicy.Classify(text));
    }

    [Fact]
    public void 일시_장애는_다른_모델로_넘긴다()
    {
        Assert.True(CodingProviderFailurePolicy.ShouldFallOverToAnotherModel(CodingProviderFailureKind.Transient));
        Assert.True(CodingProviderFailurePolicy.ShouldFallOverToAnotherModel(CodingProviderFailureKind.RateLimited));
    }

    [Fact]
    public void 키_문제와_잘못된_요청은_다른_모델로_넘기지_않는다()
    {
        Assert.False(CodingProviderFailurePolicy.ShouldFallOverToAnotherModel(CodingProviderFailureKind.Auth));
        Assert.False(CodingProviderFailurePolicy.ShouldFallOverToAnotherModel(CodingProviderFailureKind.Other));
        Assert.False(CodingProviderFailurePolicy.ShouldFallOverToAnotherModel(CodingProviderFailureKind.None));
    }

    [Fact]
    public void 한도_문구는_여전히_한도로_분류한다()
    {
        Assert.Equal(
            CodingProviderFailureKind.RateLimited,
            CodingProviderFailurePolicy.Classify("Groq rate limit (429). 잠시 후 다시 시도해 주세요.")
        );
    }

    [Fact]
    public void 일시_장애_안내문에는_다시_시도하라고_적는다()
    {
        var message = CodingProviderFailurePolicy.BuildUserMessage(
            "groq",
            "openai/gpt-oss-120b",
            CodingProviderFailureKind.Transient
        );

        Assert.Contains("잠시 응답하지 못했습니다", message);
    }
}
