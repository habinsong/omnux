using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class NaturalCommandValidationPolicyTests
{
    [Theory]
    [InlineData("추론모드와 스킬 꺼", true)]
    [InlineData("/llm status", false)]
    [InlineData("그냥 안녕", false)]
    public void ShouldAttemptNaturalCommandInterpretation_FollowsExplicitIntent(string input, bool expected)
    {
        Assert.Equal(expected, NaturalCommandValidationPolicy.ShouldAttemptNaturalCommandInterpretation(input));
    }

    [Theory]
    [InlineData("프로세스 12345 종료", true)]
    [InlineData("pid 99 중지", true)]
    [InlineData("프로세스 관리", false)]
    public void LooksLikeNaturalKillIntent_DetectsKillPatterns(string input, bool expected)
    {
        Assert.Equal(expected, NaturalCommandValidationPolicy.LooksLikeNaturalKillIntent(input));
    }

    [Theory]
    [InlineData("memory", "memory.clear")]
    [InlineData("help", "help.show")]
    [InlineData("kill", "kill.request")]
    public void NormalizeNaturalCommandKey_NormalizesLegacyKeys(string input, string expected)
    {
        Assert.Equal(expected, NaturalCommandValidationPolicy.NormalizeNaturalCommandKey(input));
    }

    [Theory]
    [InlineData("single", "single")]
    [InlineData("오케스트레이션", "orchestration")]
    [InlineData("다중", "multi")]
    [InlineData("unknown", "")]
    public void NormalizeCodingNaturalMode_NormalizesCodingMode(string input, string expected)
    {
        Assert.Equal(expected, NaturalCommandValidationPolicy.NormalizeCodingNaturalMode(input));
    }

    [Fact]
    public void ValidateNaturalCommandInterpretation_RejectsLowConfidenceCommand()
    {
        var interpretation = new NaturalCommandInterpretation(
            "command",
            "memory",
            new Dictionary<string, string>(),
            0.1d,
            string.Empty
        );

        var result = NaturalCommandValidationPolicy.ValidateNaturalCommandInterpretation("telegram", interpretation, "메모리 지워");

        Assert.False(result.Valid);
        Assert.Equal("low_confidence", result.Code);
    }

    [Fact]
    public void ValidateNaturalCommandInterpretation_MapsHelpIntent()
    {
        var interpretation = new NaturalCommandInterpretation(
            "command",
            "help",
            new Dictionary<string, string> { ["topic"] = "llm" },
            0.9d,
            string.Empty
        );

        var result = NaturalCommandValidationPolicy.ValidateNaturalCommandInterpretation("telegram", interpretation, "도움말 llm");

        Assert.True(result.Valid);
        Assert.Equal("/help llm", result.Canonical?.SlashCommand);
    }
}
