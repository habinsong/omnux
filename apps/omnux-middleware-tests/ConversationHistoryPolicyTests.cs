using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class ConversationHistoryPolicyTests
{
    [Fact]
    public void ParseHistoryMessagesKeepsMultilineMessageBodies()
    {
        var messages = ConversationHistoryPolicy.ParseHistoryMessages(
            """
            [user] 첫 질문
            이어지는 줄
            [assistant] 첫 답변
            답변 세부 내용
            """
        );

        Assert.Equal(2, messages.Count);
        Assert.Equal("user", messages[0].Role);
        Assert.Equal("첫 질문\n이어지는 줄", messages[0].Text);
        Assert.Equal("assistant", messages[1].Role);
        Assert.Equal("첫 답변\n답변 세부 내용", messages[1].Text);
    }

    [Fact]
    public void TrimContextHistoryKeepsMostRecentMessagesWithinBudget()
    {
        var history = string.Join(
            '\n',
            "[user] 오래된 질문입니다",
            "[assistant] 오래된 답변입니다",
            "[user] 최근 질문입니다",
            "[assistant] 최근 답변입니다"
        );

        var trimmed = ConversationHistoryPolicy.TrimContextHistory(history, 60);

        Assert.DoesNotContain("오래된 질문", trimmed);
        Assert.Contains("최근 답변", trimmed);
    }

    [Fact]
    public void BuildBudgetedContextHistorySeparatesOlderSummaryAndRecentTurns()
    {
        var history = string.Join(
            '\n',
            "[user] 요구사항: 텔레그램 응답을 줄여줘",
            "[assistant] 설정 파일을 수정했습니다",
            "[user] 두 번째 질문",
            "[assistant] 두 번째 답변",
            "[user] 세 번째 질문",
            "[assistant] 세 번째 답변"
        );

        var budgeted = ConversationHistoryPolicy.BuildBudgetedContextHistory(history, 2000);

        Assert.Contains("[이전 대화 압축]", budgeted);
        Assert.Contains("요구사항", budgeted);
        Assert.Contains("[최근 턴]", budgeted);
        Assert.Contains("세 번째 답변", budgeted);
    }

    [Fact]
    public void BuildMessageLevelSummaryKeepsEveryOlderMessageWithinBudget()
    {
        // 예전에는 낱말 목록에 안 걸리는 메시지를 버려서 이름·버전 같은 사실이 사라졌다.
        var summary = ConversationHistoryPolicy.BuildMessageLevelSummary(
            new[]
            {
                (Role: "user", Text: "내 이름은 하빈이야"),
                (Role: "assistant", Text: "기억하겠습니다"),
                (Role: "user", Text: "잡담 셋")
            },
            2000
        );

        Assert.Contains("하빈", summary);
        Assert.Contains("기억하겠습니다", summary);
        Assert.Contains("잡담 셋", summary);
    }

    [Fact]
    public void BuildMessageLevelSummaryDropsOldestWhenBudgetRunsOut()
    {
        var summary = ConversationHistoryPolicy.BuildMessageLevelSummary(
            new[]
            {
                (Role: "user", Text: new string('가', 300)),
                (Role: "assistant", Text: new string('나', 300)),
                (Role: "user", Text: "마지막 메시지")
            },
            360
        );

        Assert.Contains("마지막 메시지", summary);
        Assert.Contains("생략", summary);
        Assert.DoesNotContain(new string('가', 300), summary);
    }
}
