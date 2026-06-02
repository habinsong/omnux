using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class NaturalCommandResolutionPolicyTests
{
    [Fact]
    public async Task ResolveAsync_ReturnsFirstHighConfidenceCommand()
    {
        var candidates = new[]
        {
            new NaturalCommandInterpretCandidate("gemini", "gemini-model"),
            new NaturalCommandInterpretCandidate("groq", "groq-model")
        };
        var calls = 0;

        var result = await NaturalCommandResolutionPolicy.ResolveAsync(
            candidates,
            "prompt",
            (candidate, _, _) =>
            {
                calls++;
                var json = candidate.Provider == "gemini"
                    ? """{"kind":"command","command":"memory.clear","confidence":0.91,"args":{}}"""
                    : """{"kind":"command","command":"llm.status","confidence":0.95,"args":{}}""";
                return Task.FromResult(json);
            },
            CancellationToken.None
        );

        Assert.NotNull(result);
        Assert.Equal("memory.clear", result!.Command);
        Assert.Equal(1, calls);
    }

    [Fact]
    public async Task ResolveAsync_SkipsFailedCandidatesAndKeepsBestFallback()
    {
        var candidates = new[]
        {
            new NaturalCommandInterpretCandidate("gemini", "gemini-model"),
            new NaturalCommandInterpretCandidate("groq", "groq-model")
        };

        var result = await NaturalCommandResolutionPolicy.ResolveAsync(
            candidates,
            "prompt",
            (candidate, _, _) =>
            {
                if (candidate.Provider == "gemini")
                {
                    throw new InvalidOperationException("provider failed");
                }

                return Task.FromResult("""{"kind":"chat","command":"","confidence":0.88,"args":{}}""");
            },
            CancellationToken.None
        );

        Assert.NotNull(result);
        Assert.Equal("chat", result!.Kind);
        Assert.Equal(0.88d, result.Confidence, 3);
    }
}
