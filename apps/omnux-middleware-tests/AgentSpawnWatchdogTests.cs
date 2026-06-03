using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class AgentSpawnWatchdogTests
{
    [Fact]
    public void EvaluateWatchdog_MarksRunTimedOutWhenRunTimeoutExceeded()
    {
        using var temp = TestStateDirectory.Create();
        var store = new FileAgentSpawnActiveRunStore(Path.Combine(temp.Path, "agent_spawn_active.json"));
        var now = DateTimeOffset.Parse("2026-06-04T00:00:00Z");

        store.Start(new AgentSpawnActiveRunEntry
        {
            RunId = "run-timeout",
            ChildSessionKey = "child-timeout",
            Runtime = "acp",
            Mode = "run",
            Backend = "codex",
            RunTimeoutSeconds = 60,
            StartedUtc = now.AddMinutes(-3),
            LastHeartbeatUtc = now.AddMinutes(-2),
            State = "dispatching"
        });

        var watchdog = store.EvaluateWatchdog(now);
        var active = store.GetSnapshot(now);

        Assert.Equal(1, watchdog.EventCount);
        Assert.Equal(1, watchdog.TimedOutCount);
        Assert.Equal(0, watchdog.StaleCount);
        Assert.Equal(0, watchdog.ActiveCount);
        var item = Assert.Single(watchdog.Events);
        Assert.Equal("run-timeout", item.RunId);
        Assert.Equal("timeout", item.State);
        Assert.Equal("run_timeout", item.Reason);
        Assert.Equal("dispatching", item.PreviousState);
        Assert.Equal(0, active.ActiveCount);
        Assert.Equal(1, active.CompletedHistoryCount);
    }

    [Fact]
    public void EvaluateWatchdog_MarksRunStaleWhenHeartbeatExpired()
    {
        using var temp = TestStateDirectory.Create();
        var store = new FileAgentSpawnActiveRunStore(Path.Combine(temp.Path, "agent_spawn_active.json"));
        var now = DateTimeOffset.Parse("2026-06-04T00:00:00Z");

        store.Start(new AgentSpawnActiveRunEntry
        {
            RunId = "run-stale",
            ChildSessionKey = "child-stale",
            Runtime = "subagent",
            Mode = "session",
            Backend = "subagent",
            RunTimeoutSeconds = 0,
            StartedUtc = now.AddHours(-13),
            LastHeartbeatUtc = now.AddHours(-13),
            State = "session_active"
        });

        var watchdog = store.EvaluateWatchdog(now);
        var active = store.GetSnapshot(now);

        Assert.Equal(1, watchdog.EventCount);
        Assert.Equal(0, watchdog.TimedOutCount);
        Assert.Equal(1, watchdog.StaleCount);
        var item = Assert.Single(watchdog.Events);
        Assert.Equal("run-stale", item.RunId);
        Assert.Equal("stale", item.State);
        Assert.Equal("heartbeat_timeout", item.Reason);
        Assert.Equal("session_active", item.PreviousState);
        Assert.Equal(0, active.ActiveCount);
    }

    [Fact]
    public void SessionSend_RejectsFollowUpAfterWatchdogClosedSession()
    {
        using var temp = TestStateDirectory.Create();
        var conversationStore = new ConversationStore(Path.Combine(temp.Path, "conversations.json"));
        var thread = conversationStore.Create(
            "chat",
            "single",
            "watchdog child",
            "sessions_spawn",
            "run",
            new[] { "sessions_spawn", "acp", "run" }
        );
        conversationStore.AppendMessage(
            thread.Id,
            "assistant",
            "sessions_spawn watchdog closed this child session.",
            "sessions_spawn_watchdog_closed"
        );
        var sendTool = new SessionSendTool(conversationStore);

        var result = sendTool.Send(thread.Id, "continue", timeoutSeconds: 0);

        Assert.Equal("error", result.Status);
        Assert.Contains("closed by sessions_spawn safety state", result.Error);
        Assert.DoesNotContain(
            conversationStore.Get(thread.Id)!.Messages,
            message => message.Meta == "sessions_send"
        );
    }

    [Fact]
    public void InventorySnapshot_ReportsOverdueRunsWithoutClosingThem()
    {
        using var temp = TestStateDirectory.Create();
        var store = new FileAgentSpawnActiveRunStore(Path.Combine(temp.Path, "agent_spawn_active.json"));
        var now = DateTimeOffset.Parse("2026-06-04T00:00:00Z");
        store.Start(new AgentSpawnActiveRunEntry
        {
            RunId = "run-timeout-preview",
            ChildSessionKey = "child-timeout-preview",
            Runtime = "acp",
            Mode = "run",
            Backend = "codex",
            RunTimeoutSeconds = 60,
            StartedUtc = now.AddMinutes(-3),
            LastHeartbeatUtc = now.AddMinutes(-2),
            State = "dispatching"
        });

        var snapshot = new AgentWatchdogInventorySnapshotService(store, () => now)
            .GetSnapshot(10);

        Assert.True(snapshot.ReadOnly);
        Assert.Equal("attention_required", snapshot.Status);
        Assert.Equal(1, snapshot.ActiveCount);
        Assert.Equal(0, snapshot.TerminalHistoryCount);
        Assert.Contains("watchdog_evaluate_and_close", snapshot.Skipped);
        var item = Assert.Single(snapshot.Runs);
        Assert.Equal("run-timeout-preview", item.RunId);
        Assert.True(item.Active);
        Assert.Equal("timeout_due", item.Health);
        Assert.Equal(0, item.TimeoutInSeconds);
        Assert.True(item.StaleInSeconds > 0);

        var stored = Assert.Single(store.ReadEntriesSnapshot());
        Assert.Equal("dispatching", stored.State);
        Assert.Null(stored.CompletedUtc);

        var watchdog = store.EvaluateWatchdog(now);
        Assert.Equal(1, watchdog.EventCount);
        Assert.Equal("timeout", Assert.Single(watchdog.Events).State);
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
                "omnux-agent-spawn-watchdog-tests",
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
