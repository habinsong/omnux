using Omnux.Middleware;
using System.IO;

namespace Omnux.Middleware.Tests;

public sealed class AgentSpawnQueueStoreTests
{
    [Fact]
    public void ActiveRunStore_TracksActiveCompletionAndStaleRuns()
    {
        var stateDir = Path.Combine(Path.GetTempPath(), "omnux-agent-spawn-active-tests", Guid.NewGuid().ToString("N"));
        var now = DateTimeOffset.Parse("2026-06-02T00:00:00Z");
        Directory.CreateDirectory(stateDir);

        try
        {
            var store = new FileAgentSpawnActiveRunStore(Path.Combine(stateDir, "agent_spawn_active.json"));
            var activeId = store.Start(new AgentSpawnActiveRunEntry
            {
                RunId = "run-active",
                ChildSessionKey = "child-active",
                Runtime = "acp",
                Mode = "session",
                Backend = "acp_dispatch",
                RunTimeoutSeconds = 900,
                StartedUtc = now.AddMinutes(-2),
                LastHeartbeatUtc = now.AddMinutes(-1),
                State = "dispatching"
            });
            var completedId = store.Start(new AgentSpawnActiveRunEntry
            {
                RunId = "run-completed",
                ChildSessionKey = "child-completed",
                Runtime = "subagent",
                Mode = "run",
                Backend = "subagent",
                RunTimeoutSeconds = 900,
                StartedUtc = now.AddMinutes(-5),
                LastHeartbeatUtc = now.AddMinutes(-4),
                State = "pending_completion"
            });

            Assert.True(store.MarkBackend(activeId, "codex_exec", "codex-exec-active", now));
            Assert.True(store.Complete(completedId, "completed", now));

            var snapshot = store.GetSnapshot(now);

            Assert.Equal(1, snapshot.ActiveCount);
            Assert.Equal("run-active", snapshot.OldestRunId);
            Assert.Equal("codex_exec", snapshot.OldestBackend);
            Assert.Equal(120, snapshot.OldestAgeSeconds);
            Assert.Equal(1, snapshot.CompletedHistoryCount);

            _ = store.GetSnapshot(now.AddHours(13));
            var staleSnapshot = store.GetSnapshot(now.AddHours(13));

            Assert.Equal(0, staleSnapshot.ActiveCount);
            Assert.True(staleSnapshot.CompletedHistoryCount >= 2);
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

    [Fact]
    public void GetQueueStatus_MarksActiveRunsBlockedWhenBreakerIsEnabled()
    {
        var stateDir = Path.Combine(Path.GetTempPath(), "omnux-agent-spawn-active-breaker-tests", Guid.NewGuid().ToString("N"));
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
                maxConcurrentSpawns: 3,
                elevatedMaxConcurrentSpawns: 1
            );
            var dailyCostLedger = new AgentSpawnDailyCostLedger(
                Path.Combine(stateDir, "agent_spawn_daily_cost_ledger.json"),
                dailyTokenCap: 20_000,
                utcNow: () => now
            );
            var queueStore = new FileAgentSpawnQueueStore(Path.Combine(stateDir, "agent_spawn_queue.json"));
            var activeRunStore = new FileAgentSpawnActiveRunStore(Path.Combine(stateDir, "agent_spawn_active.json"));
            activeRunStore.Start(new AgentSpawnActiveRunEntry
            {
                RunId = "active-run",
                ChildSessionKey = "active-child",
                Runtime = "subagent",
                Mode = "session",
                Backend = "subagent",
                RunTimeoutSeconds = 900,
                StartedUtc = now.AddMinutes(-10),
                LastHeartbeatUtc = now.AddMinutes(-1),
                State = "session_active"
            });

            var breakerPath = Path.Combine(stateDir, "agent_spawn_breaker.json");
            File.WriteAllText(
                breakerPath,
                """
                {
                  "Enabled": true,
                  "Reason": "manual_pause",
                  "Message": "paused for operator intervention"
                }
                """
            );
            var tool = new SessionSpawnTool(
                conversationStore,
                adapter,
                admissionLimiter,
                dailyCostLedger,
                queueStore,
                new AgentSpawnRunBreaker(breakerPath, utcNow: () => now),
                activeRunStore,
                utcNow: () => now
            );

            var status = tool.GetQueueStatus();

            Assert.True(status.BreakerBlocked);
            Assert.NotNull(status.Active);
            Assert.Equal(0, status.Active!.ActiveCount);
            Assert.Equal(1, status.Active.CompletedHistoryCount);

            var stateText = File.ReadAllText(Path.Combine(stateDir, "agent_spawn_active.json"));
            Assert.Contains("blocked_by_breaker", stateText);
            Assert.Contains("paused for operator intervention", stateText);
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

    [Fact]
    public void BreakerBlockedSessionRejectsFollowUpSendsAndRecordsRecoveryAction()
    {
        var stateDir = Path.Combine(Path.GetTempPath(), "omnux-agent-spawn-breaker-send-tests", Guid.NewGuid().ToString("N"));
        var now = DateTimeOffset.Parse("2026-06-02T00:00:00Z");
        Directory.CreateDirectory(stateDir);

        try
        {
            var conversationStore = new ConversationStore(Path.Combine(stateDir, "conversations.json"));
            var child = conversationStore.Create(
                scope: "chat",
                mode: "single",
                title: "blocked subagent",
                project: "subagent",
                category: "session",
                tags: new[] { "sessions_spawn", "subagent", "session" }
            );
            var runtimeSettings = new RuntimeSettings(new AppConfig());
            var adapter = new AcpSessionBindingAdapter(stateDir, "codex", runtimeSettings);
            var admissionLimiter = new AgentSpawnAdmissionLimiter(
                () => now,
                tokenCapacity: 20_000,
                refillTokensPerMinute: 20_000,
                maxConcurrentSpawns: 3,
                elevatedMaxConcurrentSpawns: 1
            );
            var dailyCostLedger = new AgentSpawnDailyCostLedger(
                Path.Combine(stateDir, "agent_spawn_daily_cost_ledger.json"),
                dailyTokenCap: 20_000,
                utcNow: () => now
            );
            var queueStore = new FileAgentSpawnQueueStore(Path.Combine(stateDir, "agent_spawn_queue.json"));
            var activeRunStore = new FileAgentSpawnActiveRunStore(Path.Combine(stateDir, "agent_spawn_active.json"));
            activeRunStore.Start(new AgentSpawnActiveRunEntry
            {
                RunId = "active-subagent-run",
                ChildSessionKey = child.Id,
                Runtime = "subagent",
                Mode = "session",
                Backend = "subagent",
                RunTimeoutSeconds = 900,
                StartedUtc = now.AddMinutes(-10),
                LastHeartbeatUtc = now.AddMinutes(-1),
                State = "session_active"
            });

            var breakerPath = Path.Combine(stateDir, "agent_spawn_breaker.json");
            File.WriteAllText(
                breakerPath,
                """
                {
                  "Enabled": true,
                  "Reason": "manual_pause",
                  "Message": "paused for operator intervention"
                }
                """
            );
            var tool = new SessionSpawnTool(
                conversationStore,
                adapter,
                admissionLimiter,
                dailyCostLedger,
                queueStore,
                new AgentSpawnRunBreaker(breakerPath, utcNow: () => now),
                activeRunStore,
                utcNow: () => now
            );

            var status = tool.GetQueueStatus();

            Assert.True(status.BreakerBlocked);
            var blockedThread = conversationStore.Get(child.Id);
            Assert.NotNull(blockedThread);
            Assert.Contains(blockedThread!.Tags, tag => tag == "blocked_by_breaker");
            Assert.Contains(
                blockedThread.Messages,
                message => message.Meta == "sessions_spawn_breaker_blocked"
                           && message.Text.Contains("killAction=not_applicable_no_process", StringComparison.Ordinal)
                           && message.Text.Contains("recoveryAction=no_workspace_rollback_expected_close_transcript", StringComparison.Ordinal)
            );
            Assert.Contains(
                blockedThread.Messages,
                message => message.Meta == "sessions_spawn_breaker_closed"
                           && message.Text.Contains("process_kill=not_applicable_no_process", StringComparison.Ordinal)
            );

            var sendResult = new SessionSendTool(conversationStore).Send(child.Id, "follow-up should not be accepted");

            Assert.Equal("error", sendResult.Status);
            Assert.Contains("blocked_by_breaker", sendResult.Error);
            var afterSendThread = conversationStore.Get(child.Id);
            Assert.NotNull(afterSendThread);
            Assert.DoesNotContain(afterSendThread!.Messages, message => message.Meta == "sessions_send");
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

    [Fact]
    public void BreakerBlockedCommandRunRecordsWorkspaceRollbackRecoveryAction()
    {
        var stateDir = Path.Combine(Path.GetTempPath(), "omnux-agent-spawn-breaker-rollback-tests", Guid.NewGuid().ToString("N"));
        var now = DateTimeOffset.Parse("2026-06-02T00:00:00Z");
        Directory.CreateDirectory(stateDir);

        try
        {
            var conversationStore = new ConversationStore(Path.Combine(stateDir, "conversations.json"));
            var child = conversationStore.Create(
                scope: "chat",
                mode: "single",
                title: "blocked codex",
                project: "acp",
                category: "session",
                tags: new[] { "sessions_spawn", "acp", "session" }
            );
            var runtimeSettings = new RuntimeSettings(new AppConfig());
            var adapter = new AcpSessionBindingAdapter(stateDir, "codex", runtimeSettings);
            var admissionLimiter = new AgentSpawnAdmissionLimiter(
                () => now,
                tokenCapacity: 20_000,
                refillTokensPerMinute: 20_000,
                maxConcurrentSpawns: 3,
                elevatedMaxConcurrentSpawns: 1
            );
            var dailyCostLedger = new AgentSpawnDailyCostLedger(
                Path.Combine(stateDir, "agent_spawn_daily_cost_ledger.json"),
                dailyTokenCap: 20_000,
                utcNow: () => now
            );
            var queueStore = new FileAgentSpawnQueueStore(Path.Combine(stateDir, "agent_spawn_queue.json"));
            var activeRunStore = new FileAgentSpawnActiveRunStore(Path.Combine(stateDir, "agent_spawn_active.json"));
            var activeId = activeRunStore.Start(new AgentSpawnActiveRunEntry
            {
                RunId = "active-codex-run",
                ChildSessionKey = child.Id,
                Runtime = "acp",
                Mode = "session",
                Backend = "codex_exec",
                BackendSessionId = "codex-exec-active",
                RunTimeoutSeconds = 900,
                StartedUtc = now.AddMinutes(-10),
                LastHeartbeatUtc = now.AddMinutes(-1),
                State = "session_active"
            });
            activeRunStore.MarkWorkspaceRollback(
                activeId,
                "rollback_agent_123",
                Path.Combine(stateDir, ".runtime", "refactor-preview", "rollback_agent_123.rollback.json"),
                changedFiles: 2,
                partial: false,
                nowUtc: now
            );

            var breakerPath = Path.Combine(stateDir, "agent_spawn_breaker.json");
            File.WriteAllText(
                breakerPath,
                """
                {
                  "Enabled": true,
                  "Reason": "manual_pause",
                  "Message": "paused for operator intervention"
                }
                """
            );
            var tool = new SessionSpawnTool(
                conversationStore,
                adapter,
                admissionLimiter,
                dailyCostLedger,
                queueStore,
                new AgentSpawnRunBreaker(breakerPath, utcNow: () => now),
                activeRunStore,
                utcNow: () => now
            );

            var status = tool.GetQueueStatus();

            Assert.True(status.BreakerBlocked);
            var blockedThread = conversationStore.Get(child.Id);
            Assert.NotNull(blockedThread);
            Assert.Contains(
                blockedThread!.Messages,
                message => message.Meta == "sessions_spawn_breaker_blocked"
                           && message.Text.Contains("recoveryAction=restore_workspace_rollback_snapshot", StringComparison.Ordinal)
                           && message.Text.Contains("workspaceRollbackId=rollback_agent_123", StringComparison.Ordinal)
            );
            Assert.Contains(
                blockedThread.Messages,
                message => message.Meta == "sessions_spawn_breaker_closed"
                           && message.Text.Contains("workspace_rollback_id=rollback_agent_123", StringComparison.Ordinal)
                           && message.Text.Contains("workspace_rollback_files=2", StringComparison.Ordinal)
            );
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

    [Fact]
    public void Spawn_QueuesAdmissionRejectedWorkAndFlushesWhenCapacityReturns()
    {
        var stateDir = Path.Combine(Path.GetTempPath(), "omnux-agent-spawn-queue-tests", Guid.NewGuid().ToString("N"));
        var now = DateTimeOffset.Parse("2026-06-02T00:00:00Z");
        Directory.CreateDirectory(stateDir);

        try
        {
            var conversationStore = new ConversationStore(Path.Combine(stateDir, "conversations.json"));
            var runtimeSettings = new RuntimeSettings(new AppConfig());
            var adapter = new AcpSessionBindingAdapter(stateDir, "codex", runtimeSettings);
            var admissionLimiter = new AgentSpawnAdmissionLimiter(
                () => now,
                tokenCapacity: 900,
                refillTokensPerMinute: 900,
                maxConcurrentSpawns: 4,
                elevatedMaxConcurrentSpawns: 1
            );
            var dailyCostLedger = new AgentSpawnDailyCostLedger(
                Path.Combine(stateDir, "agent_spawn_daily_cost_ledger.json"),
                dailyTokenCap: 20_000,
                utcNow: () => now
            );
            var queueStore = new FileAgentSpawnQueueStore(Path.Combine(stateDir, "agent_spawn_queue.json"));
            var tool = new SessionSpawnTool(
                conversationStore,
                adapter,
                admissionLimiter,
                dailyCostLedger,
                queueStore,
                utcNow: () => now
            );

            var first = tool.Spawn(
                task: "first spawn consumes bucket",
                label: "first",
                runtime: "subagent",
                runTimeoutSeconds: 900,
                thread: false,
                mode: "run"
            );
            var queued = tool.Spawn(
                task: "second spawn waits for bucket",
                label: "queued",
                runtime: "subagent",
                runTimeoutSeconds: 900,
                thread: false,
                mode: "run"
            );

            Assert.Equal("accepted", first.Status);
            Assert.Equal("accepted", queued.Status);
            Assert.Equal("queued", queued.FollowUpStatus);
            Assert.Contains("persistent queue accepted", queued.Note);
            Assert.Equal(1, queueStore.GetSnapshot().Total);
            Assert.True(File.Exists(Path.Combine(stateDir, "agent_spawn_queue.json.queue.lease")));

            now = now.AddMinutes(2);
            var flushed = tool.FlushQueuedSpawns(maxCount: 4);

            var result = Assert.Single(flushed);
            Assert.Equal("accepted", result.Status);
            Assert.Equal(queued.RunId, result.RunId);
            Assert.Equal(queued.ChildSessionKey, result.ChildSessionKey);
            Assert.Equal(0, queueStore.GetSnapshot().Total);

            var thread = conversationStore.Get(queued.ChildSessionKey);
            Assert.NotNull(thread);
            Assert.Contains(thread!.Messages, message => message.Meta == "sessions_spawn_queue_delivered");
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

    [Fact]
    public void ClaimReadyEntries_PreventsDuplicateClaimsAcrossStoreInstancesUntilLeaseExpires()
    {
        var stateDir = Path.Combine(Path.GetTempPath(), "omnux-agent-spawn-queue-claim-tests", Guid.NewGuid().ToString("N"));
        var now = DateTimeOffset.Parse("2026-06-02T00:00:00Z");
        Directory.CreateDirectory(stateDir);

        try
        {
            var queuePath = Path.Combine(stateDir, "agent_spawn_queue.json");
            var firstStore = new FileAgentSpawnQueueStore(queuePath);
            var secondStore = new FileAgentSpawnQueueStore(queuePath);
            var id = firstStore.Enqueue(new AgentSpawnQueueEntry
            {
                RunId = "run",
                ChildSessionKey = "child",
                Task = "queued task",
                Runtime = "subagent",
                Mode = "run",
                RunTimeoutSeconds = 120,
                EnqueuedUtc = now,
                NextAttemptUtc = now
            });

            var firstClaim = firstStore.ClaimReadyEntries(now, maxCount: 4, leaseOwner: "owner-a");
            var duplicateClaim = secondStore.ClaimReadyEntries(now.AddSeconds(1), maxCount: 4, leaseOwner: "owner-b");
            var readOnlyReadyWhileLeased = secondStore.GetReadyEntries(now.AddSeconds(1), maxCount: 4);
            var leasedSnapshot = secondStore.GetSnapshot(now.AddSeconds(1));
            var reclaimed = secondStore.ClaimReadyEntries(now.AddMinutes(6), maxCount: 4, leaseOwner: "owner-b");

            var claimed = Assert.Single(firstClaim);
            Assert.Equal(id, claimed.Id);
            Assert.Equal("owner-a", claimed.LeaseOwner);
            Assert.True(claimed.LeasedUntilUtc > now);
            Assert.Empty(duplicateClaim);
            Assert.Empty(readOnlyReadyWhileLeased);
            Assert.Equal(1, leasedSnapshot.Total);
            Assert.Equal(0, leasedSnapshot.Ready);
            Assert.Null(leasedSnapshot.NextEntryId);
            Assert.True(leasedSnapshot.NextAttemptUtc >= now.AddMinutes(5));
            var reclaimedEntry = Assert.Single(reclaimed);
            Assert.Equal(id, reclaimedEntry.Id);
            Assert.Equal("owner-b", reclaimedEntry.LeaseOwner);
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


    [Fact]
    public void Spawn_IsBlockedWhenRunBreakerIsEnabled()
    {
        var stateDir = Path.Combine(Path.GetTempPath(), "omnux-agent-spawn-breaker-tests", Guid.NewGuid().ToString("N"));
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
                maxConcurrentSpawns: 3,
                elevatedMaxConcurrentSpawns: 1
            );
            var dailyCostLedger = new AgentSpawnDailyCostLedger(
                Path.Combine(stateDir, "agent_spawn_daily_cost_ledger.json"),
                dailyTokenCap: 20_000,
                utcNow: () => now
            );
            var queueStore = new FileAgentSpawnQueueStore(Path.Combine(stateDir, "agent_spawn_queue.json"));
            var breaker = new AgentSpawnRunBreaker(Path.Combine(stateDir, "agent_spawn_breaker.json"), utcNow: () => now);
            File.WriteAllText(
                Path.Combine(stateDir, "agent_spawn_breaker.json"),
                """
                {
                  "Enabled": true,
                  "Reason": "manual_pause",
                  "Message": "paused for operator intervention"
                }
                """
            );
            var tool = new SessionSpawnTool(
                conversationStore,
                adapter,
                admissionLimiter,
                dailyCostLedger,
                queueStore,
                breaker,
                utcNow: () => now
            );

            var result = tool.Spawn(
                task: "breaker blocks spawn",
                label: "breaker",
                runtime: "subagent",
                runTimeoutSeconds: 900,
                thread: false,
                mode: "run"
            );

            Assert.Equal("error", result.Status);
            Assert.Contains("paused for operator intervention", result.Error);
            Assert.Equal("blocked_by_breaker", result.FollowUpStatus);
            Assert.Equal("wait_for_operator", result.FollowUpAction);
            Assert.False(File.Exists(Path.Combine(stateDir, "agent_spawn_queue.json")));
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

    [Fact]
    public void FlushQueuedSpawns_IsBlockedWhenRunBreakerIsEnabled()
    {
        var stateDir = Path.Combine(Path.GetTempPath(), "omnux-agent-spawn-breaker-flush-tests", Guid.NewGuid().ToString("N"));
        var now = DateTimeOffset.Parse("2026-06-02T00:00:00Z");
        Directory.CreateDirectory(stateDir);

        try
        {
            var conversationStore = new ConversationStore(Path.Combine(stateDir, "conversations.json"));
            var runtimeSettings = new RuntimeSettings(new AppConfig());
            var adapter = new AcpSessionBindingAdapter(stateDir, "codex", runtimeSettings);
            var admissionLimiter = new AgentSpawnAdmissionLimiter(
                () => now,
                tokenCapacity: 900,
                refillTokensPerMinute: 900,
                maxConcurrentSpawns: 4,
                elevatedMaxConcurrentSpawns: 1
            );
            var dailyCostLedger = new AgentSpawnDailyCostLedger(
                Path.Combine(stateDir, "agent_spawn_daily_cost_ledger.json"),
                dailyTokenCap: 20_000,
                utcNow: () => now
            );
            var queueStore = new FileAgentSpawnQueueStore(Path.Combine(stateDir, "agent_spawn_queue.json"));
            var breakerPath = Path.Combine(stateDir, "agent_spawn_breaker.json");
            File.WriteAllText(
                breakerPath,
                """
                {
                  "Enabled": true,
                  "Reason": "manual_pause",
                  "Message": "paused for operator intervention"
                }
                """
            );
            var tool = new SessionSpawnTool(
                conversationStore,
                adapter,
                admissionLimiter,
                dailyCostLedger,
                queueStore,
                new AgentSpawnRunBreaker(breakerPath, utcNow: () => now),
                utcNow: () => now
            );

            var queueId = queueStore.Enqueue(new AgentSpawnQueueEntry
            {
                RunId = "run",
                ChildSessionKey = "child",
                Task = "queued task",
                Runtime = "subagent",
                Mode = "run",
                RunTimeoutSeconds = 900,
                EnqueuedUtc = now,
                NextAttemptUtc = now
            });

            Assert.False(string.IsNullOrWhiteSpace(queueId));
            Assert.Equal(1, queueStore.GetSnapshot().Total);

            var flushed = tool.FlushQueuedSpawns(maxCount: 4);
            Assert.Empty(flushed);
            Assert.Equal(1, queueStore.GetSnapshot().Total);
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

    [Fact]
    public void MarkFailed_ReschedulesDailyCostCapForLaterRetry()
    {
        var stateDir = Path.Combine(Path.GetTempPath(), "omnux-agent-spawn-queue-reschedule-tests", Guid.NewGuid().ToString("N"));
        var now = DateTimeOffset.Parse("2026-06-02T00:00:00Z");
        Directory.CreateDirectory(stateDir);

        try
        {
            var store = new FileAgentSpawnQueueStore(Path.Combine(stateDir, "agent_spawn_queue.json"));
            var id = store.Enqueue(new AgentSpawnQueueEntry
            {
                RunId = "run",
                ChildSessionKey = "child",
                Task = "queued task",
                Runtime = "acp",
                Mode = "run",
                RunTimeoutSeconds = 120,
                EnqueuedUtc = now,
                NextAttemptUtc = now
            });

            var retryScheduled = store.MarkFailed(id, "sessions_spawn daily cost cap rejected", now);

            var snapshot = store.GetSnapshot();
            Assert.Equal(1, snapshot.Total);
            Assert.True(retryScheduled);
            Assert.True(snapshot.NextAttemptUtc >= now.AddHours(5));
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

    [Fact]
    public void MarkFailed_DeadLettersAfterMaxRetryAttempts()
    {
        var stateDir = Path.Combine(Path.GetTempPath(), "omnux-agent-spawn-queue-deadletter-tests", Guid.NewGuid().ToString("N"));
        var now = DateTimeOffset.Parse("2026-06-02T00:00:00Z");
        Directory.CreateDirectory(stateDir);

        try
        {
            var store = new FileAgentSpawnQueueStore(Path.Combine(stateDir, "agent_spawn_queue.json"));
            var id = store.Enqueue(new AgentSpawnQueueEntry
            {
                RunId = "run",
                ChildSessionKey = "child",
                Task = "queued task",
                Runtime = "acp",
                Mode = "run",
                RunTimeoutSeconds = 120,
                EnqueuedUtc = now,
                NextAttemptUtc = now
            });

            var lastResult = true;
            for (var attempt = 0; attempt < FileAgentSpawnQueueStore.MaxRetryAttempts; attempt++)
            {
                lastResult = store.MarkFailed(id, $"retry {attempt}", now.AddMinutes(attempt));
            }

            var snapshot = store.GetSnapshot();
            Assert.False(lastResult);
            Assert.Equal(0, snapshot.Total);
            Assert.Null(snapshot.NextAttemptUtc);
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

    [Fact]
    public void GetQueueStatus_ExposesQueueAndBreakerState()
    {
        var stateDir = Path.Combine(Path.GetTempPath(), "omnux-agent-spawn-queue-status-tests", Guid.NewGuid().ToString("N"));
        var now = DateTimeOffset.UtcNow;
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
                maxConcurrentSpawns: 3,
                elevatedMaxConcurrentSpawns: 1
            );
            var dailyCostLedger = new AgentSpawnDailyCostLedger(
                Path.Combine(stateDir, "agent_spawn_daily_cost_ledger.json"),
                dailyTokenCap: 20_000,
                utcNow: () => now
            );
            var queueStore = new FileAgentSpawnQueueStore(Path.Combine(stateDir, "agent_spawn_queue.json"));
            var activeRunStore = new FileAgentSpawnActiveRunStore(Path.Combine(stateDir, "agent_spawn_active.json"));
            queueStore.Enqueue(new AgentSpawnQueueEntry
            {
                Id = "first",
                RunId = "run-first",
                ChildSessionKey = "child-first",
                Task = "queued first task",
                Runtime = "subagent",
                Mode = "run",
                Reason = "daily_cost_cap",
                LastError = "sessions_spawn daily cost cap rejected",
                AttemptCount = FileAgentSpawnQueueStore.MaxRetryAttempts - 2,
                EnqueuedUtc = now.AddMinutes(-3),
                NextAttemptUtc = now.AddMinutes(-1)
            });
            queueStore.Enqueue(new AgentSpawnQueueEntry
            {
                Id = "second",
                RunId = "run-second",
                ChildSessionKey = "child-second",
                Task = "queued second task",
                Runtime = "subagent",
                Mode = "run",
                Reason = "token_bucket",
                LastError = "token bucket empty",
                AttemptCount = 0,
                EnqueuedUtc = now.AddMinutes(-1),
                NextAttemptUtc = now.AddMinutes(5)
            });
            activeRunStore.Start(new AgentSpawnActiveRunEntry
            {
                RunId = "active-run",
                ChildSessionKey = "active-child",
                Runtime = "acp",
                Mode = "session",
                Backend = "codex_exec",
                BackendSessionId = "codex-exec-active",
                RunTimeoutSeconds = 900,
                StartedUtc = now.AddMinutes(-10),
                LastHeartbeatUtc = now.AddMinutes(-1),
                State = "session_active"
            });

            File.WriteAllText(
                Path.Combine(stateDir, "agent_spawn_breaker.json"),
                """
                {
                  "Enabled": true,
                  "Reason": "manual_pause",
                  "Message": "paused for operator intervention"
                }
                """
            );

            var tool = new SessionSpawnTool(
                conversationStore,
                adapter,
                admissionLimiter,
                dailyCostLedger,
                queueStore,
                new AgentSpawnRunBreaker(Path.Combine(stateDir, "agent_spawn_breaker.json"), utcNow: () => now),
                activeRunStore,
                utcNow: () => now
            );

            var status = tool.GetQueueStatus();

            Assert.True(status.BreakerBlocked);
            Assert.Equal("manual_pause", status.BreakerReason);
            Assert.Equal("paused for operator intervention", status.BreakerMessage);
            Assert.NotNull(status.Queue);
            Assert.Equal(2, status.Queue!.Total);
            Assert.Equal(1, status.Queue.Ready);
            Assert.Equal("first", status.Queue.NextEntryId);
            Assert.Equal("daily_cost_cap", status.Queue.NextReason);
            Assert.Equal("sessions_spawn daily cost cap rejected", status.Queue.NextError);
            Assert.Equal(FileAgentSpawnQueueStore.MaxRetryAttempts - 2, status.Queue.NextAttemptCount);
            Assert.Equal(1, status.Queue.NearDeadLetterCount);
            Assert.NotNull(status.Active);
            Assert.Equal(0, status.Active!.ActiveCount);
            Assert.Null(status.Active.OldestRunId);
            Assert.Equal(1, status.Active.CompletedHistoryCount);

            var service = new ToolApplicationService(
                null!,
                null!,
                null!,
                tool,
                null!,
                null!,
                null!,
                null!,
                null!
            );
            var serviceStatus = service.GetSessionSpawnStatus();

            Assert.True(serviceStatus.BreakerBlocked);
            Assert.Equal(status.Queue.NextEntryId, serviceStatus.Queue!.NextEntryId);
            Assert.Equal(status.Queue.NearDeadLetterCount, serviceStatus.Queue.NearDeadLetterCount);
            Assert.Equal(0, serviceStatus.Active!.ActiveCount);
            Assert.Equal(1, serviceStatus.Active.CompletedHistoryCount);
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
