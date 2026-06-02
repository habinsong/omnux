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
    public async Task Spawn_AcpCommandModeCreatesWorkspaceRollbackSnapshotAndRestoreWorks()
    {
        if (OperatingSystem.IsWindows())
        {
            return;
        }

        var root = Path.Combine(Path.GetTempPath(), "omnux-acp-rollback-live-tests", Guid.NewGuid().ToString("N"));
        var workspace = Path.Combine(root, "workspace");
        var stateDir = Path.Combine(root, "state");
        var previewRoot = Path.Combine(root, ".runtime", "refactor-preview");
        var oldMode = Environment.GetEnvironmentVariable("OMNUX_ACP_ADAPTER_MODE");
        var oldCommand = Environment.GetEnvironmentVariable("OMNUX_ACP_ADAPTER_COMMAND");
        Directory.CreateDirectory(workspace);
        Directory.CreateDirectory(stateDir);

        try
        {
            var watched = Path.Combine(workspace, "watched.txt");
            var created = Path.Combine(workspace, "created.txt");
            var deleted = Path.Combine(workspace, "deleted.txt");
            await File.WriteAllTextAsync(watched, "before\n");
            await File.WriteAllTextAsync(deleted, "delete me\n");
            var commandPath = Path.Combine(root, "fake-acp-command.sh");
            await File.WriteAllTextAsync(
                commandPath,
                """
                #!/bin/sh
                cat >/dev/null
                printf 'after\n' > watched.txt
                printf 'created\n' > created.txt
                rm deleted.txt
                printf '{"status":"accepted","backend":"codex_exec","message":"fake command ok","backendSessionId":"codex-live-test","rawOutput":"done"}'
                """
            );
            File.SetUnixFileMode(
                commandPath,
                UnixFileMode.UserRead
                | UnixFileMode.UserWrite
                | UnixFileMode.UserExecute
                | UnixFileMode.GroupRead
                | UnixFileMode.GroupExecute
                | UnixFileMode.OtherRead
                | UnixFileMode.OtherExecute
            );

            Environment.SetEnvironmentVariable("OMNUX_ACP_ADAPTER_MODE", "command");
            Environment.SetEnvironmentVariable("OMNUX_ACP_ADAPTER_COMMAND", commandPath);
            var paths = BuildPaths(root, workspace, stateDir);
            var rollbackStore = new FileRefactorPreviewStore(
                new TestStatePathResolver(root, workspace, stateDir),
                ttlMinutes: 30,
                previewRootDir: previewRoot
            );
            var diffPreview = new DiffPreviewService(paths, rollbackStore);
            var conversationStore = new ConversationStore(Path.Combine(stateDir, "conversations.json"));
            var runtimeSettings = new RuntimeSettings(new AppConfig());
            var adapter = new AcpSessionBindingAdapter(workspace, "codex", runtimeSettings);
            var activeRunStore = new FileAgentSpawnActiveRunStore(Path.Combine(stateDir, "agent_spawn_active.json"));
            var tool = CreateSpawnTool(
                stateDir,
                conversationStore,
                adapter,
                new AgentSpawnWorkspaceRollbackPolicy(
                    paths,
                    diffPreview,
                    utcNow: () => DateTimeOffset.Parse("2026-06-02T00:00:00Z")
                ),
                activeRunStore
            );

            var result = tool.Spawn(
                task: "modify watched, create created, delete deleted",
                label: "rollback-live",
                runtime: "acp",
                runTimeoutSeconds: 120,
                timeoutSeconds: 120,
                thread: false,
                mode: "run",
                acpModel: "gpt-5-mini",
                commandPriority: "background"
            );

            Assert.Equal("accepted", result.Status);
            Assert.Contains("workspace_rollback_id=", result.Note);
            Assert.Equal("after\n", await File.ReadAllTextAsync(watched));
            Assert.Equal("created\n", await File.ReadAllTextAsync(created));
            Assert.False(File.Exists(deleted));

            var rollbackId = ExtractToken(result.Note!, "workspace_rollback_id=");
            Assert.False(string.IsNullOrWhiteSpace(rollbackId));
            Assert.NotNull(rollbackStore.TryLoadRollback(rollbackId));
            var thread = conversationStore.Get(result.ChildSessionKey);
            Assert.NotNull(thread);
            Assert.Contains(
                thread!.Messages,
                message => message.Meta == "sessions_spawn_workspace_rollback_ready"
                           && message.Text.Contains(rollbackId, StringComparison.Ordinal)
            );

            var restore = await BuildRefactorService(root, workspace, stateDir, rollbackStore)
                .RestoreRollbackAsync(rollbackId, CancellationToken.None);

            Assert.True(restore.Ok);
            Assert.Equal("before\n", await File.ReadAllTextAsync(watched));
            Assert.False(File.Exists(created));
            Assert.Equal("delete me\n", await File.ReadAllTextAsync(deleted));
        }
        finally
        {
            Environment.SetEnvironmentVariable("OMNUX_ACP_ADAPTER_MODE", oldMode);
            Environment.SetEnvironmentVariable("OMNUX_ACP_ADAPTER_COMMAND", oldCommand);
            try
            {
                if (Directory.Exists(root))
                {
                    Directory.Delete(root, recursive: true);
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
        AcpSessionBindingAdapter adapter,
        AgentSpawnWorkspaceRollbackPolicy? workspaceRollbackPolicy = null,
        FileAgentSpawnActiveRunStore? activeRunStore = null
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
        return new SessionSpawnTool(
            conversationStore,
            adapter,
            admissionLimiter,
            dailyCostLedger,
            activeRunStore: activeRunStore,
            workspaceRollbackPolicy: workspaceRollbackPolicy,
            utcNow: () => DateTimeOffset.Parse("2026-06-02T00:00:00Z")
        );
    }

    private static string ExtractToken(string text, string prefix)
    {
        var start = text.IndexOf(prefix, StringComparison.Ordinal);
        Assert.True(start >= 0);
        start += prefix.Length;
        var end = text.IndexOfAny(new[] { ' ', '.', '\n', '\r', '\t' }, start);
        return (end < 0 ? text[start..] : text[start..end]).Trim();
    }

    private static PathOptions BuildPaths(string root, string workspace, string stateDir)
    {
        return new PathOptions(
            Path.Combine(root, "index.html"),
            Path.Combine(stateDir, "llm_usage.json"),
            Path.Combine(stateDir, "copilot_usage.json"),
            Path.Combine(stateDir, "conversations.json"),
            Path.Combine(stateDir, "auth_sessions.json"),
            Path.Combine(stateDir, "memory-notes"),
            Path.Combine(stateDir, "code-runs"),
            Path.Combine(workspace, "routines"),
            workspace,
            Path.Combine(stateDir, "routines.json"),
            Path.Combine(workspace, "_routine_prompts"),
            Path.Combine(stateDir, "audit.log"),
            Path.Combine(stateDir, "guard_retry_timeline.json"),
            Path.Combine(stateDir, "gateway_health.json"),
            Path.Combine(stateDir, "gateway_startup_probe.json"),
            Path.Combine(stateDir, "dashboard_access.json"),
            Path.Combine(root, "sandbox.py")
        );
    }

    private static RefactorApplicationService BuildRefactorService(
        string root,
        string workspace,
        string stateDir,
        FileRefactorPreviewStore rollbackStore
    )
    {
        var paths = BuildPaths(root, workspace, stateDir);
        var anchorRead = new AnchorReadService(paths);
        var diffPreview = new DiffPreviewService(paths, rollbackStore);
        return new RefactorApplicationService(
            anchorRead,
            new AnchorEditService(),
            diffPreview,
            new LspRefactorService(
                paths,
                new RefactorOptions(false, false, 30, "TEAM_GUIDE.md,.agents.md", 65536),
                new RefactorToolAvailability(),
                anchorRead,
                diffPreview
            ),
            new AstGrepRefactorService(
                new RefactorOptions(false, false, 30, "TEAM_GUIDE.md,.agents.md", 65536),
                new RefactorToolAvailability(),
                anchorRead,
                diffPreview
            ),
            new AuditLogger(Path.Combine(stateDir, "audit.log")),
            paths
        );
    }

    private sealed class TestStatePathResolver : IStatePathResolver
    {
        public TestStatePathResolver(string root, string workspace, string stateDir)
        {
            StateRootDir = stateDir;
            WorkspaceRootDir = workspace;
            DashboardIndexPath = Path.Combine(root, "index.html");
            RoutinePromptDir = Path.Combine(workspace, "_routine_prompts");
        }

        public string StateRootDir { get; }
        public string WorkspaceRootDir { get; }
        public string DashboardIndexPath { get; }
        public string RoutinePromptDir { get; }
        public string GetDoctorRoot() => Path.Combine(StateRootDir, "doctor");
        public string GetDoctorLastReportPath() => Path.Combine(GetDoctorRoot(), "last-report.json");
        public string GetDoctorHistoryRoot() => Path.Combine(GetDoctorRoot(), "history");
        public string GetPlansRoot() => Path.Combine(StateRootDir, "plans");
        public string GetPlansIndexPath() => Path.Combine(GetPlansRoot(), "index.json");
        public string GetRoutingPolicyPath() => Path.Combine(StateRootDir, "routing-policy.json");
        public string GetTaskGraphsRoot() => Path.Combine(StateRootDir, "tasks");
        public string GetTaskGraphsIndexPath() => Path.Combine(GetTaskGraphsRoot(), "index.json");
        public string GetTaskRuntimeRoot() => Path.Combine(StateRootDir, ".runtime", "tasks");
        public string GetTaskRuntimePath(string graphId, string taskId) => Path.Combine(GetTaskRuntimeRoot(), graphId, taskId);
        public string GetLogicRuntimeRoot() => Path.Combine(StateRootDir, ".runtime", "logic");
        public string GetLogicRuntimePath(string routineId, string runId) => Path.Combine(GetLogicRuntimeRoot(), routineId, runId);
        public string GetNotebooksRoot() => Path.Combine(StateRootDir, "notebooks");
        public string GetNotebookProjectRoot(string projectKey) => Path.Combine(GetNotebooksRoot(), projectKey);
        public string GetRefactorPreviewRoot() => Path.Combine(StateRootDir, ".runtime", "refactor-preview");
        public string GetRefactorPreviewPath(string previewId) => Path.Combine(GetRefactorPreviewRoot(), $"{previewId}.json");
        public string GetTelegramReplyOutboxPath() => Path.Combine(StateRootDir, "telegram_reply_outbox.json");
        public string GetGlobalSkillsRoot() => Path.Combine(StateRootDir, "skills");
        public string GetGlobalCommandsRoot() => Path.Combine(StateRootDir, "commands");
        public string ResolveStateFilePath(string fileName) => Path.Combine(StateRootDir, fileName);
        public string ResolveStateDirectoryPath(string directoryName) => Path.Combine(StateRootDir, directoryName);
    }
}
