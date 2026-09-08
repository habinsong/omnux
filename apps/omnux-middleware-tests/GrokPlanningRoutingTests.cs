using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class GrokPlanningRoutingTests
{
    [Fact]
    public async Task ExistingHigherPriorityProviderDoesNotStartTheGrokCli()
    {
        var root = Path.Combine(Path.GetTempPath(), $"omnux-grok-route-{Guid.NewGuid():N}");
        var config = new AppConfig { GroqApiKey = "fixture", GroqModel = "groq-fixture", LlmUsageStatePath = Path.Combine(root, "usage.json"), DashboardAccessStatePath = Path.Combine(root, "access.json") };
        using var grok = new GrokCliClient("unused", (_, _, _) => throw new InvalidOperationException("Grok should not be queried"));
        using var router = new LlmRouter(config.Providers, config.Paths, config.Context, new RuntimeSettings(config), grokClient: grok);
        var route = await router.ResolvePlanningRouteAsync("planner", new[] { "groq", "grok" }, CancellationToken.None);
        Assert.Equal("planner:groq:groq-fixture", route);
    }

    [Fact]
    public async Task OAuthProviderCanBeSelectedForPlanningAndReviewWithoutInference()
    {
        var root = Path.Combine(Path.GetTempPath(), $"omnux-grok-route-{Guid.NewGuid():N}");
        var config = new AppConfig { LlmUsageStatePath = Path.Combine(root, "usage.json"), DashboardAccessStatePath = Path.Combine(root, "access.json") };
        using var grok = new GrokCliClient("unused", (info, _, _) => {
            Assert.DoesNotContain("--prompt-file", info.ArgumentList);
            return Task.FromResult(new GrokCliProcessResult(0, "You are logged in with auth.x.ai.", ""));
        });
        using var router = new LlmRouter(config.Providers, config.Paths, config.Context, new RuntimeSettings(config), grokClient: grok);
        Assert.Equal("planner:grok:grok-4.6", await router.ResolvePlanningRouteAsync("planner", new[] { "grok" }, CancellationToken.None));
        Assert.Equal("reviewer:grok:grok-4.6", await router.ResolvePlanningRouteAsync("reviewer", new[] { "grok" }, CancellationToken.None));
    }
}
