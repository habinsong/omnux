using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class TelegramResponseFormatterPolicyTests
{
    [Fact]
    public void ConvertMarkdownToPlainTextKeepsReadableHeadingsLinksAndCodeFences()
    {
        var normalized = TelegramResponseFormatterPolicy.ConvertMarkdownToPlainText(
            """
            ## 핵심
            - [문서](https://example.com/docs)를 확인하세요.

            ```csharp
            Console.WriteLine("ok");
            ```
            """
        );

        Assert.Contains("핵심", normalized);
        Assert.Contains("- 문서 (https://example.com/docs)를 확인하세요.", normalized);
        Assert.Contains("[코드]", normalized);
        Assert.Contains("""Console.WriteLine("ok");""", normalized);
    }

    [Fact]
    public void ConvertMarkdownToPlainTextPreservesMarkdownTablesWhenRequested()
    {
        var normalized = TelegramResponseFormatterPolicy.ConvertMarkdownToPlainText(
            """
            | 이름 | 값 |
            | --- | --- |
            | **Alpha** | `42` |
            """,
            keepMarkdownTables: true
        );

        Assert.Contains("| 이름 | 값 |", normalized);
        Assert.Contains("| --- | --- |", normalized);
        Assert.Contains("| Alpha | 42 |", normalized);
    }

    [Fact]
    public void FormatSanitizedResponseUsesCharacterLimitAndTruncationMarker()
    {
        var normalized = TelegramResponseFormatterPolicy.FormatSanitizedResponse(
            "1234567890 1234567890",
            maxChars: 10
        );

        Assert.StartsWith("1234567890", normalized);
        Assert.Contains("telegram_response_truncated", normalized);
        Assert.Contains("/handoff", normalized);
        Assert.Contains("데스크톱", normalized);
    }

    [Fact]
    public void FormatSanitizedResponseNormalizesDetachedNumberLines()
    {
        var normalized = TelegramResponseFormatterPolicy.FormatSanitizedResponse(
            """
            1.
            첫 번째 항목

            2.
            두 번째 항목
            """,
            maxChars: 0
        );

        Assert.Contains("1. 첫 번째 항목", normalized);
        Assert.Contains("2. 두 번째 항목", normalized);
    }

    [Fact]
    public void FormatSanitizedResponseSummarizesHeavyDiffLikeOutputBeforeHandoff()
    {
        var diff = string.Join(
            "\n",
            Enumerable.Range(0, 40).Select(index =>
                index % 2 == 0
                    ? $"diff --git a/file{index}.txt b/file{index}.txt"
                    : $"@@ -{index},1 +{index},1 @@")
        );

        var normalized = TelegramResponseFormatterPolicy.FormatSanitizedResponse(
            diff,
            maxChars: 1200
        );

        Assert.Contains("[텔레그램 요약]", normalized);
        Assert.Contains("무거운 결과라 모바일에는 앞부분만 표시합니다.", normalized);
        Assert.Contains("telegram_heavy_output_handoff", normalized);
        Assert.Contains("/handoff", normalized);
    }
}
