using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class RoutineCommandPolicyTests
{
    [Fact]
    public void BuildHelpTextIncludesCoreRoutineCommands()
    {
        var text = RoutineCommandPolicy.BuildHelpText();

        Assert.Contains("[루틴 명령]", text);
        Assert.Contains("/routine create browser --model <model>", text);
        Assert.Contains("/routine delete <routine-id>", text);
    }

    [Theory]
    [InlineData("매일 아침 8시에 뉴스 요약 루틴 만들어줘", true)]
    [InlineData("루틴 등록해줘", true)]
    [InlineData("그냥 요약해줘", false)]
    [InlineData("", false)]
    public void LooksLikeRoutineRequestChecksRepeatAndIntent(string text, bool expected)
    {
        Assert.Equal(expected, RoutineCommandPolicy.LooksLikeRoutineRequest(text));
    }

    [Fact]
    public void FormatExecutionModeLabelMapsKnownModes()
    {
        Assert.Equal("browser_agent", RoutineCommandPolicy.FormatExecutionModeLabel("browser_agent"));
        Assert.Equal("logic_graph", RoutineCommandPolicy.FormatExecutionModeLabel("logic_graph"));
        Assert.Equal("script", RoutineCommandPolicy.FormatExecutionModeLabel("unknown"));
    }

    [Fact]
    public void FormatActionResultIncludesRoutineSummary()
    {
        var result = new RoutineActionResult(
            true,
            "루틴 생성 완료",
            new RoutineSummary(
                "rt-1",
                "테스트",
                "매일 실행",
                "script",
                "script",
                null,
                null,
                null,
                null,
                null,
                false,
                "매일 08:00",
                "auto",
                1,
                15,
                "always",
                true,
                true,
                "2026-06-01 08:00:00",
                "-",
                "ok",
                "output",
                "/tmp/script.py",
                "llm",
                "python",
                "daily",
                null,
                TimeZoneInfo.Local.Id,
                "08:00",
                null,
                Array.Empty<int>(),
                "ok",
                Array.Empty<string>(),
                "run command",
                Array.Empty<RoutineRunSummary>()
            )
        );

        var text = RoutineCommandPolicy.FormatActionResult(result);

        Assert.Contains("루틴 생성 완료", text);
        Assert.Contains("id=rt-1", text);
        Assert.Contains("mode=script", text);
    }

    [Fact]
    public void TryParseBrowserCommandRejectsMissingModel()
    {
        var ok = RoutineCommandPolicy.TryParseBrowserCommand(
            new[] { "요청", "--url", "https://example.com" },
            out var spec,
            out var error
        );

        Assert.False(ok);
        Assert.Equal(string.Empty, spec.Request);
        Assert.Contains("--model <model>", error);
    }

    [Fact]
    public void TryParseBrowserCommandParsesRequestAndOptions()
    {
        var ok = RoutineCommandPolicy.TryParseBrowserCommand(
            new[] { "--provider", "codex", "--model", "gpt-5.4", "--url", "https://example.com", "--tool-profile", "playwright_only", "뉴스", "수집" },
            out var spec,
            out var error
        );

        Assert.True(ok);
        Assert.Equal(string.Empty, error);
        Assert.Equal("뉴스 수집", spec.Request);
        Assert.Equal("codex", spec.Provider);
        Assert.Equal("gpt-5.4", spec.Model);
        Assert.Equal("https://example.com", spec.StartUrl);
        Assert.Equal("playwright_only", spec.ToolProfile);
    }
}
