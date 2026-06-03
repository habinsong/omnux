using Omnux.Middleware;
using System.Diagnostics;

namespace Omnux.Middleware.Tests;

public sealed class GitAutomationSnapshotServiceTests
{
    [Fact]
    public async Task GetSnapshotAsyncSummarizesStagedUnstagedAndUntrackedChanges()
    {
        var root = CreateTempRoot();
        try
        {
            InitializeRepository(root);
            Directory.CreateDirectory(Path.Combine(root, "src"));
            Directory.CreateDirectory(Path.Combine(root, "apps", "omnux-middleware-tests"));
            Directory.CreateDirectory(Path.Combine(root, "docs"));
            await File.WriteAllTextAsync(Path.Combine(root, "src", "app.cs"), "one\n");
            RunGit(root, "add", "src/app.cs");
            RunGit(root, "commit", "-m", "feat: add app");

            await File.AppendAllTextAsync(Path.Combine(root, "src", "app.cs"), "two\n");
            await File.WriteAllTextAsync(
                Path.Combine(root, "apps", "omnux-middleware-tests", "GitAutomationTests.cs"),
                "test\n"
            );
            RunGit(root, "add", "apps/omnux-middleware-tests/GitAutomationTests.cs");
            await File.WriteAllTextAsync(Path.Combine(root, "docs", "note.md"), "note\n");

            var snapshot = await new GitAutomationSnapshotService(root)
                .GetSnapshotAsync(20, CancellationToken.None);

            Assert.True(snapshot.ReadOnly);
            Assert.True(snapshot.HasChanges);
            Assert.False(snapshot.IsClean);
            Assert.Equal(3, snapshot.ChangedFileCount);
            Assert.Equal(1, snapshot.StagedFileCount);
            Assert.Equal(1, snapshot.UnstagedFileCount);
            Assert.Equal(1, snapshot.UntrackedFileCount);
            Assert.False(snapshot.FilesTruncated);
            Assert.Equal("ready_for_review", snapshot.Readiness.Status);
            Assert.True(snapshot.Readiness.CommitRecommended);
            Assert.True(snapshot.Readiness.PullRequestRecommended);
            Assert.True(snapshot.Readiness.RequiresApproval);
            Assert.NotEmpty(snapshot.SuggestedCommitMessage);
            Assert.StartsWith("feat", snapshot.SuggestedCommitMessage, StringComparison.Ordinal);
            Assert.StartsWith("codex/", snapshot.SuggestedBranchName, StringComparison.Ordinal);
            Assert.Contains(snapshot.Files, file => file.Path == "src/app.cs" && file.Unstaged);
            Assert.Contains(snapshot.Files, file => file.Path == "apps/omnux-middleware-tests/GitAutomationTests.cs" && file.Staged);
            Assert.Contains(snapshot.Files, file => file.Path == "docs/note.md" && file.Untracked);
        }
        finally
        {
            DeleteTempRoot(root);
        }
    }

    [Fact]
    public async Task GetSnapshotAsyncReportsCleanRepository()
    {
        var root = CreateTempRoot();
        try
        {
            InitializeRepository(root);
            await File.WriteAllTextAsync(Path.Combine(root, "README.md"), "readme\n");
            RunGit(root, "add", "README.md");
            RunGit(root, "commit", "-m", "docs: add readme");

            var snapshot = await new GitAutomationSnapshotService(root)
                .GetSnapshotAsync(null, CancellationToken.None);

            Assert.False(snapshot.HasChanges);
            Assert.True(snapshot.IsClean);
            Assert.Equal(0, snapshot.ChangedFileCount);
            Assert.Equal("clean", snapshot.Readiness.Status);
            Assert.Contains("no_changes", snapshot.Readiness.Blockers);
            Assert.Empty(snapshot.SuggestedCommitMessage);
        }
        finally
        {
            DeleteTempRoot(root);
        }
    }

    [Fact]
    public async Task GetSnapshotAsyncReturnsWarningOutsideGitRepository()
    {
        var root = CreateTempRoot();
        try
        {
            var snapshot = await new GitAutomationSnapshotService(root)
                .GetSnapshotAsync(10, CancellationToken.None);

            Assert.False(snapshot.HasChanges);
            Assert.NotEmpty(snapshot.Warnings);
            Assert.Equal("clean", snapshot.Readiness.Status);
        }
        finally
        {
            DeleteTempRoot(root);
        }
    }

    private static void InitializeRepository(string root)
    {
        RunGit(root, "init");
        RunGit(root, "config", "user.email", "omnux-tests@example.invalid");
        RunGit(root, "config", "user.name", "Omnux Tests");
    }

    private static string CreateTempRoot()
    {
        var root = Path.Combine(Path.GetTempPath(), $"omnux-git-automation-test-{Guid.NewGuid():N}");
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

    private static void RunGit(string root, params string[] arguments)
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

        if (process.ExitCode != 0)
        {
            throw new InvalidOperationException($"git {string.Join(" ", arguments)} failed: {stdout} {stderr}");
        }
    }
}
