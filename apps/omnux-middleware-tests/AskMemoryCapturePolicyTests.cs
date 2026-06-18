using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class AskMemoryCapturePolicyTests
{
    [Theory]
    [InlineData("앞으로 답변은 반말로 해줘. 기억해")]
    [InlineData("기본 모델은 groq 로 정하자")]
    [InlineData("내 이름은 하빈이야, 잊지 마")]
    [InlineData("나는 마크다운 표 싫어하니까 항상 불릿으로 정리해줘")]
    [InlineData("규칙: 커밋 메시지는 한국어로 통일하자")]
    public void GateAcceptsDurablePreferenceOrDecision(string input)
    {
        Assert.True(AskMemoryCapturePolicy.LooksLikeMemorableUserInput(input));
    }

    [Theory]
    [InlineData("오늘 비트코인 시세 알려줘")]
    [InlineData("이 코드 버그 원인 설명해줘")]
    [InlineData("HTTP 413 에러가 뭐야?")]
    [InlineData("/help")]
    [InlineData("짧음")]
    [InlineData("")]
    public void GateRejectsOneOffQuestions(string input)
    {
        Assert.False(AskMemoryCapturePolicy.LooksLikeMemorableUserInput(input));
    }

    [Fact]
    public void TryParseExtractionAcceptsPlainJson()
    {
        var parsed = AskMemoryCapturePolicy.TryParseExtraction(
            """{"memorable": true, "title": "답변 말투 규칙", "fact": "사용자는 반말 답변을 선호한다."}"""
        );
        Assert.NotNull(parsed);
        Assert.True(parsed!.Memorable);
        Assert.Equal("답변 말투 규칙", parsed.Title);
        Assert.Contains("반말", parsed.Fact);
    }

    [Fact]
    public void TryParseExtractionAcceptsFencedJsonWithNoise()
    {
        var parsed = AskMemoryCapturePolicy.TryParseExtraction(
            "다음과 같습니다.\n```json\n{\"memorable\": true, \"title\": \"기본 모델 결정\", \"fact\": \"기본 provider 는 groq 로 정했다.\"}\n```"
        );
        Assert.NotNull(parsed);
        Assert.True(parsed!.Memorable);
        Assert.Equal("기본 모델 결정", parsed.Title);
    }

    [Fact]
    public void TryParseExtractionReturnsNotMemorable()
    {
        var parsed = AskMemoryCapturePolicy.TryParseExtraction(
            """{"memorable": false, "title": "", "fact": ""}"""
        );
        Assert.NotNull(parsed);
        Assert.False(parsed!.Memorable);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("json 아님")]
    [InlineData("""{"title": "x"}""")]
    [InlineData("""{"memorable": true, "title": "짧", "fact": "사실은 충분히 길다아아아"}""")]
    [InlineData("""{"memorable": true, "title": "제목은 적당", "fact": "짧음"}""")]
    public void TryParseExtractionRejectsInvalid(string? output)
    {
        Assert.Null(AskMemoryCapturePolicy.TryParseExtraction(output));
    }

    [Fact]
    public void TryParseExtractionCapsLongFields()
    {
        var longTitle = new string('가', AskMemoryCapturePolicy.TitleMaxChars + 30);
        var longFact = new string('나', AskMemoryCapturePolicy.FactMaxChars + 100);
        var parsed = AskMemoryCapturePolicy.TryParseExtraction(
            $$"""{"memorable": true, "title": "{{longTitle}}", "fact": "{{longFact}}"}"""
        );
        Assert.NotNull(parsed);
        Assert.True(parsed!.Title.Length <= AskMemoryCapturePolicy.TitleMaxChars);
        Assert.True(parsed.Fact.Length <= AskMemoryCapturePolicy.FactMaxChars + 1);
    }

    [Theory]
    [InlineData("답변 말투 규칙", "답변말투규칙")]
    [InlineData("답변말투 규칙!", "답변말투규칙")]
    [InlineData("Default Model 결정", "defaultmodel결정")]
    public void NormalizeTitleKeyCollapsesTokens(string title, string expected)
    {
        Assert.Equal(expected, AskMemoryCapturePolicy.NormalizeTitleKey(title));
    }

    [Fact]
    public void BuildExtractionPromptIncludesUserAndAssistant()
    {
        var prompt = AskMemoryCapturePolicy.BuildExtractionPrompt("앞으로 반말로 해줘", "알겠어!");
        Assert.Contains("[사용자 발화]", prompt);
        Assert.Contains("앞으로 반말로 해줘", prompt);
        Assert.Contains("[직전 어시스턴트 답변 일부]", prompt);
        Assert.Contains("memorable", prompt);
    }

    [Theory]
    [InlineData(null, false)]
    [InlineData("1", false)]
    [InlineData("0", true)]
    [InlineData("off", true)]
    public void IsDisabledValueParsesEnvSemantics(string? raw, bool expected)
    {
        Assert.Equal(expected, AskMemoryCapturePolicy.IsDisabledValue(raw));
    }
}
