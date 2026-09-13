using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class RealTetrisRequestGateTests
{
    // 리눅스 프로브가 실제로 보낸 문장. 수정 전에는 어휘 폴백이 영어뿐이라 여기서 false 가 나왔고,
    // 그 결과 게임 헤드리스 검증 대신 프로젝트(컴파일/테스트) 검증으로 빠졌다.
    private const string ProbeRequest =
        "pygame 으로 테트리스를 만들어 주세요. 7종 테트로미노, 회전/이동/하드드롭, 줄 삭제와 점수, "
        + "다음 블록 미리보기, 게임오버 처리까지 넣고, 코드는 한 파일에 몰아넣지 말고 "
        + "보드/블록/입력/렌더링/게임루프를 각각 모듈로 나눠 폴더 구조로 정리해 주세요.";

    [Fact]
    public void ProbeTetrisRequestTakesTheInteractiveGamePath()
    {
        CodingTaskSignalResolver.Clear();
        Assert.True(CodingExecutionSafetyPolicy.IsInteractiveProgramObjective(ProbeRequest, "python"));
    }

    [Fact]
    public void ProbeTetrisRequestIsNotHandedToTheModelsOwnRunCommand()
    {
        // 대화형으로 판정되면 모델이 쓴 run 명령(단위 테스트 등)을 최종 검증으로 신뢰하지 않는다.
        CodingTaskSignalResolver.Clear();
        Assert.False(
            CodingExecutionSafetyPolicy.ShouldTrustDeferredVerificationCommand(
                "python",
                ProbeRequest,
                "python3 -m unittest test_game.py"
            )
        );
    }
}
