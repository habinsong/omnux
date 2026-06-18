using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class AskIntentPlannerTests
{
    [Fact]
    public void PlanReturnsEmptyForBlankInput()
    {
        var plan = AskIntentPlanner.Plan("   ");
        Assert.False(plan.HasAnyIntent);
        Assert.Equal("none", plan.Summary);
    }

    [Fact]
    public void PlanEnablesRetrievalForNormalQuestion()
    {
        var plan = AskIntentPlanner.Plan("omnux 미디어 위젯 버그 원인 정리해줘");
        Assert.True(plan.AttemptRetrieval);
        Assert.False(plan.SearchConversations);
        Assert.False(plan.IncludeProjectOverview);
        Assert.Empty(plan.ActionSuggestions);
        Assert.Equal("retrieval", plan.Summary);
    }

    [Fact]
    public void PlanEnablesConversationsForRetrospectiveWording()
    {
        var plan = AskIntentPlanner.Plan("저번에 물어본 텔레그램 문제 결론 뭐였지?");
        Assert.True(plan.AttemptRetrieval);
        Assert.True(plan.SearchConversations);
        Assert.Equal("retrieval+conversations", plan.Summary);
    }

    [Fact]
    public void PlanEnablesOverviewForStructuralQuestion()
    {
        var plan = AskIntentPlanner.Plan("이 프로젝트 구조 설명해줘");
        Assert.True(plan.IncludeProjectOverview);
        Assert.Contains("overview", plan.Summary);
    }

    [Fact]
    public void PlanCarriesActionSuggestions()
    {
        var plan = AskIntentPlanner.Plan("매일 아침 9시에 뉴스 요약해줘");
        Assert.Contains(plan.ActionSuggestions, s => s.Kind == "routine");
        Assert.Contains("sugg:routine", plan.Summary);
    }

    [Fact]
    public void PlanGatesConversationAndOverviewBehindRetrieval()
    {
        // 슬래시 명령은 회수 자체가 꺼지므로 하위 게이트도 모두 꺼진다.
        var plan = AskIntentPlanner.Plan("/help 지난번 프로젝트 구조");
        Assert.False(plan.AttemptRetrieval);
        Assert.False(plan.SearchConversations);
        Assert.False(plan.IncludeProjectOverview);
    }

    [Fact]
    public void PlanCarriesNotebookRetrievalIntent()
    {
        var plan = AskIntentPlanner.Plan("내 노트북의 이전 결정을 알려줘");

        Assert.True(plan.IncludeNotebookContext);
        Assert.Null(plan.NotebookAppendRequest);
        Assert.Contains("notebook", plan.Summary);
    }

    [Fact]
    public void PlanCarriesNotebookAppendRequest()
    {
        var plan = AskIntentPlanner.Plan(
            "노트북에 결정으로 기록해: 배포는 카나리 방식으로 진행한다"
        );

        Assert.NotNull(plan.NotebookAppendRequest);
        Assert.Equal("decision", plan.NotebookAppendRequest!.Kind);
        Assert.False(plan.IncludeNotebookContext);
        Assert.Contains("notebook_append", plan.Summary);
    }
}
