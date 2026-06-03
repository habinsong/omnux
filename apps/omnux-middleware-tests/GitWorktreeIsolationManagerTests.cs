using Omnux.Middleware;
using System.Diagnostics;

namespace Omnux.Middleware.Tests;

public sealed class GitWorktreeIsolationManagerTests
{
    [Fact]
    public void PrepareReturnsDisabledWhenManagerIsNotEnabled()
    {
        var root = CreateTempRoot();
        try
        {
            var repo = Path.Combine(root, "repo");
            var worktrees = Path.Combine(root, "worktrees");
            Directory.CreateDirectory(repo);

            var manager = new GitWorktreeIsolationManager(repo, worktrees, enabled: false);
            var lease = manager.Prepare("run-1");

            Assert.False(lease.Enabled);
            Assert.False(lease.Ready);
            Assert.Equal("disabled", lease.Status);
            Assert.False(Directory.Exists(worktrees));
        }
        finally
        {
            DeleteTempRoot(root);
        }
    }

    [Fact]
    public void PrepareCreatesDetachedWorktreeAndReusesExistingLease()
    {
        var root = CreateTempRoot();
        try
        {
            var repo = Path.Combine(root, "repo");
            var worktrees = Path.Combine(root, "worktrees");
            InitializeRepository(repo);

            var manager = new GitWorktreeIsolationManager(repo, worktrees, enabled: true);
            var first = manager.Prepare("run-1");
            var second = manager.Prepare("run-1");

            Assert.True(first.Enabled);
            Assert.True(first.Ready);
            Assert.True(first.CreatedWorktree);
            Assert.Equal("created", first.Status);
            Assert.True(Directory.Exists(first.WorktreePath));
            Assert.True(File.Exists(Path.Combine(first.WorktreePath, "README.md")));

            Assert.True(second.Enabled);
            Assert.True(second.Ready);
            Assert.False(second.CreatedWorktree);
            Assert.Equal("reused", second.Status);
            Assert.Equal(first.WorktreePath, second.WorktreePath);
        }
        finally
        {
            DeleteTempRoot(root);
        }
    }

    [Fact]
    public void SpawnAcpSessionForwardsWorktreeWorkspaceDirectoryToTrace()
    {
        var root = CreateTempRoot();
        var repo = Path.Combine(root, "repo");
        var stateDir = Path.Combine(root, "state");
        var worktrees = Path.Combine(root, "worktrees");
        var oldMode = Environment.GetEnvironmentVariable("OMNUX_ACP_ADAPTER_MODE");
        Directory.CreateDirectory(stateDir);

        try
        {
            InitializeRepository(repo);
            Environment.SetEnvironmentVariable("OMNUX_ACP_ADAPTER_MODE", "staged");
            var conversationStore = new ConversationStore(Path.Combine(stateDir, "conversations.json"));
            var runtimeSettings = new RuntimeSettings(new AppConfig());
            var adapter = new AcpSessionBindingAdapter(stateDir, "codex", runtimeSettings);
            var worktreeManager = new GitWorktreeIsolationManager(repo, worktrees, enabled: true);
            var tool = CreateSpawnTool(stateDir, conversationStore, adapter, worktreeManager);

            var result = tool.Spawn(
                task: "worktree bridge test",
                label: "worktree-test",
                runtime: "acp",
                runTimeoutSeconds: 120,
                timeoutSeconds: 120,
                thread: true,
                mode: "session",
                acpModel: "gpt-5-mini",
                commandPriority: "background"
            );

            Assert.Equal("accepted", result.Status);
            Assert.Contains("worktree_isolation=created", result.Note);
            Assert.Contains(worktrees, result.Note);

            var thread = conversationStore.Get(result.ChildSessionKey);
            Assert.NotNull(thread);
            Assert.Contains(thread!.Messages, message => message.Meta == "sessions_spawn_worktree_ready" && message.Text.Contains("status=created", StringComparison.Ordinal));
            Assert.Contains(thread.Messages, message => message.Meta == "sessions_spawn_acp_dispatch" && message.Text.Contains("acp.option.workspaceDirectory=", StringComparison.Ordinal));
            Assert.Contains(thread.Messages, message => message.Meta == "sessions_spawn_acp_dispatch" && message.Text.Contains(worktrees, StringComparison.Ordinal));
        }
        finally
        {
            Environment.SetEnvironmentVariable("OMNUX_ACP_ADAPTER_MODE", oldMode);
            DeleteTempRoot(root);
        }
    }

    [Fact]
    public void PrepareReportsNonGitRepositoryWithoutFallback()
    {
        var root = CreateTempRoot();
        try
        {
            var repo = Path.Combine(root, "repo");
            var worktrees = Path.Combine(root, "worktrees");
            Directory.CreateDirectory(repo);

            var manager = new GitWorktreeIsolationManager(repo, worktrees, enabled: true);
            var lease = manager.Prepare("run-1");

            Assert.True(lease.Enabled);
            Assert.False(lease.Ready);
            Assert.Equal("not_git_repository", lease.Status);
            Assert.False(Directory.Exists(lease.WorktreePath));
        }
        finally
        {
            DeleteTempRoot(root);
        }
    }

    private static void InitializeRepository(string repo)
    {
        Directory.CreateDirectory(repo);
        RunGit(repo, "init");
        RunGit(repo, "config", "user.email", "omnux-tests@example.invalid");
        RunGit(repo, "config", "user.name", "Omnux Tests");
        File.WriteAllText(Path.Combine(repo, "README.md"), "test\n");
        RunGit(repo, "add", "README.md");
        RunGit(repo, "commit", "-m", "initial");
    }

    private static SessionSpawnTool CreateSpawnTool(
        string stateDir,
        ConversationStore conversationStore,
        AcpSessionBindingAdapter adapter,
        GitWorktreeIsolationManager worktreeIsolationManager
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
            worktreeIsolationManager: worktreeIsolationManager,
            utcNow: () => DateTimeOffset.Parse("2026-06-02T00:00:00Z")
        );
    }

    private static string CreateTempRoot()
    {
        var root = Path.Combine(Path.GetTempPath(), $"omnux-worktree-isolation-test-{Guid.NewGuid():N}");
        Directory.CreateDirectory(root);
        return root;
    }

    private static void DeleteTempRoot(string root)
    {
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

    private static void RunGit(string repo, params string[] arguments)
    {
        var startInfo = new ProcessStartInfo
        {
            FileName = "git",
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            WorkingDirectory = repo
        };

        startInfo.ArgumentList.Add("-C");
        startInfo.ArgumentList.Add(repo);
        foreach (var argument in arguments)
        {
            startInfo.ArgumentList.Add(argument);
        }

        using var process = Process.Start(startInfo) ?? throw new InvalidOperationException("git process did not start");
        var stdout = process.StandardOutput.ReadToEnd();
        var stderr = process.StandardError.ReadToEnd();
        process.WaitForExit();

        if (process.ExitCode != 0)
        {
            throw new InvalidOperationException($"git {string.Join(" ", arguments)} failed: {stdout} {stderr}");
        }
    }
}
