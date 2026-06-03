using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class SessionReplayApplicationServiceTests
{
    [Fact]
    public void GetReplay_MergesConversationTelemetryAndAgentEvents()
    {
        using var temp = TestStateDirectory.Create();
        var conversationStore = new ConversationStore(Path.Combine(temp.Path, "conversations.json"));
        var telemetryTracer = new TelemetryTracer(new FileTelemetryTraceStore(Path.Combine(temp.Path, "telemetry.json")));
        var agentService = CreateAgentService(temp.Path);
        var service = new SessionReplayApplicationService(
            conversationStore,
            new TelemetryApplicationService(telemetryTracer),
            agentService
        );
        var conversation = conversationStore.Create("chat", "single", "리플레이 테스트", "기본", "테스트", Array.Empty<string>());
        conversationStore.AppendMessage(conversation.Id, "user", "요청 본문", "user");
        conversationStore.AppendMessage(
            conversation.Id,
            "assistant",
            "응답 본문",
            "gemini:flash",
            new TokenUsage(10, 5, 15, TokenUsageEstimator.SourceExact)
        );
        using (var scope = telemetryTracer.StartLlmCall(new TelemetryLlmCallRequest(
                   "gemini",
                   "flash",
                   PromptChars: 100,
                   MaxOutputTokens: 256,
                   Streaming: false,
                   Source: "test"
               )))
        {
            scope.Complete("gemini", "flash", "응답 본문", new TokenUsage(10, 5, 15, TokenUsageEstimator.SourceExact));
        }

        agentService.PostMessage(new AgentCommunicationPostRequest(
            "agent-a",
            "agent-b",
            "group-1",
            "run-1",
            conversation.Id,
            "message",
            "검토 완료",
            "corr-1"
        ));

        var result = service.GetReplay(new SessionReplayQuery(ConversationId: conversation.Id));

        Assert.True(result.Ok);
        Assert.Contains(result.Snapshot.Events, item => item.Source == "conversation" && item.Kind == "user_input");
        Assert.Contains(result.Snapshot.Events, item => item.Source == "conversation" && item.Kind == "assistant_response");
        Assert.Contains(result.Snapshot.Events, item => item.Source == "telemetry" && item.Correlation == "conversation_window");
        Assert.Contains(result.Snapshot.Events, item => item.Source == "agent_message" && item.RunId == "run-1");
        Assert.Equal(15, result.Snapshot.Summary.TotalTokens);
        Assert.All(
            result.Snapshot.Events.Where(item => item.Source == "conversation"),
            item => Assert.Null(item.Body)
        );
    }

    [Fact]
    public void GetReplay_FlagsFailuresAndWarnings()
    {
        using var temp = TestStateDirectory.Create();
        var conversationStore = new ConversationStore(Path.Combine(temp.Path, "conversations.json"));
        var telemetryTracer = new TelemetryTracer(new FileTelemetryTraceStore(Path.Combine(temp.Path, "telemetry.json")));
        var agentService = CreateAgentService(temp.Path);
        var service = new SessionReplayApplicationService(
            conversationStore,
            new TelemetryApplicationService(telemetryTracer),
            agentService
        );
        var conversation = conversationStore.Create("chat", "single", "리플레이 테스트", "기본", "테스트", Array.Empty<string>());
        conversationStore.AppendMessage(conversation.Id, "system", "압축됨", "auto-compress");
        conversationStore.AppendMessage(conversation.Id, "assistant", "응답 시간이 초과되었습니다.", "codex:test");
        agentService.EmitLifecycle(new AgentLifecycleWriteRequest(
            "agent-a",
            "run-1",
            "group-1",
            conversation.Id,
            "failed",
            "실패"
        ));

        var result = service.GetReplay(new SessionReplayQuery(ConversationId: conversation.Id, IncludeTelemetry: false));

        Assert.True(result.Ok);
        Assert.True(result.Snapshot.Summary.WarningCount >= 1);
        Assert.True(result.Snapshot.Summary.ErrorCount >= 1);
        Assert.Contains(result.Snapshot.Events, item => item.Kind == "context_compression" && item.Severity == "warning");
        Assert.Contains(result.Snapshot.Events, item => item.Source == "agent_lifecycle" && item.Severity == "error");
    }

    [Fact]
    public void GetReplay_RequiresAnchor()
    {
        using var temp = TestStateDirectory.Create();
        var conversationStore = new ConversationStore(Path.Combine(temp.Path, "conversations.json"));
        var telemetryTracer = new TelemetryTracer(new FileTelemetryTraceStore(Path.Combine(temp.Path, "telemetry.json")));
        var service = new SessionReplayApplicationService(
            conversationStore,
            new TelemetryApplicationService(telemetryTracer),
            CreateAgentService(temp.Path)
        );

        var result = service.GetReplay(new SessionReplayQuery());

        Assert.False(result.Ok);
        Assert.Empty(result.Snapshot.Events);
        Assert.Contains("conversationId", result.Message);
    }

    private static AgentCommunicationApplicationService CreateAgentService(string stateDir)
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
                "omnux-session-replay-tests",
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
