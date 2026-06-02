using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class RefactorRollbackSnapshotTests
{
    [Fact]
    public void SaveRollbackPersistsOriginalAndAppliedTexts()
    {
        var root = CreateTempDirectory();
        var store = new FileRefactorPreviewStore(
            new TestStatePathResolver(root),
            ttlMinutes: 30,
            previewRootDir: Path.Combine(root, ".runtime", "refactor-preview")
        );
        var record = new RefactorRollbackRecord(
            "rollback_test",
            "preview_test",
            "2026-06-01T00:00:00.0000000Z",
            new[]
            {
                new RefactorRollbackFile(
                    Path.Combine(root, "workspace", "file.txt"),
                    "before",
                    "after",
                    DiffPreviewService.ComputeTextHash("before"),
                    DiffPreviewService.ComputeTextHash("after")
                )
            }
        );

        var path = store.SaveRollback(record);
        var loaded = store.TryLoadRollback("rollback_test");

        Assert.True(File.Exists(path));
        Assert.NotNull(loaded);
        Assert.Equal("preview_test", loaded.PreviewId);
        Assert.Collection(
            loaded.Files,
            file =>
            {
                Assert.Equal("before", file.OriginalText);
                Assert.Equal("after", file.AppliedText);
                Assert.Equal(DiffPreviewService.ComputeTextHash("before"), file.OriginalHash);
                Assert.Equal(DiffPreviewService.ComputeTextHash("after"), file.AppliedHash);
            }
        );
    }

    [Fact]
    public async Task RestoreRollbackRestoresOriginalTextWhenCurrentMatchesAppliedText()
    {
        var root = CreateTempDirectory();
        var workspace = Path.Combine(root, "workspace");
        Directory.CreateDirectory(workspace);
        var target = Path.Combine(workspace, "file.txt");
        await File.WriteAllTextAsync(target, "after");
        var store = new FileRefactorPreviewStore(
            new TestStatePathResolver(root),
            ttlMinutes: 30,
            previewRootDir: Path.Combine(root, ".runtime", "refactor-preview")
        );
        store.SaveRollback(new RefactorRollbackRecord(
            "rollback_restore",
            "preview_restore",
            "2026-06-01T00:00:00.0000000Z",
            new[]
            {
                new RefactorRollbackFile(
                    target,
                    "before",
                    "after",
                    DiffPreviewService.ComputeTextHash("before"),
                    DiffPreviewService.ComputeTextHash("after")
                )
            }
        ));
        var service = BuildService(root, store);

        var result = await service.RestoreRollbackAsync("rollback_restore", CancellationToken.None);

        Assert.True(result.Ok);
        Assert.NotNull(result.RollbackResult);
        Assert.True(result.RollbackResult.Restored);
        Assert.Equal("before", await File.ReadAllTextAsync(target));
        Assert.Null(store.TryLoadRollback("rollback_restore"));
    }

    [Fact]
    public async Task RestoreRollbackBlocksWhenCurrentTextChangedAfterApply()
    {
        var root = CreateTempDirectory();
        var workspace = Path.Combine(root, "workspace");
        Directory.CreateDirectory(workspace);
        var target = Path.Combine(workspace, "file.txt");
        await File.WriteAllTextAsync(target, "user edit");
        var store = new FileRefactorPreviewStore(
            new TestStatePathResolver(root),
            ttlMinutes: 30,
            previewRootDir: Path.Combine(root, ".runtime", "refactor-preview")
        );
        store.SaveRollback(new RefactorRollbackRecord(
            "rollback_block",
            "preview_block",
            "2026-06-01T00:00:00.0000000Z",
            new[]
            {
                new RefactorRollbackFile(
                    target,
                    "before",
                    "after",
                    DiffPreviewService.ComputeTextHash("before"),
                    DiffPreviewService.ComputeTextHash("after")
                )
            }
        ));
        var service = BuildService(root, store);

        var result = await service.RestoreRollbackAsync("rollback_block", CancellationToken.None);

        Assert.False(result.Ok);
        Assert.NotNull(result.RollbackResult);
        Assert.False(result.RollbackResult.Restored);
        Assert.Equal("user edit", await File.ReadAllTextAsync(target));
        Assert.NotNull(store.TryLoadRollback("rollback_block"));
    }

    [Fact]
    public async Task ApplyThenRestoreRollbackRestoresOriginalTextUsingGeneratedRollbackId()
    {
        var root = CreateTempDirectory();
        var workspace = Path.Combine(root, "workspace");
        Directory.CreateDirectory(workspace);
        var target = Path.Combine(workspace, "file.txt");
        await File.WriteAllTextAsync(target, "before\nkeep\n");
        var store = BuildStore(root);
        var service = BuildService(root, store);
        var read = await service.ReadWithAnchorsAsync("file.txt", CancellationToken.None);
        var edit = new AnchorEditRequest(
            1,
            1,
            new[] { read.ReadResult!.Lines[0].Hash },
            "after"
        );
        var preview = await service.PreviewRefactorAsync("file.txt", new[] { edit }, CancellationToken.None);
        var apply = await service.ApplyRefactorAsync(preview.Preview!.PreviewId, CancellationToken.None);

        var rollbackId = apply.ApplyResult!.RollbackId;
        Assert.True(apply.Ok);
        Assert.False(string.IsNullOrWhiteSpace(rollbackId));
        Assert.Equal("after\nkeep\n", await File.ReadAllTextAsync(target));
        Assert.NotNull(store.TryLoadRollback(rollbackId!));

        var restore = await service.RestoreRollbackAsync(rollbackId!, CancellationToken.None);

        Assert.True(restore.Ok);
        Assert.NotNull(restore.RollbackResult);
        Assert.True(restore.RollbackResult.Restored);
        Assert.Equal("before\nkeep\n", await File.ReadAllTextAsync(target));
        Assert.Null(store.TryLoadRollback(rollbackId!));
    }

    [Fact]
    public async Task ApplyThenRestoreRollbackBlocksWhenAppliedFileWasEditedAgain()
    {
        var root = CreateTempDirectory();
        var workspace = Path.Combine(root, "workspace");
        Directory.CreateDirectory(workspace);
        var target = Path.Combine(workspace, "file.txt");
        await File.WriteAllTextAsync(target, "before\nkeep\n");
        var store = BuildStore(root);
        var service = BuildService(root, store);
        var read = await service.ReadWithAnchorsAsync("file.txt", CancellationToken.None);
        var edit = new AnchorEditRequest(
            1,
            1,
            new[] { read.ReadResult!.Lines[0].Hash },
            "after"
        );
        var preview = await service.PreviewRefactorAsync("file.txt", new[] { edit }, CancellationToken.None);
        var apply = await service.ApplyRefactorAsync(preview.Preview!.PreviewId, CancellationToken.None);
        var rollbackId = apply.ApplyResult!.RollbackId;
        await File.WriteAllTextAsync(target, "user edit\nkeep\n");

        var restore = await service.RestoreRollbackAsync(rollbackId!, CancellationToken.None);

        Assert.False(restore.Ok);
        Assert.NotNull(restore.RollbackResult);
        Assert.False(restore.RollbackResult.Restored);
        Assert.Equal("user edit\nkeep\n", await File.ReadAllTextAsync(target));
        Assert.NotNull(store.TryLoadRollback(rollbackId!));
    }

    private static string CreateTempDirectory()
    {
        var path = Path.Combine(Path.GetTempPath(), "omnux-tests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(path);
        return path;
    }

    private static FileRefactorPreviewStore BuildStore(string root)
    {
        return new FileRefactorPreviewStore(
            new TestStatePathResolver(root),
            ttlMinutes: 30,
            previewRootDir: Path.Combine(root, ".runtime", "refactor-preview")
        );
    }

    private static RefactorApplicationService BuildService(string root, FileRefactorPreviewStore store)
    {
        var paths = new PathOptions(
            Path.Combine(root, "index.html"),
            Path.Combine(root, ".state", "llm_usage.json"),
            Path.Combine(root, ".state", "copilot_usage.json"),
            Path.Combine(root, ".state", "conversations.json"),
            Path.Combine(root, ".state", "auth_sessions.json"),
            Path.Combine(root, ".state", "memory-notes"),
            Path.Combine(root, ".state", "code-runs"),
            Path.Combine(root, "workspace", "routines"),
            Path.Combine(root, "workspace"),
            Path.Combine(root, ".state", "routines.json"),
            Path.Combine(root, "workspace", "_routine_prompts"),
            Path.Combine(root, ".state", "audit.log"),
            Path.Combine(root, ".state", "guard_retry_timeline.json"),
            Path.Combine(root, ".state", "gateway_health.json"),
            Path.Combine(root, ".state", "gateway_startup_probe.json"),
            Path.Combine(root, ".state", "dashboard_access.json"),
            Path.Combine(root, "sandbox.py")
        );
        var anchorRead = new AnchorReadService(paths);
        var diffPreview = new DiffPreviewService(paths, store);
        return new RefactorApplicationService(
            anchorRead,
            new AnchorEditService(),
            diffPreview,
            new LspRefactorService(
                paths,
                new RefactorOptions(
                    false,
                    false,
                    30,
                    "TEAM_GUIDE.md,.agents.md",
                    65536
                ),
                new RefactorToolAvailability(),
                anchorRead,
                diffPreview
            ),
            new AstGrepRefactorService(
                new RefactorOptions(
                    false,
                    false,
                    30,
                    "TEAM_GUIDE.md,.agents.md",
                    65536
                ),
                new RefactorToolAvailability(),
                anchorRead,
                diffPreview
            ),
            new AuditLogger(Path.Combine(root, "audit.log")),
            paths
        );
    }

    private sealed class TestStatePathResolver : IStatePathResolver
    {
        public TestStatePathResolver(string stateRootDir)
        {
            StateRootDir = stateRootDir;
            WorkspaceRootDir = Path.Combine(stateRootDir, "workspace");
            DashboardIndexPath = Path.Combine(stateRootDir, "index.html");
            RoutinePromptDir = Path.Combine(WorkspaceRootDir, "_routine_prompts");
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
