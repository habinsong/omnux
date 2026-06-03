using Omnux.Middleware;
using System.Diagnostics;

namespace Omnux.Middleware.Tests;

public sealed class GitTimeMachineSnapshotServiceTests
{
    private static readonly DateTimeOffset FixedNow = DateTimeOffset.Parse("2026-06-04T00:00:00Z");

    [Fact]
    public async Task GetSnapshotAsyncReportsRollbackReadinessForCleanRepository()
    {
        var root = CreateTempRoot();
        try
        {
            InitializeRepository(root);
            await CommitFile(root, "README.md", "one\n", "docs: add readme");
            await CommitFile(root, "src/app.cs", "two\n", "feat: add app");

            var snapshot = await new GitTimeMachineSnapshotService(root, () => FixedNow)
                .GetSnapshotAsync(10, CancellationToken.None);

            Assert.True(snapshot.IsRepository);
            Assert.True(snapshot.ReadOnly);
            Assert.True(snapshot.IsClean);
            Assert.False(snapshot.HasChanges);
            Assert.Equal(2, snapshot.Checkpoints.Count);
            Assert.False(snapshot.CheckpointsTruncated);
            Assert.Equal("ready_for_rollback_review", snapshot.Readiness.Status);
            Assert.True(snapshot.Readiness.RollbackAvailable);
            Assert.False(snapshot.Readiness.SnapshotCreationRecommended);
            Assert.StartsWith("snapshots/", snapshot.SuggestedSnapshotBranch, StringComparison.Ordinal);
            Assert.Contains(snapshot.Checks, check => check.Name == "rollback_execution" && check.Status == "skipped");
            Assert.True(snapshot.Checkpoints[0].IsHead);
            Assert.False(snapshot.Checkpoints[0].RollbackCandidate);
            Assert.Contains("current_head", snapshot.Checkpoints[0].RiskFlags);
            Assert.True(snapshot.Checkpoints[1].RollbackCandidate);
            Assert.Contains("history_rewrite_required", snapshot.Checkpoints[1].RiskFlags);
        }
        finally
        {
            DeleteTempRoot(root);
        }
    }

    [Fact]
    public async Task GetSnapshotAsyncBlocksRollbackWhenWorktreeHasUncommittedChanges()
    {
        var root = CreateTempRoot();
        try
        {
            InitializeRepository(root);
            await CommitFile(root, "README.md", "one\n", "docs: add readme");
            await File.AppendAllTextAsync(Path.Combine(root, "README.md"), "two\n");
            await File.WriteAllTextAsync(Path.Combine(root, "notes.md"), "draft\n");

            var snapshot = await new GitTimeMachineSnapshotService(root, () => FixedNow)
                .GetSnapshotAsync(10, CancellationToken.None);

            Assert.True(snapshot.HasChanges);
            Assert.False(snapshot.IsClean);
            Assert.Equal(2, snapshot.ChangedFileCount);
            Assert.Equal("manual_review_required", snapshot.Readiness.Status);
            Assert.True(snapshot.Readiness.SnapshotCreationRecommended);
            Assert.False(snapshot.Readiness.RollbackAvailable);
            Assert.Contains("uncommitted_changes_present", snapshot.Readiness.Blockers);
            Assert.Contains("rollback_would_discard_worktree_changes", snapshot.Readiness.Blockers);
            Assert.Contains(snapshot.Checks, check => check.Name == "worktree_status" && check.Status == "warning");
        }
        finally
        {
            DeleteTempRoot(root);
        }
    }

    [Fact]
    public async Task GetSnapshotAsyncBlocksRollbackWhenMergeConflictsExist()
    {
        var root = CreateTempRoot();
        try
        {
            InitializeRepository(root);
            await CommitFile(root, "conflict.txt", "base\n", "docs: add conflict base");
            var baseBranch = RunGitOutput(root, "rev-parse", "--abbrev-ref", "HEAD").Trim();
            RunGit(root, "checkout", "-b", "feature");
            await CommitFile(root, "conflict.txt", "feature\n", "feat: update conflict file");
            RunGit(root, "checkout", baseBranch);
            await CommitFile(root, "conflict.txt", "main\n", "fix: update conflict file");

            var merge = RunGitAllowFailure(root, "merge", "feature");
            Assert.NotEqual(0, merge.ExitCode);

            var snapshot = await new GitTimeMachineSnapshotService(root, () => FixedNow)
                .GetSnapshotAsync(10, CancellationToken.None);

            Assert.True(snapshot.HasChanges);
            Assert.True(snapshot.ConflictedFileCount > 0);
            Assert.Equal("blocked", snapshot.Readiness.Status);
            Assert.False(snapshot.Readiness.RollbackAvailable);
            Assert.Contains("merge_conflicts_present", snapshot.Readiness.Blockers);
            Assert.Contains(snapshot.Checks, check => check.Name == "worktree_status" && check.Status == "failed");
        }
        finally
        {
            DeleteTempRoot(root);
        }
    }

    [Fact]
    public async Task GetSnapshotAsyncReportsBlockedOutsideGitRepository()
    {
        var root = CreateTempRoot();
        try
        {
            var snapshot = await new GitTimeMachineSnapshotService(root, () => FixedNow)
                .GetSnapshotAsync(10, CancellationToken.None);

            Assert.False(snapshot.IsRepository);
            Assert.True(snapshot.ReadOnly);
            Assert.Equal("blocked", snapshot.Readiness.Status);
            Assert.Contains("not_git_repository", snapshot.Readiness.Blockers);
            Assert.Empty(snapshot.Checkpoints);
            Assert.Contains(snapshot.Checks, check => check.Name == "repository" && check.Status == "failed");
        }
        finally
        {
            DeleteTempRoot(root);
        }
    }

    private static async Task CommitFile(string root, string relativePath, string content, string message)
    {
        var path = Path.Combine(root, relativePath);
        var directory = Path.GetDirectoryName(path);
        if (!string.IsNullOrWhiteSpace(directory))
        {
            Directory.CreateDirectory(directory);
        }

        await File.WriteAllTextAsync(path, content);
        RunGit(root, "add", relativePath);
        RunGit(root, "commit", "-m", message);
    }

    private static void InitializeRepository(string root)
    {
        RunGit(root, "init");
        RunGit(root, "config", "user.email", "omnux-tests@example.invalid");
        RunGit(root, "config", "user.name", "Omnux Tests");
    }

    private static string CreateTempRoot()
    {
        var root = Path.Combine(Path.GetTempPath(), $"omnux-git-time-machine-test-{Guid.NewGuid():N}");
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

    private static string RunGitOutput(string root, params string[] arguments)
    {
        var result = RunGitAllowFailure(root, arguments);
        if (result.ExitCode != 0)
        {
            throw new InvalidOperationException($"git {string.Join(" ", arguments)} failed: {result.StdOut} {result.StdErr}");
        }

        return result.StdOut;
    }

    private static void RunGit(string root, params string[] arguments)
    {
        _ = RunGitOutput(root, arguments);
    }

    private static GitResult RunGitAllowFailure(string root, params string[] arguments)
    {
        var startInfo = new ProcessStartInfo
        {
            FileName = "git",
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            WorkingDirectory = root
        };

        startInfo.ArgumentList.Add("-C");
        startInfo.ArgumentList.Add(root);
        foreach (var argument in arguments)
        {
            startInfo.ArgumentList.Add(argument);
        }

        using var process = Process.Start(startInfo) ?? throw new InvalidOperationException("git process did not start");
        var stdout = process.StandardOutput.ReadToEnd();
        var stderr = process.StandardError.ReadToEnd();
        process.WaitForExit();
        return new GitResult(process.ExitCode, stdout, stderr);
    }

    private sealed record GitResult(int ExitCode, string StdOut, string StdErr);
}
