using Omnux.Middleware;
using System.Diagnostics;

namespace Omnux.Middleware.Tests;

public sealed class AgentWorktreeSnapshotServiceTests
{
    [Fact]
    public void GetSnapshotReportsDisabledMissingRootWithoutCreatingDirectory()
    {
        var root = CreateTempRoot();
        try
        {
            var repo = Path.Combine(root, "repo");
            var worktrees = Path.Combine(root, "missing-worktrees");
            Directory.CreateDirectory(repo);

            var snapshot = new AgentWorktreeSnapshotService(
                    repo,
                    worktrees,
                    enabledFromEnvironment: false,
                    utcNow: () => DateTimeOffset.Parse("2026-06-04T00:00:00Z")
                )
                .GetSnapshot();

            Assert.Equal("disabled", snapshot.Status);
            Assert.True(snapshot.ReadOnly);
            Assert.False(snapshot.EnabledFromEnvironment);
            Assert.Equal(worktrees, snapshot.WorktreeRoot);
            Assert.Equal(0, snapshot.TotalWorktreeCount);
            Assert.False(Directory.Exists(worktrees));
            Assert.Contains(snapshot.Checks, check => check.Name == "worktree_root" && check.Status == "missing");
            Assert.Contains(snapshot.Skipped, item => item == "git_worktree_remove");
        }
        finally
        {
            DeleteTempRoot(root);
        }
    }

    [Fact]
    public void GetSnapshotReportsCleanDirtyAndCleanupCandidateWorktrees()
    {
        var root = CreateTempRoot();
        try
        {
            var repo = Path.Combine(root, "repo");
            var worktrees = Path.Combine(root, "worktrees");
            InitializeRepository(repo);
            var manager = new GitWorktreeIsolationManager(repo, worktrees, enabled: true);
            var clean = manager.Prepare("run-clean");
            var dirty = manager.Prepare("run-dirty");
            Assert.True(clean.Ready);
            Assert.True(dirty.Ready);

            File.AppendAllText(Path.Combine(dirty.WorktreePath, "README.md"), "dirty\n");
            var oldTime = DateTime.SpecifyKind(DateTime.Parse("2026-06-02T00:00:00Z"), DateTimeKind.Utc);
            Directory.SetLastWriteTimeUtc(clean.WorktreePath, oldTime);

            var snapshot = new AgentWorktreeSnapshotService(
                    repo,
                    worktrees,
                    enabledFromEnvironment: true,
                    utcNow: () => DateTimeOffset.Parse("2026-06-04T00:00:00Z")
                )
                .GetSnapshot();

            Assert.Equal("dirty_worktrees", snapshot.Status);
            Assert.True(snapshot.EnabledFromEnvironment);
            Assert.Equal(2, snapshot.TotalWorktreeCount);
            Assert.Equal(1, snapshot.CleanupCandidateCount);
            Assert.Contains(snapshot.Worktrees, item =>
                item.Name == "runclean"
                && item.Status == "clean"
                && item.CleanupCandidate
                && item.CleanupReason == "clean_and_older_than_24h");
            Assert.Contains(snapshot.Worktrees, item =>
                item.Name == "rundirty"
                && item.Status == "dirty"
                && item.HasChanges
                && item.MergeReadiness.Blockers.Contains("uncommitted_changes_present"));
        }
        finally
        {
            DeleteTempRoot(root);
        }
    }

    [Fact]
    public void GetSnapshotFlagsPlainDirectoriesForManualReview()
    {
        var root = CreateTempRoot();
        try
        {
            var repo = Path.Combine(root, "repo");
            var worktrees = Path.Combine(root, "worktrees");
            InitializeRepository(repo);
            Directory.CreateDirectory(Path.Combine(worktrees, "plain-dir"));

            var snapshot = new AgentWorktreeSnapshotService(
                    repo,
                    worktrees,
                    enabledFromEnvironment: true
                )
                .GetSnapshot();

            Assert.Equal("review_required", snapshot.Status);
            var item = Assert.Single(snapshot.Worktrees);
            Assert.Equal("invalid", item.Status);
            Assert.False(item.IsGitWorktree);
            Assert.False(item.CleanupCandidate);
            Assert.Contains("not_git_worktree", item.MergeReadiness.Blockers);
            Assert.Contains(snapshot.Warnings, warning => warning == "not_git_worktree:plain-dir");
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

    private static string CreateTempRoot()
    {
        var root = Path.Combine(Path.GetTempPath(), $"omnux-agent-worktree-snapshot-test-{Guid.NewGuid():N}");
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
