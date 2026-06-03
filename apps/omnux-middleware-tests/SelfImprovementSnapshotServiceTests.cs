using Omnux.Middleware;
using System.Diagnostics;

namespace Omnux.Middleware.Tests;

public sealed class SelfImprovementSnapshotServiceTests
{
    [Fact]
    public async Task GetSnapshotAsyncBuildsReadOnlyImprovementProposals()
    {
        var root = CreateTempRoot();
        try
        {
            InitializeRepository(root);
            Directory.CreateDirectory(Path.Combine(root, "src"));
            var appPath = Path.Combine(root, "src", "app.cs");
            await File.WriteAllTextAsync(appPath, "one\n");
            RunGit(root, "add", "src/app.cs");
            RunGit(root, "commit", "-m", "feat: add app");

            await File.AppendAllTextAsync(appPath, "fix one\n");
            RunGit(root, "add", "src/app.cs");
            RunGit(root, "commit", "-m", "fix: handle first crash");

            await File.AppendAllTextAsync(appPath, "fix two\n");
            RunGit(root, "add", "src/app.cs");
            RunGit(root, "commit", "-m", "fix: handle second crash");

            await File.AppendAllTextAsync(appPath, "dirty\n");

            var snapshot = await new SelfImprovementSnapshotService(
                    root,
                    utcNow: () => DateTimeOffset.Parse("2026-06-04T00:00:00Z")
                )
                .GetSnapshotAsync(20, CancellationToken.None);

            Assert.Equal("proposal_ready", snapshot.Status);
            Assert.True(snapshot.ProposalCount >= 3);
            Assert.Contains(snapshot.Proposals, proposal => proposal.Kind == "workspace_hygiene");
            Assert.Contains(snapshot.Proposals, proposal => proposal.Kind == "learning_review");
            Assert.Contains(snapshot.Proposals, proposal => proposal.Kind == "hotspot_review" && proposal.TargetPath == "src/app.cs");
            Assert.All(snapshot.Proposals, proposal => Assert.True(proposal.RequiresApproval));
            Assert.Equal(DateTimeOffset.Parse("2026-06-04T00:00:00Z"), snapshot.ScannedAtUtc);
        }
        finally
        {
            DeleteTempRoot(root);
        }
    }

    [Fact]
    public async Task GetSnapshotAsyncReturnsNoProposalsForCleanLowSignalRepository()
    {
        var root = CreateTempRoot();
        try
        {
            InitializeRepository(root);
            await File.WriteAllTextAsync(Path.Combine(root, "README.md"), "readme\n");
            RunGit(root, "add", "README.md");
            RunGit(root, "commit", "-m", "docs: add readme");

            var snapshot = await new SelfImprovementSnapshotService(root)
                .GetSnapshotAsync(null, CancellationToken.None);

            Assert.Equal("no_proposals", snapshot.Status);
            Assert.Equal(0, snapshot.ProposalCount);
            Assert.Empty(snapshot.Proposals);
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
        var root = Path.Combine(Path.GetTempPath(), $"omnux-self-improvement-test-{Guid.NewGuid():N}");
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
