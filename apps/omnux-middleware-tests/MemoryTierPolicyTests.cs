using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class MemoryTierPolicyTests
{
    [Fact]
    public void ResolveTierMapsAgeWindows()
    {
        var now = DateTimeOffset.Parse("2026-06-04T00:00:00Z");

        Assert.Equal(MemoryTierPolicy.Working, MemoryTierPolicy.ResolveTier(now.AddMinutes(-30).ToUnixTimeMilliseconds(), now));
        Assert.Equal(MemoryTierPolicy.ShortTerm, MemoryTierPolicy.ResolveTier(now.AddHours(-2).ToUnixTimeMilliseconds(), now));
        Assert.Equal(MemoryTierPolicy.Episodic, MemoryTierPolicy.ResolveTier(now.AddDays(-2).ToUnixTimeMilliseconds(), now));
        Assert.Equal(MemoryTierPolicy.LongTerm, MemoryTierPolicy.ResolveTier(now.AddDays(-30).ToUnixTimeMilliseconds(), now));
    }

    [Fact]
    public void ApplyTierScoreKeepsLongTermFloor()
    {
        var now = DateTimeOffset.Parse("2026-06-04T00:00:00Z");
        var old = now.AddDays(-365).ToUnixTimeMilliseconds();

        var scored = MemoryTierPolicy.ApplyTierScore(0.8d, MemoryTierPolicy.LongTerm, old, now);

        Assert.True(scored >= 0.8d * 0.62d);
        Assert.True(scored < 0.8d);
    }
}
