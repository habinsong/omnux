using Omnux.Middleware;
using System.IO;

namespace Omnux.Middleware.Tests;

public sealed class AgentSpawnDailyCostLedgerTests
{
    [Fact]
    public void Spawn_RejectsWhenDailyCostCapIsExceeded()
    {
        var stateDir = Path.Combine(Path.GetTempPath(), "omnux-agent-spawn-cost-tests", Guid.NewGuid().ToString("N"));
        var now = DateTimeOffset.Parse("2026-06-02T00:00:00Z");
        Directory.CreateDirectory(stateDir);

        try
        {
            var conversationStore = new ConversationStore(Path.Combine(stateDir, "conversations.json"));
            var runtimeSettings = new RuntimeSettings(new AppConfig());
            var adapter = new AcpSessionBindingAdapter(stateDir, "codex", runtimeSettings);
            var admissionLimiter = new AgentSpawnAdmissionLimiter(
                () => now,
                tokenCapacity: 20_000,
                refillTokensPerMinute: 20_000,
                maxConcurrentSpawns: 10,
                elevatedMaxConcurrentSpawns: 1
            );
            var dailyCostLedger = new AgentSpawnDailyCostLedger(
                Path.Combine(stateDir, "agent_spawn_daily_cost_ledger.json"),
                dailyTokenCap: 4_000,
                utcNow: () => now
            );
            var tool = new SessionSpawnTool(conversationStore, adapter, admissionLimiter, dailyCostLedger);

            var accepted = Enumerable.Range(0, 2)
                .Select(index => tool.Spawn(
                    task: new string((char)('a' + index), 2_400),
                    label: $"daily-cap-{index}",
                    runtime: "subagent",
                    runTimeoutSeconds: 1_800,
                    thread: false,
                    mode: "run"
                ))
                .ToArray();
            var rejected = tool.Spawn(
                task: new string('z', 2_400),
                label: "daily-cap-rejected",
                runtime: "subagent",
                runTimeoutSeconds: 1_800,
                thread: false,
                mode: "run"
            );

            Assert.All(accepted, result => Assert.Equal("accepted", result.Status));
            Assert.Contains("daily_spent=", accepted[0].Note);

            Assert.Equal("error", rejected.Status);
            Assert.Contains("daily cost cap", rejected.Error, StringComparison.OrdinalIgnoreCase);
        }
        finally
        {
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
}
