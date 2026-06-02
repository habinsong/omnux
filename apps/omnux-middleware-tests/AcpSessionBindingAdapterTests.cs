using Omnux.Middleware;
using System.IO;
using System.Text.Json;

namespace Omnux.Middleware.Tests;

public sealed class AcpSessionBindingAdapterTests
{
    [Fact]
    public void NormalizeCommandPriority_MapsRecognizedValues()
    {
        Assert.Equal("interactive", AcpSessionBindingAdapter.NormalizeCommandPriority(" high "));
        Assert.Equal("background", AcpSessionBindingAdapter.NormalizeCommandPriority("passive"));
        Assert.Equal("normal", AcpSessionBindingAdapter.NormalizeCommandPriority("standard"));
        Assert.Null(AcpSessionBindingAdapter.NormalizeCommandPriority("burst"));
    }

    [Fact]
    public void Spawn_AcpSessionCarriesCommandPriorityToResultAndTrace()
    {
        var stateDir = Path.Combine(Path.GetTempPath(), "omnux-acp-priority-tests", Guid.NewGuid().ToString("N"));
        var oldMode = Environment.GetEnvironmentVariable("OMNUX_ACP_ADAPTER_MODE");
        Directory.CreateDirectory(stateDir);

        try
        {
            Environment.SetEnvironmentVariable("OMNUX_ACP_ADAPTER_MODE", "staged");
            var conversationStore = new ConversationStore(Path.Combine(stateDir, "conversations.json"));
            var runtimeSettings = new RuntimeSettings(new AppConfig());
            var adapter = new AcpSessionBindingAdapter(stateDir, "codex", runtimeSettings);
            var tool = CreateSpawnTool(stateDir, conversationStore, adapter);

            var result = tool.Spawn(
                task: "priority bridge test",
                label: "priority-test",
                runtime: "acp",
                runTimeoutSeconds: 120,
                timeoutSeconds: 120,
                thread: true,
                mode: "session",
                acpModel: "gpt-5-mini",
                acpThinking: "low",
                acpLightContext: true,
                acpToolProfile: "playwright_only",
                acpOutputDirectory: "out",
                commandPriority: "interactive"
            );

            Assert.Equal("accepted", result.Status);
            Assert.Equal("interactive", result.CommandPriority);

            var thread = conversationStore.Get(result.ChildSessionKey);
            Assert.NotNull(thread);
            Assert.Contains(thread!.Messages, message => message.Meta == "sessions_spawn_acp_dispatch" && message.Text.Contains("commandPriority=interactive", StringComparison.Ordinal));
        }
        finally
        {
            Environment.SetEnvironmentVariable("OMNUX_ACP_ADAPTER_MODE", oldMode);
            try
            {
                if (Directory.Exists(stateDir))
                {
                    Directory.Delete(stateDir, recursive: true);
                }
            }
            catch
            {
                // best effort cleanup
            }
        }
    }

    [Fact]
    public void BuildCommandPayloadJson_ForwardsBreakerStatePath()
    {
        var payload = AcpSessionBindingAdapter.BuildCommandPayloadJson(
            new AcpSessionBindingDispatchRequest(
                RunId: "run-1",
                ChildSessionKey: "child-1",
                Mode: "run",
                Task: "breaker payload test",
                RunTimeoutSeconds: 30,
                Thread: false,
                Model: "gpt-5-mini",
                Thinking: "low",
                LightContext: true,
                ToolProfile: "playwright_only",
                OutputDirectory: "out",
                CommandPriority: "background",
                BreakerStatePath: "/tmp/omnux/agent_spawn_breaker.json"
            )
        );

        using var doc = JsonDocument.Parse(payload);
        var root = doc.RootElement;
        Assert.Equal("/tmp/omnux/agent_spawn_breaker.json", root.GetProperty("breakerStatePath").GetString());
        Assert.Equal("background", root.GetProperty("commandPriority").GetString());
    }

    [Fact]
    public void Spawn_AcpCommandFailureFallsBackToStagedReceipt()
    {
        var stateDir = Path.Combine(Path.GetTempPath(), "omnux-acp-fallback-tests", Guid.NewGuid().ToString("N"));
        var oldMode = Environment.GetEnvironmentVariable("OMNUX_ACP_ADAPTER_MODE");
        var oldCommand = Environment.GetEnvironmentVariable("OMNUX_ACP_ADAPTER_COMMAND");
        Directory.CreateDirectory(stateDir);

        try
        {
            Environment.SetEnvironmentVariable("OMNUX_ACP_ADAPTER_MODE", "command");
            Environment.SetEnvironmentVariable("OMNUX_ACP_ADAPTER_COMMAND", Path.Combine(stateDir, "missing-adapter"));
            var conversationStore = new ConversationStore(Path.Combine(stateDir, "conversations.json"));
            var runtimeSettings = new RuntimeSettings(new AppConfig());
            var adapter = new AcpSessionBindingAdapter(stateDir, "codex", runtimeSettings);
            var tool = CreateSpawnTool(stateDir, conversationStore, adapter);

            var result = tool.Spawn(
                task: "fallback bridge test",
                label: "fallback-test",
                runtime: "acp",
                runTimeoutSeconds: 120,
                timeoutSeconds: 120,
                thread: false,
                mode: "run",
                acpModel: "gpt-5-mini",
                commandPriority: "background"
            );

            Assert.Equal("accepted", result.Status);
            Assert.Equal("review_child_session", result.FollowUpAction);
            Assert.Contains("acp fallback", result.Note);

            var thread = conversationStore.Get(result.ChildSessionKey);
            Assert.NotNull(thread);
            Assert.Contains(thread!.Messages, message => message.Meta == "sessions_spawn_acp_dispatch" && message.Text.Contains("mode=command_fallback_staged", StringComparison.Ordinal));
            Assert.Contains(thread.Messages, message => message.Meta == "sessions_spawn_acp_dispatch" && message.Text.Contains("command fallback accepted", StringComparison.Ordinal));
        }
        finally
        {
            Environment.SetEnvironmentVariable("OMNUX_ACP_ADAPTER_MODE", oldMode);
            Environment.SetEnvironmentVariable("OMNUX_ACP_ADAPTER_COMMAND", oldCommand);
            try
            {
                if (Directory.Exists(stateDir))
                {
                    Directory.Delete(stateDir, recursive: true);
                }
            }
            catch
            {
                // best effort cleanup
            }
        }
    }

    [Fact]
    public void ToolApplicationService_SpawnSessionForwardsCommandPriority()
    {
        var stateDir = Path.Combine(Path.GetTempPath(), "omnux-acp-tool-service-priority-tests", Guid.NewGuid().ToString("N"));
        var oldMode = Environment.GetEnvironmentVariable("OMNUX_ACP_ADAPTER_MODE");
        Directory.CreateDirectory(stateDir);

        try
        {
            Environment.SetEnvironmentVariable("OMNUX_ACP_ADAPTER_MODE", "staged");
            var conversationStore = new ConversationStore(Path.Combine(stateDir, "conversations.json"));
            var runtimeSettings = new RuntimeSettings(new AppConfig());
            var adapter = new AcpSessionBindingAdapter(stateDir, "codex", runtimeSettings);
            var spawnTool = CreateSpawnTool(stateDir, conversationStore, adapter);
            var service = new ToolApplicationService(
                null!,
                null!,
                new SessionSendTool(conversationStore),
                spawnTool,
                null!,
                null!,
                null!,
                null!,
                null!
            );

            var result = service.SpawnSession(
                task: "tool service priority bridge test",
                label: "tool-service-priority",
                runtime: "acp",
                runTimeoutSeconds: 120,
                timeoutSeconds: 120,
                thread: true,
                mode: "session",
                commandPriority: "interactive"
            );

            Assert.Equal("accepted", result.Status);
            Assert.Equal("interactive", result.CommandPriority);

            var thread = conversationStore.Get(result.ChildSessionKey);
            Assert.NotNull(thread);
            Assert.Contains(thread!.Messages, message => message.Meta == "sessions_spawn_acp_dispatch" && message.Text.Contains("commandPriority=interactive", StringComparison.Ordinal));
        }
        finally
        {
            Environment.SetEnvironmentVariable("OMNUX_ACP_ADAPTER_MODE", oldMode);
            try
            {
                if (Directory.Exists(stateDir))
                {
                    Directory.Delete(stateDir, recursive: true);
                }
            }
            catch
            {
                // best effort cleanup
            }
        }
    }

    private static SessionSpawnTool CreateSpawnTool(
        string stateDir,
        ConversationStore conversationStore,
        AcpSessionBindingAdapter adapter
    )
    {
        var admissionLimiter = new AgentSpawnAdmissionLimiter(
            () => DateTimeOffset.Parse("2026-06-02T00:00:00Z"),
            tokenCapacity: 20_000,
            refillTokensPerMinute: 20_000,
            maxConcurrentSpawns: 3,
            elevatedMaxConcurrentSpawns: 1
        );
        var dailyCostLedger = new AgentSpawnDailyCostLedger(
            Path.Combine(stateDir, "agent_spawn_daily_cost_ledger.json"),
            dailyTokenCap: 20_000,
            utcNow: () => DateTimeOffset.Parse("2026-06-02T00:00:00Z")
        );
        return new SessionSpawnTool(conversationStore, adapter, admissionLimiter, dailyCostLedger);
    }
}
