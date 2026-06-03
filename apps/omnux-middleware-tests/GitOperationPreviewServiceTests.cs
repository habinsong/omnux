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
    public async Task PushCurrentBranchPreviewAndApplySucceedsForInitialCodexBranch()
    {
        var parent = CreateTempRoot();
        var root = Path.Combine(parent, "repo");
        var remoteRoot = Path.Combine(parent, "remote.git");
        try
        {
            Directory.CreateDirectory(root);
            InitializeRepository(root);
            await WriteTextAsync(root, "README.md", "readme\n");
            RunGit(root, "add", "README.md");
            RunGit(root, "commit", "-m", "docs: seed");
            RunGit(root, "init", "--bare", remoteRoot);
            RunGit(root, "remote", "add", "origin", remoteRoot);
            RunGit(root, "checkout", "-b", "codex/push-current");
            await WriteTextAsync(root, "feature.txt", "feature\n");
            RunGit(root, "add", "feature.txt");
            RunGit(root, "commit", "-m", "test: add feature");

            var service = BuildService(root, out _);
            var preview = await service.PreviewAsync(
                new GitOperationPreviewRequest(
                    GitOperationNames.PushCurrentBranch,
                    string.Empty,
                    string.Empty,
                    Array.Empty<string>()
                ),
                CancellationToken.None
            );

            Assert.True(preview.Ok);
            Assert.NotNull(preview.Approval);
            Assert.Equal("origin", preview.Approval!.RemoteName);
            Assert.Equal("codex/push-current", preview.Approval.RemoteBranchName);
            Assert.True(preview.Approval.SetUpstream);
            Assert.Contains(preview.PlannedCommands, command => command.Display == "git push -u origin HEAD:codex/push-current");

            var apply = await service.ApplyAsync(
                new GitOperationApplyRequest(preview.PreviewId, preview.Approval.ConfirmationToken, string.Empty),
                new GitOperationExecutor(root),
                CancellationToken.None
            );

            Assert.True(apply.Ok);
            Assert.False(string.IsNullOrWhiteSpace(RunGit(remoteRoot, "rev-parse", "refs/heads/codex/push-current")));
            Assert.Equal("origin/codex/push-current", RunGit(root, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}").Trim());
        }
        finally
        {
            DeleteTempRoot(parent);
        }
    }

    [Fact]
    public async Task PushCurrentBranchPreviewBlocksProtectedBranch()
    {
        var parent = CreateTempRoot();
        var root = Path.Combine(parent, "repo");
        var remoteRoot = Path.Combine(parent, "remote.git");
        try
        {
            Directory.CreateDirectory(root);
            InitializeRepository(root);
            await WriteTextAsync(root, "README.md", "readme\n");
            RunGit(root, "add", "README.md");
            RunGit(root, "commit", "-m", "docs: seed");
            RunGit(root, "branch", "-M", "main");
            RunGit(root, "init", "--bare", remoteRoot);
            RunGit(root, "remote", "add", "origin", remoteRoot);
            await WriteTextAsync(root, "main.txt", "main\n");
            RunGit(root, "add", "main.txt");
            RunGit(root, "commit", "-m", "test: main update");

            var service = BuildService(root, out _);
            var preview = await service.PreviewAsync(
                new GitOperationPreviewRequest(
                    GitOperationNames.PushCurrentBranch,
                    string.Empty,
                    string.Empty,
                    Array.Empty<string>()
                ),
                CancellationToken.None
            );

            Assert.False(preview.Ok);
            Assert.Contains("protected_branch_push", preview.Blockers);
        }
        finally
        {
            DeleteTempRoot(parent);
        }
    }

    [Fact]
    public async Task PushCurrentBranchPreviewBlocksBehindUpstream()
    {
        var parent = CreateTempRoot();
        var root = Path.Combine(parent, "repo");
        var remoteRoot = Path.Combine(parent, "remote.git");
        var otherRoot = Path.Combine(parent, "other");
        try
        {
            Directory.CreateDirectory(root);
            InitializeRepository(root);
            await WriteTextAsync(root, "README.md", "readme\n");
            RunGit(root, "add", "README.md");
            RunGit(root, "commit", "-m", "docs: seed");
            RunGit(root, "init", "--bare", remoteRoot);
            RunGit(root, "remote", "add", "origin", remoteRoot);
            RunGit(root, "checkout", "-b", "codex/behind");
            RunGit(root, "push", "-u", "origin", "HEAD:codex/behind");

            RunGit(parent, "clone", remoteRoot, otherRoot);
            RunGit(otherRoot, "config", "user.email", "omnux-tests@example.invalid");
            RunGit(otherRoot, "config", "user.name", "Omnux Tests");
            RunGit(otherRoot, "checkout", "codex/behind");
            await WriteTextAsync(otherRoot, "remote.txt", "remote\n");
            RunGit(otherRoot, "add", "remote.txt");
            RunGit(otherRoot, "commit", "-m", "test: remote update");
            RunGit(otherRoot, "push", "origin", "HEAD:codex/behind");
            RunGit(root, "fetch", "origin");

            var service = BuildService(root, out _);
            var preview = await service.PreviewAsync(
                new GitOperationPreviewRequest(
                    GitOperationNames.PushCurrentBranch,
                    string.Empty,
                    string.Empty,
                    Array.Empty<string>()
                ),
                CancellationToken.None
            );

            Assert.False(preview.Ok);
            Assert.Contains("branch_behind_remote", preview.Blockers);
        }
        finally
        {
            DeleteTempRoot(parent);
        }
    }

    [Fact]
    public async Task OpenPullRequestPreviewAndApplyUsesGitHubCli()
    {
        var parent = CreateTempRoot();
        var root = Path.Combine(parent, "repo");
        var remoteRoot = Path.Combine(parent, "remote.git");
        try
        {
            Directory.CreateDirectory(root);
            InitializeRepository(root);
            var fakeGh = CreateFakeGh(parent, authOk: true);
            await WriteTextAsync(root, "README.md", "readme\n");
            RunGit(root, "add", "README.md");
            RunGit(root, "commit", "-m", "docs: seed");
            RunGit(root, "branch", "-M", "main");
            RunGit(root, "init", "--bare", remoteRoot);
            RunGit(root, "remote", "add", "origin", remoteRoot);
            RunGit(root, "push", "-u", "origin", "HEAD:main");
            RunGit(root, "checkout", "-b", "codex/pr-create");
            await WriteTextAsync(root, "feature.txt", "feature\n");
            RunGit(root, "add", "feature.txt");
            RunGit(root, "commit", "-m", "test: add feature");
            RunGit(root, "push", "-u", "origin", "HEAD:codex/pr-create");

            var service = BuildService(root, out _, fakeGh);
            var preview = await service.PreviewAsync(
                new GitOperationPreviewRequest(
                    GitOperationNames.OpenPullRequest,
                    string.Empty,
                    string.Empty,
                    Array.Empty<string>(),
                    PullRequestTitle: "test: add feature",
                    PullRequestBody: "Body",
                    BaseBranchName: "main"
                ),
                CancellationToken.None
            );

            Assert.True(preview.Ok);
            Assert.NotNull(preview.Approval);
            Assert.Equal("origin", preview.Approval!.RemoteName);
            Assert.Equal("codex/pr-create", preview.Approval.RemoteBranchName);
            Assert.Equal("main", preview.Approval.BaseBranchName);
            Assert.Contains(preview.PlannedCommands, command => command.Display.Contains("gh pr create", StringComparison.Ordinal));

            var apply = await service.ApplyAsync(
                new GitOperationApplyRequest(preview.PreviewId, preview.Approval.ConfirmationToken, string.Empty),
                new GitOperationExecutor(root, fakeGh),
                CancellationToken.None
            );

            Assert.True(apply.Ok);
            Assert.Contains(apply.ExecutedCommands, command =>
                command.Executable == "gh"
                && command.StdOut.Contains("https://github.example/owner/repo/pull/1", StringComparison.Ordinal)
            );
        }
        finally
        {
            DeleteTempRoot(parent);
        }
    }

    [Fact]
    public async Task OpenPullRequestPreviewBlocksUnpushedCommits()
    {
        var parent = CreateTempRoot();
        var root = Path.Combine(parent, "repo");
        var remoteRoot = Path.Combine(parent, "remote.git");
        try
        {
            Directory.CreateDirectory(root);
            InitializeRepository(root);
            var fakeGh = CreateFakeGh(parent, authOk: true);
            await WriteTextAsync(root, "README.md", "readme\n");
            RunGit(root, "add", "README.md");
            RunGit(root, "commit", "-m", "docs: seed");
            RunGit(root, "branch", "-M", "main");
            RunGit(root, "init", "--bare", remoteRoot);
            RunGit(root, "remote", "add", "origin", remoteRoot);
            RunGit(root, "push", "-u", "origin", "HEAD:main");
            RunGit(root, "checkout", "-b", "codex/pr-unpushed");
            await WriteTextAsync(root, "feature.txt", "feature\n");
            RunGit(root, "add", "feature.txt");
            RunGit(root, "commit", "-m", "test: add feature");
            RunGit(root, "push", "-u", "origin", "HEAD:codex/pr-unpushed");
            await WriteTextAsync(root, "unpushed.txt", "local\n");
            RunGit(root, "add", "unpushed.txt");
            RunGit(root, "commit", "-m", "test: unpushed");

            var service = BuildService(root, out _, fakeGh);
            var preview = await service.PreviewAsync(
                new GitOperationPreviewRequest(
                    GitOperationNames.OpenPullRequest,
                    string.Empty,
                    string.Empty,
                    Array.Empty<string>(),
                    PullRequestTitle: "test: add feature",
                    PullRequestBody: "Body",
                    BaseBranchName: "main"
                ),
                CancellationToken.None
            );

            Assert.False(preview.Ok);
            Assert.Contains("branch_has_unpushed_commits", preview.Blockers);
        }
        finally
        {
            DeleteTempRoot(parent);
        }
    }

    [Fact]
    public async Task OpenPullRequestPreviewBlocksMissingGitHubAuth()
    {
        var parent = CreateTempRoot();
        var root = Path.Combine(parent, "repo");
        var remoteRoot = Path.Combine(parent, "remote.git");
        try
        {
            Directory.CreateDirectory(root);
            InitializeRepository(root);
            var fakeGh = CreateFakeGh(parent, authOk: false);
            await WriteTextAsync(root, "README.md", "readme\n");
            RunGit(root, "add", "README.md");
            RunGit(root, "commit", "-m", "docs: seed");
            RunGit(root, "branch", "-M", "main");
            RunGit(root, "init", "--bare", remoteRoot);
            RunGit(root, "remote", "add", "origin", remoteRoot);
            RunGit(root, "push", "-u", "origin", "HEAD:main");
            RunGit(root, "checkout", "-b", "codex/pr-auth");
            await WriteTextAsync(root, "feature.txt", "feature\n");
            RunGit(root, "add", "feature.txt");
            RunGit(root, "commit", "-m", "test: add feature");
            RunGit(root, "push", "-u", "origin", "HEAD:codex/pr-auth");

            var service = BuildService(root, out _, fakeGh);
            var preview = await service.PreviewAsync(
                new GitOperationPreviewRequest(
                    GitOperationNames.OpenPullRequest,
                    string.Empty,
                    string.Empty,
                    Array.Empty<string>(),
                    PullRequestTitle: "test: add feature",
                    PullRequestBody: "Body",
                    BaseBranchName: "main"
                ),
                CancellationToken.None
            );

            Assert.False(preview.Ok);
            Assert.Contains("github_auth_unavailable", preview.Blockers);
        }
        finally
        {
            DeleteTempRoot(parent);
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

    private static GitOperationPreviewService BuildService(
        string root,
        out FileGitOperationPreviewStore store,
        string? githubCliExecutable = null
    )
    {
        store = new FileGitOperationPreviewStore(Path.Combine(root, ".git", "omnux-test-state", "git_operation_previews.json"));
        return new GitOperationPreviewService(root, store, githubCliExecutable: githubCliExecutable);
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

    private static string CreateFakeGh(string root, bool authOk)
    {
        var path = OperatingSystem.IsWindows()
            ? Path.Combine(root, "fake-gh.cmd")
            : Path.Combine(root, "fake-gh");
        var content = OperatingSystem.IsWindows()
            ? BuildFakeGhWindowsScript(authOk)
            : BuildFakeGhUnixScript(authOk);
        File.WriteAllText(path, content);
        if (!OperatingSystem.IsWindows())
        {
            File.SetUnixFileMode(path, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
        }

        return path;
    }

    private static string BuildFakeGhUnixScript(bool authOk)
    {
        var authBlock = authOk
            ? "echo 'Logged in to github.com'; exit 0"
            : "echo 'not logged in' >&2; exit 1";
        return $"""
                #!/bin/sh
                if [ "$1" = "--version" ]; then
                  echo "gh version fake"
                  exit 0
                fi
                if [ "$1" = "auth" ] && [ "$2" = "status" ]; then
                  {authBlock}
                fi
                if [ "$1" = "pr" ] && [ "$2" = "create" ]; then
                  echo "https://github.example/owner/repo/pull/1"
                  exit 0
                fi
                echo "unexpected gh args: $*" >&2
                exit 1
                """;
    }

    private static string BuildFakeGhWindowsScript(bool authOk)
    {
        var authBlock = authOk
            ? "echo Logged in to github.com\r\nexit /b 0"
            : "echo not logged in 1>&2\r\nexit /b 1";
        return $"""
                @echo off
                if "%1"=="--version" (
                  echo gh version fake
                  exit /b 0
                )
                if "%1"=="auth" if "%2"=="status" (
                  {authBlock}
                )
                if "%1"=="pr" if "%2"=="create" (
                  echo https://github.example/owner/repo/pull/1
                  exit /b 0
                )
                echo unexpected gh args: %* 1>&2
                exit /b 1
                """;
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
