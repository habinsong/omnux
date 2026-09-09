using Omnux.Middleware;
using Xunit;

namespace Omnux.Middleware.Tests;

/// <summary>
/// 호출 상태 판정(OBS-03).
/// 오류를 설명하는 정상 답변을 실패로 기록하면 로그 화면의 실패 건수와 비용 집계가 전부 틀어진다.
/// 반대로 제공자가 오류 문장을 응답으로 돌려주는 경로는 실패로 남아야 한다.
/// </summary>
public class ProviderResponseStatusPolicyTests
{
    [Theory]
    [InlineData("groq", "timeout 을 늘리면 exception 이 줄어듭니다. 호출 오류 로그도 확인하세요.")]
    [InlineData("gemini", "응답 시간이 초과되는 경우를 설명드리겠습니다. 보통 네트워크 문제입니다.")]
    [InlineData("codex", "error: 로 시작하는 로그는 대개 무시해도 됩니다.")]
    [InlineData("groq", "Groq 는 빠른 추론으로 알려져 있습니다. 자세히 설명하겠습니다.")]
    public void NormalAnswerIsOk(string provider, string text)
    {
        Assert.Equal(ProviderResponseStatusPolicy.Ok, ProviderResponseStatusPolicy.Resolve(provider, text));
    }

    [Fact]
    public void LongAnswerMentioningFailureLaterIsStillOk()
    {
        // 첫 줄만 본다. 긴 답변의 뒷부분에 실패 표식이 있어도 실패가 아니다.
        var text = "Groq 사용법을 정리했습니다.\n\n자주 보는 문구: \"groq 호출 오류: rate limit\"";
        Assert.Equal(ProviderResponseStatusPolicy.Ok, ProviderResponseStatusPolicy.Resolve("groq", text));
    }

    [Theory]
    [InlineData("groq", "Groq 호출 오류: rate limit exceeded")]
    [InlineData("gemini", "Gemini 웹검색 호출 오류: 503")]
    [InlineData("gemini", "Gemini URL 참조 호출 오류: bad request")]
    [InlineData("codex", "codex 호출 오류: spawn failed")]
    [InlineData("groq", "Groq API 키가 설정되지 않았습니다.")]
    [InlineData("copilot", "Copilot 인증이 필요합니다.")]
    [InlineData("codex", "codex 인증이 필요합니다. 설정 탭에서 OAuth 또는 API Key를 확인하세요.")]
    public void ProviderErrorTextIsError(string provider, string text)
    {
        Assert.Equal(ProviderResponseStatusPolicy.Error, ProviderResponseStatusPolicy.Resolve(provider, text));
    }

    [Theory]
    [InlineData("groq", "현재 Groq 요청 한도를 초과했습니다. 잠시 후 다시 시도하세요.")]
    [InlineData("groq", "Groq 모델 한도에 도달했습니다.")]
    public void GroqQuotaTextIsError(string provider, string text)
    {
        Assert.Equal(ProviderResponseStatusPolicy.Error, ProviderResponseStatusPolicy.Resolve(provider, text));
    }

    [Theory]
    [InlineData("gemini", "Gemini 응답 시간이 초과되었습니다.")]
    [InlineData("codex", "codex 응답 시간이 초과되었습니다.")]
    public void ProviderTimeoutTextIsTimeout(string provider, string text)
    {
        Assert.Equal(ProviderResponseStatusPolicy.Timeout, ProviderResponseStatusPolicy.Resolve(provider, text));
    }

    [Theory]
    [InlineData("groq", "")]
    [InlineData("groq", "   ")]
    [InlineData("groq", "응답이 비어 있습니다. 다시 질문해 주세요.")]
    [InlineData("codex", "codex 응답이 비어 있습니다.")]
    public void EmptyResponseIsEmpty(string provider, string text)
    {
        Assert.Equal(ProviderResponseStatusPolicy.Empty, ProviderResponseStatusPolicy.Resolve(provider, text));
    }

    [Fact]
    public void OtherProviderNameDoesNotTriggerFailure()
    {
        // 제공자가 다르면 그 이름으로 시작하는 문장이 아니다. 실패로 보지 않는다.
        var text = "Groq 호출 오류: rate limit exceeded";
        Assert.Equal(ProviderResponseStatusPolicy.Ok, ProviderResponseStatusPolicy.Resolve("gemini", text));
    }

    [Fact]
    public void MissingProviderNameKeepsOk()
    {
        Assert.Equal(ProviderResponseStatusPolicy.Ok, ProviderResponseStatusPolicy.Resolve("", "호출 오류: 무언가"));
    }
}
