using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class MultiAgentTraceSnapshotServiceTests
{
    [Fact]
    public void GetSnapshotProjectsAgentBusIntoVisualizationShape()
    {
        var now = DateTimeOffset.Parse("2026-06-04T00:00:00Z");
        var bus = new AgentCommunicationSnapshot(
            new[]
            {
                new AgentCommunicationMessage("m1", "planner-1", "coder-1", "group-a", "run-1", "conv-1", "plan", "작업 계획", "thread-1", now),
                new AgentCommunicationMessage("m2", "reviewer-1", "coder-1", "group-a", "run-1", "conv-1", "critique", "needs review: conflict", "thread-1", now.AddSeconds(1)),
                new AgentCommunicationMessage("m3", "human", "", "group-a", "run-1", "conv-1", "command", "사용자 승인 필요", "thread-1", now.AddSeconds(2))
            },
            new[]
            {
                new AgentBoardEntry("b1", "coder-1", "task", "waiting for review", "run-1", "group-a", "blocked", "high", 1, now, now.AddSeconds(3))
            },
            new[]
            {
                new AgentLifecycleEvent("l1", "coder-1", "run-1", "group-a", "conv-1", "failed", "build failed", now.AddSeconds(4))
            },
            TotalMessages: 3,
            TotalBoardEntries: 1,
            TotalLifecycleEvents: 1,
            SnapshotUtc: now.AddSeconds(5)
        );

        var snapshot = new MultiAgentTraceSnapshotService(new FakeAgentCommunicationService(bus)).GetSnapshot();

        Assert.Equal("ok", snapshot.Status);
        Assert.True(snapshot.ReadOnly);
        Assert.Equal(3, snapshot.MessageCount);
        Assert.Contains(snapshot.Agents, agent => agent.AgentId == "planner-1" && agent.Role == "planner");
        Assert.Contains(snapshot.Agents, agent => agent.AgentId == "coder-1" && agent.Role == "coder" && agent.State == "failed");
        Assert.Contains(snapshot.Agents, agent => agent.AgentId == "reviewer-1" && agent.Role == "reviewer");
        Assert.Contains(snapshot.Agents, agent => agent.AgentId == "human" && agent.Role == "human");
        var thread = Assert.Single(snapshot.Threads);
        Assert.Equal("corr:thread-1", thread.ThreadId);
        Assert.Equal(3, thread.MessageCount);
        Assert.Contains(snapshot.Edges, edge => edge.FromAgentId == "planner-1" && edge.ToAgentId == "coder-1");
        Assert.Contains(snapshot.Edges, edge => edge.FromAgentId == "human" && edge.ToAgentId == "group:group-a");
        Assert.Contains(snapshot.Interventions, item => item.Reason == "group_command");
        Assert.Contains(snapshot.Interventions, item => item.Reason == "lifecycle_failed");
        Assert.Contains(snapshot.Interventions, item => item.Reason == "board_blocked");
    }

    [Fact]
    public void GetSnapshotReportsNoActivityForEmptyAgentBus()
    {
        var now = DateTimeOffset.Parse("2026-06-04T00:00:00Z");
        var bus = new AgentCommunicationSnapshot(
            Array.Empty<AgentCommunicationMessage>(),
            Array.Empty<AgentBoardEntry>(),
            Array.Empty<AgentLifecycleEvent>(),
            TotalMessages: 0,
            TotalBoardEntries: 0,
            TotalLifecycleEvents: 0,
            SnapshotUtc: now
        );

        var snapshot = new MultiAgentTraceSnapshotService(new FakeAgentCommunicationService(bus)).GetSnapshot();

        Assert.Equal("no_activity", snapshot.Status);
        Assert.Empty(snapshot.Agents);
        Assert.Empty(snapshot.Threads);
        Assert.Empty(snapshot.Edges);
        Assert.Empty(snapshot.Interventions);
    }

    private sealed class FakeAgentCommunicationService : IAgentCommunicationApplicationService
    {
        private readonly AgentCommunicationSnapshot _snapshot;

        public FakeAgentCommunicationService(AgentCommunicationSnapshot snapshot)
        {
            _snapshot = snapshot;
        }

        public AgentCommunicationActionResult GetSnapshot(AgentCommunicationQuery? query = null)
        {
            return new AgentCommunicationActionResult(true, "ok", _snapshot);
        }

        public AgentCommunicationActionResult PostMessage(AgentCommunicationPostRequest request)
        {
            throw new NotSupportedException();
        }

        public AgentCommunicationActionResult PutBoard(AgentBoardWriteRequest request)
        {
            throw new NotSupportedException();
        }

        public AgentCommunicationActionResult EmitLifecycle(AgentLifecycleWriteRequest request)
        {
            throw new NotSupportedException();
        }

        public AgentCommunicationActionResult PostGroupCommand(
            string? fromAgentId,
            string? groupId,
            string? runId,
            string? command,
            string? body,
            string? correlationId
        )
        {
            throw new NotSupportedException();
        }
    }
}
