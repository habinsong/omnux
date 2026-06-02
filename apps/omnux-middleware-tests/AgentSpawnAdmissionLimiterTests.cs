using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class AgentSpawnAdmissionLimiterTests
{
    [Fact]
    public void TryAcquire_RejectsWhenConcurrencyLimitIsReached()
    {
        var now = DateTimeOffset.Parse("2026-06-02T00:00:00Z");
        var limiter = new AgentSpawnAdmissionLimiter(
            () => now,
            tokenCapacity: 10_000,
            refillTokensPerMinute: 10_000,
            maxConcurrentSpawns: 1,
            elevatedMaxConcurrentSpawns: 1
        );
        var budget = new AgentSpawnBudgetDecision(true, "subagent_standard", null, "ok");

        var first = limiter.TryAcquire(budget, "subagent", "run", 900, 120);
        var second = limiter.TryAcquire(budget, "subagent", "run", 900, 120);

        Assert.True(first.Allowed);
        Assert.False(second.Allowed);
        Assert.Equal("concurrency_limit", second.Reason);
        Assert.Contains("active spawn limit", second.Error);
    }

    [Fact]
    public void TryAcquire_RejectsWhenTokenBucketIsDepleted()
    {
        var now = DateTimeOffset.Parse("2026-06-02T00:00:00Z");
        var limiter = new AgentSpawnAdmissionLimiter(
            () => now,
            tokenCapacity: 2_100,
            refillTokensPerMinute: 1_000,
            maxConcurrentSpawns: 3,
            elevatedMaxConcurrentSpawns: 1
        );
        var budget = new AgentSpawnBudgetDecision(true, "subagent_standard", null, "ok");

        var first = limiter.TryAcquire(budget, "subagent", "run", 900, 120);
        var second = limiter.TryAcquire(budget, "subagent", "run", 900, 120);

        Assert.True(first.Allowed);
        Assert.False(second.Allowed);
        Assert.Equal("token_bucket_depleted", second.Reason);
        Assert.Contains("token bucket depleted", second.Error);
    }

    [Fact]
    public void TryAcquire_RefillsTokensOverTime()
    {
        var now = DateTimeOffset.Parse("2026-06-02T00:00:00Z");
        var limiter = new AgentSpawnAdmissionLimiter(
            () => now,
            tokenCapacity: 1_000,
            refillTokensPerMinute: 1_000,
            maxConcurrentSpawns: 3,
            elevatedMaxConcurrentSpawns: 1
        );
        var budget = new AgentSpawnBudgetDecision(true, "subagent_standard", null, "ok");

        var first = limiter.TryAcquire(budget, "subagent", "run", 60, 120);

        var depleted = limiter.TryAcquire(budget, "subagent", "run", 60, 120);
        now = now.AddMinutes(2);
        var refilled = limiter.TryAcquire(budget, "subagent", "run", 60, 120);

        Assert.True(first.Allowed);
        Assert.False(depleted.Allowed);
        Assert.True(refilled.Allowed);
    }

    [Fact]
    public void TryAcquire_RejectsSecondElevatedSpawnEvenWhenGeneralLaneHasRoom()
    {
        var now = DateTimeOffset.Parse("2026-06-02T00:00:00Z");
        var limiter = new AgentSpawnAdmissionLimiter(
            () => now,
            tokenCapacity: 20_000,
            refillTokensPerMinute: 20_000,
            maxConcurrentSpawns: 3,
            elevatedMaxConcurrentSpawns: 1
        );
        var budget = new AgentSpawnBudgetDecision(true, "acp_run_elevated", null, "ok");

        var first = limiter.TryAcquire(budget, "acp", "run", AgentSpawnBudgetPolicy.DefaultMaxRunTimeoutSeconds + 1, 120);
        var second = limiter.TryAcquire(budget, "acp", "run", AgentSpawnBudgetPolicy.DefaultMaxRunTimeoutSeconds + 1, 120);

        Assert.True(first.Allowed);
        Assert.False(second.Allowed);
        Assert.Equal("elevated_concurrency_limit", second.Reason);
    }
}
