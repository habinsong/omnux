using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class CodingInteractiveObjectiveTests
{
    [Theory]
    [InlineData("pygame 으로 테트리스를 만들어 주세요")]
    [InlineData("파이썬으로 벽돌깨기 게임 만들어줘")]
    [InlineData("키보드로 조작하는 슈팅 게임을 만들어 줘")]
    public void KoreanGameRequestsAreInteractive(string objective)
    {
        CodingTaskSignalResolver.Clear();
        Assert.True(CodingExecutionSafetyPolicy.IsInteractiveProgramObjective(objective, "python"));
    }

    [Fact]
    public void PlainScriptRequestIsNotInteractive()
    {
        CodingTaskSignalResolver.Clear();
        Assert.False(
            CodingExecutionSafetyPolicy.IsInteractiveProgramObjective(
                "숫자 리스트의 평균과 중앙값을 구하는 stats.py 를 만들어 주세요",
                "python"
            )
        );
    }

    [Fact]
    public void WrongClassificationDoesNotEraseAnUnmistakableGameRequest()
    {
        // 판정은 LLM 한 번 호출이라 틀릴 수 있다. 틀린 false 가 게임 검증을 지우면
        // 모델이 쓴 단위 테스트가 최종 검증이 되어 실패한다(실측).
        const string objective = "pygame 으로 아주 단순한 벽돌깨기 게임을 만들어 주세요";
        CodingTaskSignalResolver.Clear();
        CodingTaskSignalResolver.Set(objective, CodingTaskSignals.None);
        Assert.True(CodingExecutionSafetyPolicy.IsInteractiveProgramObjective(objective, "python"));
        CodingTaskSignalResolver.Clear();
    }

    [Fact]
    public void ResolvedSignalsStillTurnOnInteractiveForRequestsWithoutKeywords()
    {
        const string objective = "화면에 캐릭터를 띄우고 방향키로 움직이게 해 줘";
        CodingTaskSignalResolver.Clear();
        Assert.False(CodingExecutionSafetyPolicy.IsInteractiveProgramObjective(objective, "python"));
        CodingTaskSignalResolver.Set(objective, new CodingTaskSignals(Game: true, Gui: true, Interactive: true, Frontend: false));
        Assert.True(CodingExecutionSafetyPolicy.IsInteractiveProgramObjective(objective, "python"));
        CodingTaskSignalResolver.Clear();
    }
}
