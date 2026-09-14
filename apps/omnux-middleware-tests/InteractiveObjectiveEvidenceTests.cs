using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class InteractiveObjectiveEvidenceTests
{
    private const string DocumentObjective =
        "REST API 설계 규칙 문서를 만들어 주세요. 리소스 명명, 상태코드, 페이징, 오류 응답 형식, 버전 관리 절을 포함한 마크다운 문서로 정리해 주세요.";

    [Fact]
    public void 문서_요청에는_대화형_근거가_없다()
    {
        Assert.False(CodingExecutionSafetyPolicy.HasInteractiveKeywordEvidence(DocumentObjective, "python"));
        Assert.False(CodingExecutionSafetyPolicy.IsInteractiveProgramObjective(DocumentObjective, "python"));
    }

    [Theory]
    [InlineData("pygame 으로 테트리스 게임 만들어 줘")]
    [InlineData("tkinter 창을 띄우는 계산기 프로그램 만들어 줘")]
    public void 게임_GUI_요청에는_대화형_근거가_있다(string objective)
    {
        Assert.True(CodingExecutionSafetyPolicy.HasInteractiveKeywordEvidence(objective, "python"));
    }

    [Theory]
    [InlineData("bash")]
    [InlineData("html")]
    [InlineData("auto")]
    [InlineData("javascript")]
    public void 언어가_다르게_판정돼도_게임_요청은_근거로_인정한다(string language)
    {
        const string objective = "파이썬으로 숫자 맞히기 게임을 만들어 주세요. 1~50 사이 숫자를 맞힐 때까지 입력을 받고, 위/아래 힌트를 주세요.";

        Assert.True(CodingExecutionSafetyPolicy.HasInteractiveKeywordEvidence(objective, language));
    }

    [Theory]
    [InlineData("bash")]
    [InlineData("html")]
    public void 언어가_달라도_문서_요청은_여전히_근거가_없다(string language)
    {
        Assert.False(CodingExecutionSafetyPolicy.HasInteractiveKeywordEvidence(DocumentObjective, language));
    }
}
