using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class TelegramCodingHandoffPolicyTests
{
    [Fact]
    public void ShouldUseMobileHandoffBlocksLargeChangedFileSets()
    {
        var result = NewResult(changedFiles: Enumerable.Range(1, 12).Select(index => $"/tmp/run/file{index}.cs").ToArray());

        Assert.True(TelegramCodingHandoffPolicy.ShouldUseMobileHandoff(result));
    }

    [Fact]
    public void ShouldUseMobileHandoffKeepsSmallResultInline()
    {
        var result = NewResult(changedFiles: new[] { "/tmp/run/app.cs" }, summary: "작은 수정입니다.");

        Assert.False(TelegramCodingHandoffPolicy.ShouldUseMobileHandoff(result));
    }

    [Fact]
    public void BuildMobileHandoffTextShowsSummaryAndNextActionsWithoutFullFileList()
    {
        var conversation = NewConversation();
        var result = NewResult(
            changedFiles: Enumerable.Range(1, 14).Select(index => $"/tmp/run/src/file{index}.cs").ToArray(),
            summary: "로그와 diff가 큰 결과입니다. 핵심 변경만 요약합니다."
        );

        var text = TelegramCodingHandoffPolicy.BuildMobileHandoffText(
            conversation,
            result,
            "코딩 실행 완료",
            (provider, model, _) => $"{provider}:{model}",
            mode => mode,
            (root, path) => path.StartsWith(root ?? string.Empty, StringComparison.Ordinal)
                ? path[(root ?? string.Empty).Length..].TrimStart('/')
                : path
        );

        Assert.Contains("코딩 결과가 커서 텔레그램에는 요약만 표시합니다.", text);
        Assert.Contains("/handoff", text);
        Assert.Contains("/coding files", text);
        Assert.Contains("/coding download <번호>", text);
        Assert.Contains("변경 파일: 14개", text);
        Assert.Contains("src/file1.cs", text);
        Assert.DoesNotContain("src/file14.cs", text);
    }

    private static ConversationCodingResultSnapshot NewResult(
        string[]? changedFiles = null,
        string summary = "요약"
    )
    {
        return new ConversationCodingResultSnapshot(
            "single",
            "thread-1",
            "groq",
            "model",
            "csharp",
            summary,
            new CodeExecutionResult(
                "csharp",
                "/tmp/run",
                "Program.cs",
                "dotnet test",
                0,
                "ok",
                string.Empty,
                "ok"
            ),
            Array.Empty<CodingWorkerResultSnapshot>(),
            changedFiles ?? Array.Empty<string>()
        );
    }

    private static ConversationThreadView NewConversation()
    {
        var now = DateTimeOffset.Parse("2026-06-02T00:00:00Z");
        return new ConversationThreadView(
            "thread-1",
            "coding",
            "single",
            "Telegram 코딩",
            "Telegram",
            "코딩",
            new[] { "telegram-coding-link" },
            now,
            now,
            Array.Empty<ConversationMessageView>(),
            Array.Empty<string>(),
            null
        );
    }
}
