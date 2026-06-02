using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class TelegramCommandHandoffPolicyTests
{
    [Fact]
    public void ShouldUseCommandHandoffBlocksLargeCommandOutput()
    {
        var output = string.Join('\n', Enumerable.Range(1, 40).Select(index => $"line {index}: output"));

        Assert.True(TelegramCommandHandoffPolicy.ShouldUseCommandHandoff(output));
    }

    [Fact]
    public void ShouldUseCommandHandoffKeepsSmallCommandOutputInline()
    {
        Assert.False(TelegramCommandHandoffPolicy.ShouldUseCommandHandoff("짧은 상태 출력입니다."));
    }

    [Fact]
    public void BuildCommandHandoffTextShowsPreviewActionsAndMarker()
    {
        var output = string.Join('\n', Enumerable.Range(1, 20).Select(index => $"stdout {index}: 매우 긴 출력"));

        var text = TelegramCommandHandoffPolicy.BuildCommandHandoffText(
            "작업 출력",
            "graph=g1 task=t1",
            output,
            new[] { "/task status g1", "/task output g1 t1", "/handoff" },
            previewChars: 120
        );

        Assert.Contains("[작업 출력]", text);
        Assert.Contains("전체 diff/로그/파일/JSON", text);
        Assert.Contains("graph=g1 task=t1", text);
        Assert.Contains("/task status g1", text);
        Assert.Contains("/handoff", text);
        Assert.Contains("telegram_command_output_handoff", text);
        Assert.DoesNotContain("stdout 20", text);
    }
}
