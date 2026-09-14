using Omnux.Middleware;
using Xunit;

namespace Omnux.Middleware.Tests;

public class ProviderHealthStatsTests
{
    private static readonly DateTimeOffset Now = new(2026, 9, 14, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public void 기록이_없으면_주어진_순서를_그대로_유지한다()
    {
        var stats = new ProviderHealthStats();

        var ordered = stats.OrderByHealth(new[] { "gemini", "groq", "deepseek" });

        Assert.Equal(new[] { "gemini", "groq", "deepseek" }, ordered);
    }

    [Fact]
    public void 계속_실패한_제공자는_뒤로_밀린다()
    {
        var stats = new ProviderHealthStats();
        for (var i = 0; i < 5; i++)
        {
            stats.Record("gemini", success: false, elapsedMs: 900, Now);
            stats.Record("groq", success: true, elapsedMs: 1500, Now);
        }

        var ordered = stats.OrderByHealth(new[] { "gemini", "groq" });

        Assert.Equal("groq", ordered[0]);
    }

    [Fact]
    public void 성공률이_같으면_더_빠른_제공자가_앞선다()
    {
        var stats = new ProviderHealthStats();
        for (var i = 0; i < 5; i++)
        {
            stats.Record("gemini", success: true, elapsedMs: 4000, Now);
            stats.Record("groq", success: true, elapsedMs: 800, Now);
        }

        var ordered = stats.OrderByHealth(new[] { "gemini", "groq" });

        Assert.Equal("groq", ordered[0]);
    }

    [Fact]
    public void 한_번_실패해도_계속_성공하면_다시_앞으로_돌아온다()
    {
        var stats = new ProviderHealthStats();
        stats.Record("gemini", success: false, elapsedMs: 500, Now);
        for (var i = 0; i < 12; i++)
        {
            stats.Record("gemini", success: true, elapsedMs: 500, Now);
            stats.Record("groq", success: true, elapsedMs: 2000, Now);
        }

        var ordered = stats.OrderByHealth(new[] { "groq", "gemini" });

        Assert.Equal("gemini", ordered[0]);
    }

    [Fact]
    public void 기록되지_않은_제공자는_통계가_없다()
    {
        var stats = new ProviderHealthStats();
        stats.Record("groq", success: true, elapsedMs: 100, Now);

        Assert.Null(stats.TryGet("gemini"));
        var snapshot = Assert.Single(stats.Snapshot());
        Assert.Equal("groq", snapshot.Provider);
    }
}
