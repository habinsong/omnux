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
            Assert.False(snapshot.Remote.HasRemote);
            Assert.Equal("missing_remote", snapshot.PublishReadiness.Status);
            Assert.False(snapshot.PublishReadiness.PushReady);
            Assert.False(snapshot.PublishReadiness.PullRequestReady);
            Assert.Contains("no_remote", snapshot.PublishReadiness.Blockers);
            Assert.Contains("gh_pr_create", snapshot.PublishReadiness.Skipped);
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
            Assert.Equal("clean", snapshot.PublishReadiness.Status);
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
            Assert.False(snapshot.Remote.HasRemote);
        }
        finally
        {
            DeleteTempRoot(root);
        }
    }

    [Fact]
    public async Task GetSnapshotAsyncKeepsTotalChangedFileCountWhenFilesAreTruncated()
    {
        var root = CreateTempRoot();
        try
        {
            InitializeRepository(root);
            await File.WriteAllTextAsync(Path.Combine(root, "README.md"), "readme\n");
            RunGit(root, "add", "README.md");
            RunGit(root, "commit", "-m", "docs: add readme");
            await File.WriteAllTextAsync(Path.Combine(root, "one.txt"), "one\n");
            await File.WriteAllTextAsync(Path.Combine(root, "two.txt"), "two\n");
            await File.WriteAllTextAsync(Path.Combine(root, "three.txt"), "three\n");

            var snapshot = await new GitAutomationSnapshotService(root)
                .GetSnapshotAsync(2, CancellationToken.None);

            Assert.Equal(3, snapshot.ChangedFileCount);
            Assert.Equal(2, snapshot.Files.Count);
            Assert.True(snapshot.FilesTruncated);
        }
        finally
        {
            DeleteTempRoot(root);
        }
    }

    [Fact]
    public async Task GetSnapshotAsyncReportsRemoteAndUpstreamReadiness()
    {
        var parent = CreateTempRoot();
        var root = Path.Combine(parent, "repo");
        var remoteRoot = Path.Combine(parent, "remote.git");
        try
        {
            Directory.CreateDirectory(root);
            InitializeRepository(root);
            await File.WriteAllTextAsync(Path.Combine(root, "README.md"), "readme\n");
            RunGit(root, "add", "README.md");
            RunGit(root, "commit", "-m", "docs: add readme");
            RunGit(root, "init", "--bare", remoteRoot);
            RunGit(root, "remote", "add", "origin", remoteRoot);
            RunGit(root, "push", "-u", "origin", "HEAD");
            await File.AppendAllTextAsync(Path.Combine(root, "README.md"), "more\n");

            var snapshot = await new GitAutomationSnapshotService(root)
                .GetSnapshotAsync(20, CancellationToken.None);

            Assert.True(snapshot.Remote.HasRemote);
            Assert.Contains("origin", snapshot.Remote.RemoteNames);
            Assert.Equal("origin", snapshot.Remote.PrimaryRemote);
            Assert.True(snapshot.Remote.HasUpstream);
            Assert.NotEmpty(snapshot.Remote.UpstreamName);
            Assert.Equal(0, snapshot.Remote.AheadCount);
            Assert.Equal(0, snapshot.Remote.BehindCount);
            Assert.StartsWith("origin/", snapshot.Remote.SuggestedPushTarget, StringComparison.Ordinal);
            Assert.True(snapshot.PublishReadiness.PushReady);
            Assert.Equal(
                snapshot.Toolchain.GitHubCli.Status == "available",
                snapshot.PublishReadiness.PullRequestReady
            );
        }
        finally
        {
            DeleteTempRoot(parent);
        }
    }

    [Fact]
    public async Task GetSnapshotAsyncReportsInitialPushReadinessWhenRemoteHasNoUpstream()
    {
        var parent = CreateTempRoot();
        var root = Path.Combine(parent, "repo");
        var remoteRoot = Path.Combine(parent, "remote.git");
        try
        {
            Directory.CreateDirectory(root);
            InitializeRepository(root);
            await File.WriteAllTextAsync(Path.Combine(root, "README.md"), "readme\n");
            RunGit(root, "add", "README.md");
            RunGit(root, "commit", "-m", "docs: add readme");
            RunGit(root, "init", "--bare", remoteRoot);
            RunGit(root, "remote", "add", "origin", remoteRoot);
            await File.AppendAllTextAsync(Path.Combine(root, "README.md"), "more\n");

            var snapshot = await new GitAutomationSnapshotService(root)
                .GetSnapshotAsync(20, CancellationToken.None);

            Assert.True(snapshot.Remote.HasRemote);
            Assert.False(snapshot.Remote.HasUpstream);
            Assert.Equal("needs_initial_push", snapshot.PublishReadiness.Status);
            Assert.True(snapshot.PublishReadiness.PushReady);
            Assert.False(snapshot.PublishReadiness.PullRequestReady);
            Assert.Contains("no_upstream", snapshot.PublishReadiness.Blockers);
        }
        finally
        {
            DeleteTempRoot(parent);
        }
    }

    [Fact]
    public async Task GetSnapshotAsyncRedactsCredentialedRemoteUrls()
    {
        var root = CreateTempRoot();
        try
        {
            InitializeRepository(root);
            await File.WriteAllTextAsync(Path.Combine(root, "README.md"), "readme\n");
            RunGit(root, "add", "README.md");
            RunGit(root, "commit", "-m", "docs: add readme");
            RunGit(root, "remote", "add", "origin", "https://token@example.com/org/repo.git?secret=1");

            var snapshot = await new GitAutomationSnapshotService(root)
                .GetSnapshotAsync(20, CancellationToken.None);

            Assert.Equal("https://***@example.com/org/repo.git?***", snapshot.Remote.PrimaryRemoteUrl);
            Assert.DoesNotContain("token", snapshot.Remote.PrimaryRemoteUrl, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("secret=1", snapshot.Remote.PrimaryRemoteUrl, StringComparison.OrdinalIgnoreCase);
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
