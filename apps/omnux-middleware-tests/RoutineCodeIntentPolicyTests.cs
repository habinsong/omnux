using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class RoutineCodeIntentPolicyTests
{
    [Theory]
    [InlineData("결과를 report.csv 로 저장해 줘")]
    [InlineData("매일 로그를 파일로 남겨 줘")]
    [InlineData("자료를 다운로드해서 정리해 줘")]
    [InlineData("결과를 summary.json 으로 만들어 줘")]
    public void SaveIntentRequestsNeedFileOutput(string request)
    {
        Assert.True(RoutineCodeIntentPolicy.RequiresFileOutputLogic(request));
    }

    [Theory]
    [InlineData("workspace 안에 파일이 몇 개인지 세고 확장자별 개수를 표로 출력해 줘")]
    [InlineData("홈 디렉터리 디스크 사용량을 df -h 로 확인해서 알려줘")]
    [InlineData("파이썬 최신 안정 버전을 웹에서 확인해서 알려줘")]
    [InlineData("")]
    public void ReadOnlyRequestsDoNotNeedFileOutput(string request)
    {
        // "파일"이 들어갔다고 파일 쓰기를 강요하면 읽기만 하는 루틴이 생성 단계에서 실패한다.
        Assert.False(RoutineCodeIntentPolicy.RequiresFileOutputLogic(request));
    }
}
