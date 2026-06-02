using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class TelegramCodingDownloadPolicyTests
{
    [Fact]
    public void TryResolveChangedFileResolvesOneBasedIndex()
    {
        var result = NewResult(
            "/tmp/omnux-run/src/a.cs",
            "/tmp/omnux-run/src/b.cs"
        );

        var ok = TelegramCodingDownloadPolicy.TryResolveChangedFile(result, "2", out var path, out var displayPath);

        Assert.True(ok);
        Assert.Equal("/tmp/omnux-run/src/b.cs", path);
        Assert.Equal("src/b.cs", displayPath);
    }

    [Fact]
    public void TryResolveChangedFileResolvesRelativePathOnlyFromChangedFiles()
    {
        var result = NewResult(
            "/tmp/omnux-run/src/a.cs",
            "/tmp/omnux-run/src/b.cs"
        );

        var ok = TelegramCodingDownloadPolicy.TryResolveChangedFile(result, "src/a.cs", out var path, out var displayPath);
        var arbitrary = TelegramCodingDownloadPolicy.TryResolveChangedFile(result, "/tmp/omnux-run/src/missing.cs", out _, out _);

        Assert.True(ok);
        Assert.Equal("/tmp/omnux-run/src/a.cs", path);
        Assert.Equal("src/a.cs", displayPath);
        Assert.False(arbitrary);
    }

    [Fact]
    public void ToRelativePathDoesNotTreatSiblingPrefixAsRunDirectory()
    {
        var displayPath = TelegramCodingDownloadPolicy.ToRelativePath("/tmp/run", "/tmp/run2/secret.txt");

        Assert.Equal("/tmp/run2/secret.txt", displayPath);
    }

    [Fact]
    public void BuildSafeDocumentNameFallsBackWhenDisplayPathHasNoFileName()
    {
        var now = DateTimeOffset.Parse("2026-06-02T03:04:05Z");

        var name = TelegramCodingDownloadPolicy.BuildSafeDocumentName("", now);

        Assert.Equal("coding-file-20260602030405.txt", name);
    }

    [Fact]
    public void IsAllowedDocumentSizeKeepsEightMegabyteLimit()
    {
        Assert.True(TelegramCodingDownloadPolicy.IsAllowedDocumentSize(8 * 1024 * 1024));
        Assert.False(TelegramCodingDownloadPolicy.IsAllowedDocumentSize(8 * 1024 * 1024 + 1));
        Assert.False(TelegramCodingDownloadPolicy.IsAllowedDocumentSize(-1));
    }

    private static ConversationCodingResultSnapshot NewResult(params string[] changedFiles)
    {
        return new ConversationCodingResultSnapshot(
            "single",
            "thread-1",
            "groq",
            "model",
            "csharp",
            "요약",
            new CodeExecutionResult(
                "csharp",
                "/tmp/omnux-run",
                "Program.cs",
                "dotnet test",
                0,
                "ok",
                string.Empty,
                "ok"
            ),
            Array.Empty<CodingWorkerResultSnapshot>(),
            changedFiles
        );
    }
}
