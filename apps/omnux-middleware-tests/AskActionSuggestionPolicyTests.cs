using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class AskActionSuggestionPolicyTests
{
    private static IReadOnlyList<AskActionSuggestion> Detect(string input)
    {
        return AskActionSuggestionPolicy.Detect(input);
    }

    [Theory]
    [InlineData("매일 아침 9시에 뉴스 요약해줘")]
    [InlineData("매주 월요일에 주간 보고 정리해줘")]
    [InlineData("저녁마다 오늘 일정 브리핑해줘")]
    [InlineData("8시에 마다 환율 알려줘")]
    [InlineData("정기적으로 서버 상태 체크해줘")]
    public void DetectFindsRoutineIntent(string input)
    {
        var suggestions = Detect(input);
        Assert.Contains(suggestions, s => s.Kind == "routine");
    }

    [Theory]
    [InlineData("X 기능 출시 계획 세워줘")]
    [InlineData("이 작업 단계별로 나눠줘")]
    [InlineData("프로젝트 로드맵 만들어줘")]
    [InlineData("할 일 목록으로 정리해줘")]
    public void DetectFindsPlanIntent(string input)
    {
        var suggestions = Detect(input);
        Assert.Contains(suggestions, s => s.Kind == "plan");
    }

    [Theory]
    [InlineData("이 작업 백그라운드로 돌려놔")]
    [InlineData("리팩토링 에이전트한테 맡겨줘")]
    [InlineData("테스트 정리 알아서 해놔")]
    public void DetectFindsAgentIntent(string input)
    {
        var suggestions = Detect(input);
        Assert.Contains(suggestions, s => s.Kind == "agent");
    }

    [Theory]
    [InlineData("오늘 비트코인 시세 어때?")]
    [InlineData("매일경제 오늘 헤드라인 알려줘")]
    [InlineData("이 코드 버그 원인 설명해줘")]
    [InlineData("/help")]
    [InlineData("안녕")]
    [InlineData("")]
    public void DetectStaysQuietForNormalQuestions(string input)
    {
        Assert.Empty(Detect(input));
    }

    [Fact]
    public void DetectCapsSuggestionsAtTwoWithPriorityOrder()
    {
        // 루틴+에이전트+계획 신호가 모두 있어도 최대 2개, 루틴 > 에이전트 우선.
        var suggestions = Detect("매일 아침 9시에 리포트 정리해줘. 백그라운드로 돌려놔도 되고, 계획 세워줘도 좋아");
        Assert.Equal(AskActionSuggestionPolicy.MaxSuggestions, suggestions.Count);
        Assert.Equal("routine", suggestions[0].Kind);
        Assert.Equal("agent", suggestions[1].Kind);
    }

    [Fact]
    public void DetectCapsPromptLength()
    {
        var longTail = new string('가', AskActionSuggestionPolicy.PromptMaxChars + 100);
        var suggestions = Detect($"계획 세워줘 {longTail}");
        Assert.Single(suggestions);
        Assert.Equal(AskActionSuggestionPolicy.PromptMaxChars, suggestions[0].Prompt.Length);
    }

    [Theory]
    [InlineData(null, false)]
    [InlineData("", false)]
    [InlineData("1", false)]
    [InlineData("0", true)]
    [InlineData("off", true)]
    public void IsDisabledValueParsesEnvSemantics(string? raw, bool expected)
    {
        Assert.Equal(expected, AskActionSuggestionPolicy.IsDisabledValue(raw));
    }
}
