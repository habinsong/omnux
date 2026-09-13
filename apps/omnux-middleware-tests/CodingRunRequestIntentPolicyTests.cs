using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class CodingRunRequestIntentPolicyTests
{
    [Theory]
    [InlineData("{\"run_existing\":true}", true)]
    [InlineData("{\"run_existing\":false}", false)]
    [InlineData("생각해보니 실행만 하면 됩니다. {\"run_existing\": true}", true)]
    [InlineData("{\"run_existing\":\"true\"}", true)]
    [InlineData("{\"run_existing\":1}", true)]
    public void ClassificationResponseIsParsed(string response, bool expected)
    {
        Assert.True(CodingRunRequestIntentPolicy.TryParse(response, out var runExisting));
        Assert.Equal(expected, runExisting);
    }

    [Theory]
    [InlineData("")]
    [InlineData("JSON 없이 말로만 답한 경우")]
    [InlineData("{\"other\":true}")]
    public void UnreadableResponseFallsBack(string response)
    {
        Assert.False(CodingRunRequestIntentPolicy.TryParse(response, out _));
    }

    [Fact]
    public void ClassificationPromptCarriesTheRequestAndSchema()
    {
        var prompt = CodingRunRequestIntentPolicy.BuildClassificationPrompt("그거 한번 켜봐");
        Assert.Contains("run_existing", prompt, StringComparison.Ordinal);
        Assert.Contains("그거 한번 켜봐", prompt, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("실행해봐")]
    [InlineData("한번 돌려봐")]
    [InlineData("run it")]
    public void FallbackCatchesCommonRunPhrases(string text)
    {
        // 모델 판정이 실패했을 때만 쓰는 경로다. 여기서 놓쳐도 판정이 정상이면 동작한다.
        Assert.True(CodingRunRequestIntentPolicy.FallbackLooksLikeRunOnlyRequest(text));
    }

    [Theory]
    [InlineData("테트리스 만들고 실행까지 해줘")]
    [InlineData("실행이 안 되는데 고쳐줘")]
    [InlineData("")]
    public void FallbackKeepsBuildAndFixRequestsOnTheBuildPath(string text)
    {
        Assert.False(CodingRunRequestIntentPolicy.FallbackLooksLikeRunOnlyRequest(text));
    }

    [Fact]
    public void LongMessagesSkipTheClassificationCall()
    {
        Assert.False(
            CodingRunRequestIntentPolicy.CouldBeFollowUpRunRequest(
                new string('가', CodingRunRequestIntentPolicy.MaxFollowUpRequestLength + 1)
            )
        );
        Assert.True(CodingRunRequestIntentPolicy.CouldBeFollowUpRunRequest("그거 켜봐"));
    }
}
