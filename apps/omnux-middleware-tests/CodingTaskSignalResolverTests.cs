using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

/// <summary>
/// 요청 성격 판정이 "사용자가 친 문장"만 보도록 고정한다. 에이전트 프롬프트 전문이 그대로
/// 들어가면 규칙 문단에 휩쓸려 오판하고, 캐시 키도 실행 경로와 어긋난다.
/// </summary>
public sealed class CodingTaskSignalResolverTests
{
    private const string UserRequest = "파이썬 pygame 으로 창이 뜨는 간단한 게임을 만들어 주세요.";

    private static string BuildAgentObjective(string request)
    {
        return "목표: 사용자의 코딩 요청을 로컬 프로젝트에서 실제로 완성하세요.\n"
            + "모드: 단일 모델 코딩\n"
            + "요구사항:\n"
            + "- 더미 구현, TODO만 남기는 미완성 결과, 가짜 성공 보고 금지\n"
            + "\n"
            + "사용자 요청:\n"
            + request;
    }

    [Fact]
    public void KeyStripsAgentObjectivePreamble()
    {
        var key = CodingTaskSignalResolver.BuildKey(BuildAgentObjective(UserRequest));

        Assert.Equal(UserRequest, key);
    }

    [Fact]
    public void KeyMatchesBetweenObjectiveAndRawUserMessage()
    {
        // 코딩 루프는 프롬프트 전문을, 실행 경로는 대화의 사용자 메시지를 넘긴다.
        var fromObjective = CodingTaskSignalResolver.BuildKey(BuildAgentObjective(UserRequest));
        var fromRawMessage = CodingTaskSignalResolver.BuildKey(UserRequest);

        Assert.Equal(fromObjective, fromRawMessage);
    }

    [Fact]
    public void SignalsSetOnObjectiveAreVisibleFromRawUserMessage()
    {
        CodingTaskSignalResolver.Clear();
        CodingTaskSignalResolver.Set(BuildAgentObjective(UserRequest), new CodingTaskSignals(true, true, true, false));

        var resolved = CodingTaskSignalResolver.TryGet(UserRequest);

        Assert.NotNull(resolved);
        Assert.True(resolved!.Gui);
        Assert.True(resolved.Game);
        CodingTaskSignalResolver.Clear();
    }

    [Fact]
    public void ParsesModelJsonEvenWithSurroundingText()
    {
        var parsed = CodingTaskSignalResolver.TryParse(
            "여기 결과입니다: {\"game\": true, \"gui\": false, \"interactive\": true, \"frontend\": false} 끝",
            out var signals
        );

        Assert.True(parsed);
        Assert.True(signals.Game);
        Assert.False(signals.Gui);
        Assert.True(signals.Interactive);
        Assert.False(signals.Frontend);
    }

    [Fact]
    public void ReturnsNullWhenNothingWasClassified()
    {
        CodingTaskSignalResolver.Clear();

        Assert.Null(CodingTaskSignalResolver.TryGet("한 번도 판정하지 않은 요청"));
    }
}
