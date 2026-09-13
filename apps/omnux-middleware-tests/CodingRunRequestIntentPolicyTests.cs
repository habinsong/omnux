using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class CodingRunRequestIntentPolicyTests
{
    [Theory]
    [InlineData("실행해봐")]
    [InlineData("실행해 줘")]
    [InlineData("한번 돌려봐")]
    [InlineData("지금 실행")]
    [InlineData("게임 실행해줘")]
    [InlineData("run it")]
    public void RunOnlyRequestsAreDetected(string text)
    {
        Assert.True(CodingRunRequestIntentPolicy.LooksLikeRunExistingResultRequest(text));
    }

    [Theory]
    [InlineData("테트리스 만들고 실행까지 해줘")]
    [InlineData("점수 표시 기능 추가하고 실행해줘")]
    [InlineData("실행이 안 되는데 고쳐줘")]
    [InlineData("실행하면 오류가 나")]
    [InlineData("")]
    public void BuildOrFixRequestsAreNotRunOnly(string text)
    {
        // 새로 만들거나 고쳐 달라는 요청을 실행으로 가로채면 사용자는 결과물을 못 받는다.
        Assert.False(CodingRunRequestIntentPolicy.LooksLikeRunExistingResultRequest(text));
    }

    [Fact]
    public void LongRequestsAreNotTreatedAsRunOnly()
    {
        Assert.False(
            CodingRunRequestIntentPolicy.LooksLikeRunExistingResultRequest(
                "이 프로젝트를 실행해서 결과를 확인한 다음 성능 개선 방안을 정리해 주세요"
            )
        );
    }
}
