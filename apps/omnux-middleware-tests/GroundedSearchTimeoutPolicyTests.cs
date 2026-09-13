using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

/// <summary>
/// 그라운딩 첫 청크 대기 시간을 고정한다. 서버측 검색은 첫 토큰 전에 검색 왕복을 끝내야 해서
/// 일반 생성보다 늦게 시작한다(실측: gemini-3.5-flash 8.6초). 여기가 짧아지면 사용자가 고른
/// 모델이 매번 검색 전용 폴백 모델로 밀려난다.
/// </summary>
public sealed class GroundedSearchTimeoutPolicyTests
{
    [Fact]
    public void FirstChunkBudgetCoversSearchRoundTrip()
    {
        var firstChunk = ProviderTimeoutPolicy.NormalizeGeminiGroundedFirstChunkTimeoutMs(30000);

        Assert.True(firstChunk >= 12000, $"첫 청크 예산이 너무 짧다: {firstChunk}ms");
    }

    [Fact]
    public void FirstChunkBudgetNeverExceedsTotal()
    {
        foreach (var total in new[] { 5000, 8000, 15000, 30000, 60000 })
        {
            var firstChunk = ProviderTimeoutPolicy.NormalizeGeminiGroundedFirstChunkTimeoutMs(total);
            var normalizedTotal = ProviderTimeoutPolicy.NormalizeGeminiGroundedTimeoutMs(total);

            Assert.True(firstChunk <= normalizedTotal, $"total={total} firstChunk={firstChunk}");
            Assert.True(firstChunk >= 3000, $"total={total} firstChunk={firstChunk}");
        }
    }
}
