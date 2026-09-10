using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class CodingExpectedOutputPolicyTests
{
    [Fact]
    public void ExtractExpectedConsoleOutputLinesKeepsExplicitFirstAndSecondLineOrder()
    {
        var lines = CodingExpectedOutputPolicy.ExtractExpectedConsoleOutputLines(
            """
            first line is "alpha"
            second line is "beta"
            """
        );

        Assert.Equal(new[] { "alpha", "beta" }, lines);
    }

    [Fact]
    public void ExtractExpectedConsoleOutputLinesParsesInlineOrderedLabels()
    {
        var lines = CodingExpectedOutputPolicy.ExtractExpectedConsoleOutputLines(
            "first line should be `ready` and second line should be `done`"
        );

        Assert.Equal(new[] { "ready", "done" }, lines);
    }

    [Fact]
    public void ExtractExpectedConsoleOutputLinesFallsBackToStdoutLineQuotedLiterals()
    {
        var lines = CodingExpectedOutputPolicy.ExtractExpectedConsoleOutputLines(
            "stdout must include \"token\" and \"checksum\""
        );

        Assert.Equal(new[] { "token", "checksum" }, lines);
    }

    [Fact]
    public void ExtractExpectedConsoleOutputLinesUsesLastNewRequestBlock()
    {
        var lines = CodingExpectedOutputPolicy.ExtractExpectedConsoleOutputLines(
            """
            [최근 대화]
            stdout "old"

            [새 요청]
            stdout "new"
            [로컬 시간]
            now
            """
        );

        Assert.Equal(new[] { "new" }, lines);
    }

    [Fact]
    public void LooksLikeStdoutVerificationRequestUsesStdoutCuesNotTranslatedVerbs()
    {
        Assert.True(CodingExpectedOutputPolicy.LooksLikeStdoutVerificationRequest("print 'ok' in main.py"));
        Assert.True(CodingExpectedOutputPolicy.LooksLikeStdoutVerificationRequest("run the program"));
        Assert.False(CodingExpectedOutputPolicy.LooksLikeStdoutVerificationRequest("실행해서 확인해줘"));
    }

    [Fact]
    public void ExtractVisibleTextRequirementLiteralsReadsVisibleTextLine()
    {
        var lines = CodingExpectedOutputPolicy.ExtractVisibleTextRequirementLiterals(
            """
            visible text "Dashboard Ready"
            stdout "ignored"
            """
        );

        Assert.Equal(new[] { "Dashboard Ready" }, lines);
    }

    [Theory]
    [InlineData("first line", 0)]
    [InlineData("second line", 1)]
    [InlineData("third line", -1)]
    public void ResolveExpectedOutputLineIndexMapsKnownLabels(string label, int expected)
    {
        Assert.Equal(expected, CodingExpectedOutputPolicy.ResolveExpectedOutputLineIndex(label));
    }
}
