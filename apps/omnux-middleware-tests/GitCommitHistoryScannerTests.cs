using System.Diagnostics;
using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class GitCommitHistoryScannerTests
{
    [Fact]
    public async Task GetSnapshotAsyncClassifiesRecentCommitsAndHotspots()
    {
        var root = Path.Combine(Path.GetTempPath(), $"omnux-git-learning-test-{Guid.NewGuid():N}");
        Directory.CreateDirectory(root);

        try
        {
            await RunGitAsync(root, "init");
            await RunGitAsync(root, "config", "user.email", "test@example.com");
            await RunGitAsync(root, "config", "user.name", "Test User");

            await File.WriteAllTextAsync(Path.Combine(root, "app.txt"), "one\n");
            await RunGitAsync(root, "add", "app.txt");
            await RunGitAsync(root, "commit", "-m", "feat: add app shell");

            await File.AppendAllTextAsync(Path.Combine(root, "app.txt"), "two\n");
            await RunGitAsync(root, "add", "app.txt");
            await RunGitAsync(root, "commit", "-m", "fix: handle app crash");

            var snapshot = await new GitCommitHistoryScanner(root).GetSnapshotAsync(10, CancellationToken.None);

            Assert.Equal(2, snapshot.TotalCommits);
            Assert.Empty(snapshot.Warnings);
            Assert.Equal("bug_fix", snapshot.Commits[0].Intent);
            Assert.Equal("feature", snapshot.Commits[1].Intent);
            Assert.Contains(snapshot.Intents, intent => intent.Intent == "bug_fix" && intent.CommitCount == 1);

            var hotspot = Assert.Single(snapshot.Hotspots);
            Assert.Equal("app.txt", hotspot.Path);
            Assert.Equal(2, hotspot.ChangeCount);
            Assert.Equal(snapshot.Commits[0].ShortHash, hotspot.LastCommitShortHash);
        }
        finally
        {
            TryDeleteDirectory(root);
        }
    }

    [Fact]
    public async Task GetSnapshotAsyncReturnsWarningOutsideGitRepository()
    {
        var root = Path.Combine(Path.GetTempPath(), $"omnux-git-learning-test-{Guid.NewGuid():N}");
        Directory.CreateDirectory(root);

        try
        {
            var snapshot = await new GitCommitHistoryScanner(root).GetSnapshotAsync(10, CancellationToken.None);

            Assert.Empty(snapshot.Commits);
            Assert.NotEmpty(snapshot.Warnings);
            Assert.Equal(0, snapshot.TotalCommits);
        }
        finally
        {
            TryDeleteDirectory(root);
        }
    }

    private static async Task RunGitAsync(string workingDirectory, params string[] arguments)
    {
        var startInfo = new ProcessStartInfo
        {
            FileName = "git",
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            WorkingDirectory = workingDirectory
        };

        foreach (var argument in arguments)
        {
            startInfo.ArgumentList.Add(argument);
        }

        using var process = new Process { StartInfo = startInfo };
        process.Start();
        var stdoutTask = process.StandardOutput.ReadToEndAsync();
        var stderrTask = process.StandardError.ReadToEndAsync();
        await process.WaitForExitAsync();
        if (process.ExitCode != 0)
        {
            throw new InvalidOperationException(
                $"git {string.Join(' ', arguments)} failed: {await stdoutTask} {await stderrTask}"
            );
        }
    }

    private static void TryDeleteDirectory(string path)
    {
        try
        {
            if (Directory.Exists(path))
            {
                Directory.Delete(path, recursive: true);
            }
        }
        catch
        {
        }
    }
}
