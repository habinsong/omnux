using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class AgentCommunicationApplicationServiceTests
{
    [Fact]
    public void PostMessage_PersistsAndFiltersByTargetAgent()
    {
        using var temp = TestStateDirectory.Create();
        var service = CreateService(temp.Path);

        var result = service.PostMessage(new AgentCommunicationPostRequest(
            "agent-a",
            "agent-b",
            "group-1",
            "run-1",
            "conversation-1",
            "message",
            "분석 완료",
            "corr-1"
        ));

        Assert.True(result.Ok);
        Assert.NotNull(result.MessageItem);
        Assert.Equal("agent-a", result.MessageItem!.FromAgentId);
        Assert.Equal("agent-b", result.MessageItem.ToAgentId);

        var snapshot = service.GetSnapshot(new AgentCommunicationQuery(AgentId: "agent-b")).Snapshot;
        Assert.Single(snapshot.Messages);
        Assert.Equal("분석 완료", snapshot.Messages[0].Body);
        Assert.Empty(service.GetSnapshot(new AgentCommunicationQuery(AgentId: "agent-c")).Snapshot.Messages);
    }

    [Fact]
    public void PutBoard_UpsertsByAgentKeyRunAndGroup()
    {
        using var temp = TestStateDirectory.Create();
        var service = CreateService(temp.Path);

        var first = service.PutBoard(new AgentBoardWriteRequest(
            "agent-a",
            "progress",
            "검색 완료",
            "run-1",
            "group-1",
            "running",
            "normal"
        ));
        var second = service.PutBoard(new AgentBoardWriteRequest(
            "agent-a",
            "progress",
            "검증 완료",
            "run-1",
            "group-1",
            "completed",
            "high"
        ));

        Assert.True(first.Ok);
        Assert.True(second.Ok);
        Assert.NotNull(second.BoardEntry);
        Assert.Equal(2, second.BoardEntry!.Version);
        Assert.Equal("검증 완료", second.BoardEntry.Value);
        Assert.Equal("completed", second.BoardEntry.Status);

        var snapshot = service.GetSnapshot(new AgentCommunicationQuery(GroupId: "group-1", RunId: "run-1")).Snapshot;
        Assert.Single(snapshot.Board);
        Assert.Equal("progress", snapshot.Board[0].Key);
    }

    [Fact]
    public void PostGroupCommand_StoresCommandMessageWithoutExecutingControlAction()
    {
        using var temp = TestStateDirectory.Create();
        var service = CreateService(temp.Path);

        var result = service.PostGroupCommand(
            "parent-agent",
            "group-1",
            "run-1",
            "stop",
            "사용자 요청",
            "corr-stop"
        );

        Assert.True(result.Ok);
        Assert.NotNull(result.MessageItem);
        Assert.Equal("command", result.MessageItem!.Kind);
        Assert.Equal("group-1", result.MessageItem.GroupId);
        Assert.Contains("stop", result.MessageItem.Body);
        Assert.Contains("사용자 요청", result.MessageItem.Body);
    }

    private static AgentCommunicationApplicationService CreateService(string stateDir)
    {
        return new AgentCommunicationApplicationService(
            new FileAgentCommunicationStore(Path.Combine(stateDir, "agent_communication.json")),
            new AuditLogger(Path.Combine(stateDir, "audit.log"))
        );
    }

    private sealed class TestStateDirectory : IDisposable
    {
        private TestStateDirectory(string path)
        {
            Path = path;
        }

        public string Path { get; }

        public static TestStateDirectory Create()
        {
            var path = System.IO.Path.Combine(
                System.IO.Path.GetTempPath(),
                "omnux-agent-communication-tests",
                Guid.NewGuid().ToString("N")
            );
            Directory.CreateDirectory(path);
            return new TestStateDirectory(path);
        }

        public void Dispose()
        {
            try
            {
                if (Directory.Exists(Path))
                {
                    Directory.Delete(Path, recursive: true);
                }
            }
            catch
            {
                // best effort cleanup
            }
        }
    }
}
