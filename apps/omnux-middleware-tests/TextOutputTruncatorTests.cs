using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class TextOutputTruncatorTests
{
    [Fact]
    public void TruncateWithMin200PassesThroughShortText()
    {
        Assert.Equal("hello", TextOutputTruncator.TruncateWithMin200("hello", 100));
        Assert.Equal("hello", TextOutputTruncator.TruncateWithMin200("hello", 5));
    }

    [Fact]
    public void TruncateWithMin200ClampsLimitUpward()
    {
        var text = new string('a', 250);
        var result = TextOutputTruncator.TruncateWithMin200(text, 100);

        Assert.Equal(new string('a', 200) + "...(truncated)", result);
    }

    [Fact]
    public void TruncateWithMin200AppendsMarkerOnlyWhenOverLimit()
    {
        var text = new string('b', 400);
        var result = TextOutputTruncator.TruncateWithMin200(text, 300);

        Assert.Equal(new string('b', 300) + "...(truncated)", result);
    }

    [Fact]
    public void TruncateWithMin200ReturnsEmptyForNullInput()
    {
        Assert.Equal(string.Empty, TextOutputTruncator.TruncateWithMin200(null!, 100));
    }

    [Fact]
    public void TruncateRawReturnsInputUnchangedForShortOrZeroLimit()
    {
        Assert.Equal("hello", TextOutputTruncator.TruncateRaw("hello", 10));
        Assert.Equal("hello", TextOutputTruncator.TruncateRaw("hello", 0));
        Assert.Equal("hello", TextOutputTruncator.TruncateRaw("hello", -1));
        Assert.Equal(string.Empty, TextOutputTruncator.TruncateRaw(null!, 10));
        Assert.Equal(string.Empty, TextOutputTruncator.TruncateRaw("", 10));
    }

    [Fact]
    public void TruncateRawDoesNotEnforceMinimumLimit()
    {
        var text = new string('c', 50);
        var result = TextOutputTruncator.TruncateRaw(text, 10);

        Assert.Equal("cccccccccc...(truncated)", result);
    }

    [Fact]
    public void TruncateWithEllipsisTrimsInputAndUsesEllipsisMarker()
    {
        Assert.Equal("hello", TextOutputTruncator.TruncateWithEllipsis("  hello  ", 100));

        var text = new string('d', 100);
        var result = TextOutputTruncator.TruncateWithEllipsis(text, 13);
        Assert.Equal(new string('d', 10) + "...", result);
    }

    [Fact]
    public void TruncateWithEllipsisHandlesSmallLimitAndNull()
    {
        Assert.Equal("...", TextOutputTruncator.TruncateWithEllipsis("abcdef", 2));
        Assert.Equal(string.Empty, TextOutputTruncator.TruncateWithEllipsis(null!, 5));
    }

    [Fact]
    public void TruncatePreservingStructureCutsAtStableLineBoundary()
    {
        var text = "{\n"
                   + string.Join("\n", Enumerable.Range(1, 12).Select(index => $"  \"item{index}\": {index},"))
                   + "\n  \"oversized\": \""
                   + new string('x', 400)
                   + "\"\n}";

        var result = TextOutputTruncator.TruncatePreservingStructure(text, 220);

        Assert.Contains("\"item12\": 12,", result);
        Assert.DoesNotContain("\"oversized\"", result);
        Assert.EndsWith("\n...(truncated)", result, StringComparison.Ordinal);
    }

    [Fact]
    public void TruncatePreservingStructureClosesOpenMarkdownFence()
    {
        var text = "draft:\n```ts\nexport function demo() {\n  return \"" + new string('a', 400) + "\";\n}\n```";

        var result = TextOutputTruncator.TruncatePreservingStructure(text, 160);

        Assert.Equal(0, CountFenceMarkers(result) % 2);
        Assert.EndsWith("\n...(truncated)", result, StringComparison.Ordinal);
    }

    [Fact]
    public void DefaultTruncationMarkerExposed()
    {
        Assert.Equal("...(truncated)", TextOutputTruncator.DefaultTruncationMarker);
    }

    private static int CountFenceMarkers(string text)
    {
        var count = 0;
        var index = 0;
        while ((index = text.IndexOf("```", index, StringComparison.Ordinal)) >= 0)
        {
            count += 1;
            index += 3;
        }

        return count;
    }
}
