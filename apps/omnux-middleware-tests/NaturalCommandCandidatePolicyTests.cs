using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class NaturalCommandCandidatePolicyTests
{
    [Fact]
    public void BuildNaturalInterpretCandidates_PrefersSnapshotProviderAndReturnsAtMostThree()
    {
        var snapshot = new NaturalCommandLlmPreferenceSnapshot(
            "multi",
            "groq",
            string.Empty,
            "auto",
            string.Empty,
            "gemini",
            "groq-multi",
            "gemini-multi",
            "copilot-multi",
            "cerebras-multi",
            "nvidia-multi",
            "codex-multi"
        );

        var availability = new Dictionary<string, ProviderAvailability>(StringComparer.OrdinalIgnoreCase)
        {
            ["gemini"] = new("gemini", true, "ok", true, true, true, false, true),
            ["groq"] = new("groq", true, "ok", false, true, false, false, true),
            ["nvidia"] = new("nvidia", true, "ok", false, true, false, false, true),
            ["codex"] = new("codex", true, "ok", false, true, false, true, false),
            ["copilot"] = new("copilot", true, "ok", false, true, false, true, false),
            ["cerebras"] = new("cerebras", true, "ok", false, true, false, false, true)
        };

        var candidates = NaturalCommandCandidatePolicy.BuildNaturalInterpretCandidates(
            availability,
            snapshot,
            "구조를 비교해줘",
            (provider, allowAuto) => provider?.Trim().ToLowerInvariant() switch
            {
                "auto" when allowAuto => "auto",
                "none" when allowAuto => "none",
                "nvidia-nim" or "nvidia_nim" or "nim" => "nvidia",
                "gemini" or "groq" or "cerebras" or "nvidia" or "copilot" or "codex" => provider!.Trim().ToLowerInvariant(),
                _ => allowAuto ? "auto" : "groq"
            },
            model => string.IsNullOrWhiteSpace(model) ? null : model.Trim(),
            (_, model) => string.IsNullOrWhiteSpace(model) ? "groq-default" : model.Trim(),
            (provider, model) => string.IsNullOrWhiteSpace(model) ? $"{provider}-default" : model.Trim()
        );

        Assert.NotEmpty(candidates);
        Assert.True(candidates.Count <= 3);
        Assert.Equal("gemini", candidates[0].Provider);
        Assert.Equal("gemini-multi", candidates[0].Model);
    }

    [Fact]
    public void BuildNaturalCommandResolverPrompt_ContainsExpectedCommandGuidance()
    {
        var prompt = NaturalCommandCandidatePolicy.BuildNaturalCommandResolverPrompt("메모리 지워");

        Assert.Contains("omnux 명령 해석기", prompt);
        Assert.Contains("kill.request", prompt);
        Assert.Contains("history.show", prompt);
        Assert.Contains("사용자 입력:", prompt);
    }
}
