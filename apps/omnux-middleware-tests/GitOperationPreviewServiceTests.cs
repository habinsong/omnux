using Omnux.Middleware;
using System.Diagnostics;

namespace Omnux.Middleware.Tests;

public sealed class GitOperationPreviewServiceTests
{
    [Fact]
    public async Task CreateBranchPreviewAndApplySucceedsInCleanRepository()
    {
        var root = CreateTempRoot();
        try
        {
            InitializeRepository(root);
            await WriteTextAsync(root, "README.md", "readme\n");
            RunGit(root, "add", "README.md");
            RunGit(root, "commit", "-m", "docs: add readme");

            var service = BuildService(root, out _);
            var preview = await service.PreviewAsync(
                new GitOperationPreviewRequest(
                    GitOperationNames.CreateBranch,
                    "codex/git-operation-branch",
                    string.Empty,
                    Array.Empty<string>()
                ),
                CancellationToken.None
            );

            Assert.True(preview.Ok);
            Assert.NotNull(preview.Approval);
            Assert.Equal(GitOperationNames.CreateBranch, preview.Operation);
            Assert.Contains(preview.PlannedCommands, command => command.Display == "git checkout -b codex/git-operation-branch");

            var apply = await service.ApplyAsync(
                new GitOperationApplyRequest(preview.PreviewId, preview.Approval!.ConfirmationToken, string.Empty),
                new GitOperationExecutor(root),
                CancellationToken.None
            );

            Assert.True(apply.Ok);
            Assert.Equal("codex/git-operation-branch", RunGit(root, "rev-parse", "--abbrev-ref", "HEAD").Trim());
        }
        finally
        {
            DeleteTempRoot(root);
        }
    }

    [Fact]
    public async Task StageAndCommitOnlyStagesSelectedPaths()
    {
        var root = CreateTempRoot();
        try
        {
            InitializeRepository(root);
            await WriteTextAsync(root, "a.txt", "a1\n");
            await WriteTextAsync(root, "b.txt", "b1\n");
            RunGit(root, "add", "a.txt", "b.txt");
            RunGit(root, "commit", "-m", "test: seed");
            await WriteTextAsync(root, "a.txt", "a2\n");
            await WriteTextAsync(root, "b.txt", "b2\n");

            var service = BuildService(root, out _);
            var preview = await service.PreviewAsync(
                new GitOperationPreviewRequest(
                    GitOperationNames.StageAndCommit,
                    string.Empty,
                    "test: commit selected a",
                    new[] { "a.txt" }
                ),
                CancellationToken.None
            );

            Assert.True(preview.Ok);

            var apply = await service.ApplyAsync(
                new GitOperationApplyRequest(preview.PreviewId, preview.Approval!.ConfirmationToken, string.Empty),
                new GitOperationExecutor(root),
                CancellationToken.None
            );

            Assert.True(apply.Ok);
            var status = RunGit(root, "status", "--porcelain=v1", "-uall");
            Assert.DoesNotContain("a.txt", status, StringComparison.Ordinal);
            Assert.Contains(" M b.txt", status, StringComparison.Ordinal);
        }
        finally
        {
            DeleteTempRoot(root);
        }
    }

    [Fact]
    public async Task StageAndCommitCanCommitSelectedUntrackedFileWithApprovalPayload()
    {
        var root = CreateTempRoot();
        try
        {
            InitializeRepository(root);
            await WriteTextAsync(root, "README.md", "readme\n");
            RunGit(root, "add", "README.md");
            RunGit(root, "commit", "-m", "docs: seed");
            await WriteTextAsync(root, "new.txt", "new\n");

            var service = BuildService(root, out _);
            var preview = await service.PreviewAsync(
                new GitOperationPreviewRequest(
                    GitOperationNames.StageAndCommit,
                    string.Empty,
                    "test: add new file",
                    new[] { "new.txt" }
                ),
                CancellationToken.None
            );

            Assert.True(preview.Ok);

            var apply = await service.ApplyAsync(
                new GitOperationApplyRequest(
                    preview.PreviewId,
                    string.Empty,
                    GitOperationJson.Serialize(preview.Approval!)
                ),
                new GitOperationExecutor(root),
                CancellationToken.None
            );

            Assert.True(apply.Ok);
            Assert.True(string.IsNullOrWhiteSpace(RunGit(root, "status", "--porcelain=v1", "-uall")));
        }
        finally
        {
            DeleteTempRoot(root);
        }
    }

    [Fact]
    public async Task PreviewBlocksConflictFiles()
    {
        var root = CreateTempRoot();
        try
        {
            InitializeRepository(root);
            await WriteTextAsync(root, "conflict.txt", "base\n");
            RunGit(root, "add", "conflict.txt");
            RunGit(root, "commit", "-m", "test: base");
            var originalBranch = RunGit(root, "rev-parse", "--abbrev-ref", "HEAD").Trim();
            RunGit(root, "checkout", "-b", "side");
            await WriteTextAsync(root, "conflict.txt", "side\n");
            RunGit(root, "add", "conflict.txt");
            RunGit(root, "commit", "-m", "test: side");
            RunGit(root, "checkout", originalBranch);
            await WriteTextAsync(root, "conflict.txt", "main\n");
            RunGit(root, "add", "conflict.txt");
            RunGit(root, "commit", "-m", "test: main");
            var merge = RunGitResult(root, "merge", "side");
            Assert.NotEqual(0, merge.ExitCode);

            var service = BuildService(root, out _);
            var preview = await service.PreviewAsync(
                new GitOperationPreviewRequest(
                    GitOperationNames.StageAndCommit,
                    string.Empty,
                    "test: conflict",
                    new[] { "conflict.txt" }
                ),
                CancellationToken.None
            );

            Assert.False(preview.Ok);
            Assert.Contains("merge_conflicts_present", preview.Blockers);
        }
        finally
        {
            DeleteTempRoot(root);
        }
    }

    [Fact]
    public async Task ApplyBlocksWhenHeadChangesAfterPreview()
    {
        var root = CreateTempRoot();
        try
        {
            InitializeRepository(root);
            await WriteTextAsync(root, "a.txt", "a1\n");
            RunGit(root, "add", "a.txt");
            RunGit(root, "commit", "-m", "test: seed");
            await WriteTextAsync(root, "a.txt", "a2\n");

            var service = BuildService(root, out _);
            var preview = await service.PreviewAsync(
                new GitOperationPreviewRequest(
                    GitOperationNames.StageAndCommit,
                    string.Empty,
                    "test: commit a",
                    new[] { "a.txt" }
                ),
                CancellationToken.None
            );
            Assert.True(preview.Ok);

            await WriteTextAsync(root, "other.txt", "other\n");
            RunGit(root, "add", "other.txt");
            RunGit(root, "commit", "-m", "test: move head");

            var apply = await service.ApplyAsync(
                new GitOperationApplyRequest(preview.PreviewId, preview.Approval!.ConfirmationToken, string.Empty),
                new GitOperationExecutor(root),
                CancellationToken.None
            );

            Assert.False(apply.Ok);
            Assert.Contains("head_changed", apply.Blockers);
        }
        finally
        {
            DeleteTempRoot(root);
        }
    }

    [Fact]
    public async Task ApplyBlocksWhenSelectedFileStatusChangesAfterPreview()
    {
        var root = CreateTempRoot();
        try
        {
            InitializeRepository(root);
            await WriteTextAsync(root, "a.txt", "a1\n");
            RunGit(root, "add", "a.txt");
            RunGit(root, "commit", "-m", "test: seed");
            await WriteTextAsync(root, "a.txt", "a2\n");

            var service = BuildService(root, out _);
            var preview = await service.PreviewAsync(
                new GitOperationPreviewRequest(
                    GitOperationNames.StageAndCommit,
                    string.Empty,
                    "test: commit a",
                    new[] { "a.txt" }
                ),
                CancellationToken.None
            );
            Assert.True(preview.Ok);

            RunGit(root, "add", "a.txt");
            var apply = await service.ApplyAsync(
                new GitOperationApplyRequest(preview.PreviewId, preview.Approval!.ConfirmationToken, string.Empty),
                new GitOperationExecutor(root),
                CancellationToken.None
            );

            Assert.False(apply.Ok);
            Assert.Contains("file_status_changed", apply.Blockers);
        }
        finally
        {
            DeleteTempRoot(root);
        }
    }

    [Fact]
    public async Task PreviewBlocksPathTraversal()
    {
        var root = CreateTempRoot();
        try
        {
            InitializeRepository(root);
            await WriteTextAsync(root, "README.md", "readme\n");
            RunGit(root, "add", "README.md");
            RunGit(root, "commit", "-m", "docs: seed");
            await WriteTextAsync(root, "a.txt", "a\n");

            var service = BuildService(root, out _);
            var preview = await service.PreviewAsync(
                new GitOperationPreviewRequest(
                    GitOperationNames.StageAndCommit,
                    string.Empty,
                    "test: blocked",
                    new[] { "../outside.txt" }
                ),
                CancellationToken.None
            );

            Assert.False(preview.Ok);
            Assert.Contains("path_traversal", preview.Blockers);
        }
        finally
        {
            DeleteTempRoot(root);
        }
    }

    [Fact]
    public async Task ApplyBlocksExpiredPreview()
    {
        var root = CreateTempRoot();
        try
        {
            InitializeRepository(root);
            await WriteTextAsync(root, "README.md", "readme\n");
            RunGit(root, "add", "README.md");
            RunGit(root, "commit", "-m", "docs: seed");
            await WriteTextAsync(root, "a.txt", "a\n");

            var now = DateTimeOffset.Parse("2026-06-04T00:00:00Z");
            var storePath = Path.Combine(root, ".git", "omnux-test-state", "git_operation_previews.json");
            var store = new FileGitOperationPreviewStore(
                storePath,
                TimeSpan.FromMinutes(30),
                () => now
            );
            var service = new GitOperationPreviewService(root, store, () => now);
            var preview = await service.PreviewAsync(
                new GitOperationPreviewRequest(
                    GitOperationNames.StageAndCommit,
                    string.Empty,
                    "test: expiring",
                    new[] { "a.txt" }
                ),
                CancellationToken.None
            );
            Assert.True(preview.Ok);

            now = now.AddMinutes(31);
            var apply = await service.ApplyAsync(
                new GitOperationApplyRequest(preview.PreviewId, preview.Approval!.ConfirmationToken, string.Empty),
                new GitOperationExecutor(root),
                CancellationToken.None
            );

            Assert.False(apply.Ok);
            Assert.Contains("preview_not_found_or_expired", apply.Blockers);
        }
        finally
        {
            DeleteTempRoot(root);
        }
    }

    [Fact]
    public async Task ApplyDoesNotAcceptPreviewIdOnly()
    {
        var root = CreateTempRoot();
        try
        {
            InitializeRepository(root);
            await WriteTextAsync(root, "README.md", "readme\n");
            RunGit(root, "add", "README.md");
            RunGit(root, "commit", "-m", "docs: seed");
            await WriteTextAsync(root, "a.txt", "a\n");

            var service = BuildService(root, out _);
            var preview = await service.PreviewAsync(
                new GitOperationPreviewRequest(
                    GitOperationNames.StageAndCommit,
                    string.Empty,
                    "test: blocked apply",
                    new[] { "a.txt" }
                ),
                CancellationToken.None
            );

            var apply = await service.ApplyAsync(
                new GitOperationApplyRequest(preview.PreviewId, string.Empty, string.Empty),
                new GitOperationExecutor(root),
                CancellationToken.None
            );

            Assert.False(apply.Ok);
            Assert.Contains("approval_mismatch", apply.Blockers);
        }
        finally
        {
            DeleteTempRoot(root);
        }
    }

    [Fact]
    public void WsDispatcherParsesPreviewPayloadAndFailsClosedApplyWithoutPreviewId()
    {
        var ok = WsGitOperationCommandDispatcher.TryBuildPreviewRequest(
            """
            {
              "type": "git_operation_preview",
              "payload": {
                "operation": "stage_and_commit",
                "commitMessage": "test: commit",
                "selectedPaths": ["a.txt"]
              }
            }
            """,
            out var previewRequest,
            out var previewError
        );

        Assert.True(ok, previewError);
        Assert.Equal(GitOperationNames.StageAndCommit, previewRequest.Operation);
        Assert.Equal("test: commit", previewRequest.CommitMessage);
        Assert.Equal(new[] { "a.txt" }, previewRequest.Paths);

        var applyOk = WsGitOperationCommandDispatcher.TryBuildApplyRequest(
            """{"type":"git_operation_apply","confirmationToken":"token"}""",
            out _,
            out var applyError
        );

        Assert.False(applyOk);
        Assert.Equal("previewId is required", applyError);
    }

    private static GitOperationPreviewService BuildService(string root, out FileGitOperationPreviewStore store)
    {
        store = new FileGitOperationPreviewStore(Path.Combine(root, ".git", "omnux-test-state", "git_operation_previews.json"));
        return new GitOperationPreviewService(root, store);
    }

    private static void InitializeRepository(string root)
    {
        RunGit(root, "init");
        RunGit(root, "config", "user.email", "omnux-tests@example.invalid");
        RunGit(root, "config", "user.name", "Omnux Tests");
    }

    private static string CreateTempRoot()
    {
        var root = Path.Combine(Path.GetTempPath(), $"omnux-git-operation-test-{Guid.NewGuid():N}");
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

    private static Task WriteTextAsync(string root, string relativePath, string content)
    {
        var path = Path.Combine(root, relativePath);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        return File.WriteAllTextAsync(path, content);
    }

    private static string RunGit(string root, params string[] arguments)
    {
        var result = RunGitResult(root, arguments);
        if (result.ExitCode != 0)
        {
            throw new InvalidOperationException(
                $"git {string.Join(" ", arguments)} failed: {result.StdOut} {result.StdErr}"
            );
        }

        return result.StdOut;
    }

    private static GitResult RunGitResult(string root, params string[] arguments)
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

    private sealed record GitResult(
        int ExitCode,
        string StdOut,
        string StdErr
    );
}
