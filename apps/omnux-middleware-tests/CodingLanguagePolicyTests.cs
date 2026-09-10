using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class CodingLanguagePolicyTests
{
    [Theory]
    [InlineData("py", "python")]
    [InlineData("python3", "python")]
    [InlineData("node", "javascript")]
    [InlineData("tsx", "typescript")]
    [InlineData("react_vite", "react-vite")]
    [InlineData("c#", "csharp")]
    [InlineData("", "auto")]
    public void NormalizeLanguageForCodeMapsAliases(string input, string expected)
    {
        Assert.Equal(expected, CodingLanguagePolicy.NormalizeLanguageForCode(input));
    }

    [Theory]
    [InlineData(null, "auto")]
    [InlineData("auto", "auto")]
    [InlineData("TS", "typescript")]
    public void NormalizeCodingLanguageHintPreservingAutoKeepsAuto(string? input, string expected)
    {
        Assert.Equal(expected, CodingLanguagePolicy.NormalizeCodingLanguageHintPreservingAuto(input));
    }

    [Theory]
    [InlineData("write a python app", "python")]
    [InlineData("React Vite 화면 구현", "react-vite")]
    [InlineData("javascript CLI", "javascript")]
    [InlineData("spring example", "java")]
    [InlineData("create main.py", "python")]
    [InlineData("src/App.tsx screen", "typescript")]
    public void ResolveExplicitObjectiveLanguageDetectsRequestedLanguage(string objective, string expected)
    {
        Assert.Equal(expected, CodingLanguagePolicy.ResolveExplicitObjectiveLanguage(objective));
    }

    [Fact]
    public void ResolveInitialCodingLanguagePrefersExplicitHint()
    {
        Assert.Equal(
            "typescript",
            CodingLanguagePolicy.ResolveInitialCodingLanguage("ts", "write a python app")
        );
    }

    [Theory]
    [InlineData("rust CLI", "rust")]
    [InlineData("no language hint here", "auto")]
    public void ResolveInitialCodingLanguageFallsBackToObjectiveSignals(string objective, string expected)
    {
        Assert.Equal(expected, CodingLanguagePolicy.ResolveInitialCodingLanguage("auto", objective));
    }

    [Fact]
    public void ResolveExplicitObjectiveLanguageUsesPathNotTranslatedLanguageNames()
    {
        Assert.Equal("python", CodingLanguagePolicy.ResolveExplicitObjectiveLanguage("main.py에 프로그램을 만들어줘"));
        Assert.Equal(string.Empty, CodingLanguagePolicy.ResolveExplicitObjectiveLanguage("파이썬으로 만들어줘"));
    }

    [Theory]
    [InlineData("src/App.tsx", "auto", "typescript")]
    [InlineData("main.py", "auto", "python")]
    [InlineData("view.svelte", "auto", "html")]
    [InlineData("README.md", "auto", "auto")]
    public void GuessLanguageFromPathUsesExtension(string path, string fallback, string expected)
    {
        Assert.Equal(expected, CodingLanguagePolicy.GuessLanguageFromPath(path, fallback));
    }

    [Fact]
    public void ResolveFinalResultLanguageKeepsHtmlForWebObjective()
    {
        var language = CodingLanguagePolicy.ResolveFinalResultLanguage(
            "javascript",
            "auto",
            "html/css/js page",
            new[] { "/tmp/work/script.js" }
        );

        Assert.Equal("html", language);
    }

    [Fact]
    public void ResolveFinalResultLanguagePromotesJavascriptWhenHtmlFileWasWritten()
    {
        var language = CodingLanguagePolicy.ResolveFinalResultLanguage(
            "javascript",
            "auto",
            "브라우저 스크립트 만들어줘",
            new[] { "/tmp/work/index.html", "/tmp/work/script.js" }
        );

        Assert.Equal("html", language);
    }

    [Fact]
    public void ExtractLatestCodingRequestTextKeepsLastNewRequestBlock()
    {
        var text = CodingLanguagePolicy.ExtractLatestCodingRequestText(
            """
            [최근 대화]
            이전 요청

            [새 요청]
            React 화면 만들어줘
            [로컬 시간]
            now
            """
        );

        Assert.Equal("React 화면 만들어줘", text);
    }
}
