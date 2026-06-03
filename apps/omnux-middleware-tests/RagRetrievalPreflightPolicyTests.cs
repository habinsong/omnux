using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class RagRetrievalPreflightPolicyTests
{
    [Fact]
    public void EvaluateRecommendsWebForFreshQueries()
    {
        var snapshot = CreatePolicy().Evaluate("오늘 NVIDIA 최신 뉴스 알려줘");

        Assert.Equal("retrieval_recommended", snapshot.Status);
        Assert.True(snapshot.ReadOnly);
        Assert.True(snapshot.RetrievalRecommended);
        Assert.Equal("web", snapshot.PrimaryStrategy);
        Assert.Contains("current_or_fresh", snapshot.Signals);
        Assert.Contains(snapshot.Candidates, candidate =>
            candidate.Kind == "web" && candidate.Priority == "high" && candidate.SuggestedRequestType == "web_search");
        Assert.Contains(snapshot.Skipped, item => item == "llm_self_rag_judge");
    }

    [Fact]
    public void EvaluateRecommendsCodeAndRepomapForCodeQueries()
    {
        var snapshot = CreatePolicy().Evaluate("apps/omnux-middleware/src/WebSocketGateway.cs 에러 구현 위치 찾아줘");

        Assert.Equal("retrieval_recommended", snapshot.Status);
        Assert.Equal("hybrid", snapshot.PrimaryStrategy);
        Assert.Contains("code_or_file", snapshot.Signals);
        Assert.Contains(snapshot.Candidates, candidate => candidate.Kind == "code" && candidate.SuggestedRequestType == "memory_search");
        Assert.Contains(snapshot.Candidates, candidate => candidate.Kind == "repomap" && candidate.SuggestedRequestType == "code_repomap_snapshot_get");
    }

    [Fact]
    public void EvaluateRecommendsMemoryForPriorDecisionQueries()
    {
        var snapshot = CreatePolicy().Evaluate("전에 우리가 결정한 MCP 보류 사유 기억나?");

        Assert.Equal("retrieval_recommended", snapshot.Status);
        Assert.Equal("memory", snapshot.PrimaryStrategy);
        Assert.Contains("memory_or_history", snapshot.Signals);
        Assert.Contains(snapshot.Candidates, candidate => candidate.Kind == "memory" && candidate.Priority == "high");
    }

    [Fact]
    public void EvaluateSkipsRetrievalForSmallTalk()
    {
        var snapshot = CreatePolicy().Evaluate("고마워");

        Assert.Equal("no_retrieval", snapshot.Status);
        Assert.False(snapshot.RetrievalRecommended);
        Assert.Equal("none", snapshot.PrimaryStrategy);
        Assert.Contains(snapshot.Candidates, candidate => candidate.Kind == "none" && candidate.Recommended);
    }

    private static RagRetrievalPreflightPolicy CreatePolicy()
    {
        return new RagRetrievalPreflightPolicy(
            () => DateTimeOffset.Parse("2026-06-04T00:00:00Z")
        );
    }
}
