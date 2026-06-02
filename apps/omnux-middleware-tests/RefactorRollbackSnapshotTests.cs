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
    public async Task RestoreRollbackDeletesCreatedFileAndRestoresDeletedFile()
    {
        var root = CreateTempDirectory();
        var workspace = Path.Combine(root, "workspace");
        Directory.CreateDirectory(workspace);
        var created = Path.Combine(workspace, "created.txt");
        var deleted = Path.Combine(workspace, "deleted.txt");
        await File.WriteAllTextAsync(created, "new file");
        var store = BuildStore(root);
        store.SaveRollback(new RefactorRollbackRecord(
            "rollback_create_delete",
            "preview_create_delete",
            "2026-06-01T00:00:00.0000000Z",
            new[]
            {
                new RefactorRollbackFile(
                    created,
                    string.Empty,
                    "new file",
                    string.Empty,
                    DiffPreviewService.ComputeTextHash("new file"),
                    OriginalExists: false,
                    AppliedExists: true
                ),
                new RefactorRollbackFile(
                    deleted,
                    "old file",
                    string.Empty,
                    DiffPreviewService.ComputeTextHash("old file"),
                    string.Empty,
                    OriginalExists: true,
                    AppliedExists: false
                )
            }
        ));
        var service = BuildService(root, store);

        var result = await service.RestoreRollbackAsync("rollback_create_delete", CancellationToken.None);

        Assert.True(result.Ok);
        Assert.False(File.Exists(created));
        Assert.Equal("old file", await File.ReadAllTextAsync(deleted));
        Assert.Null(store.TryLoadRollback("rollback_create_delete"));
    }

    [Fact]
    public async Task AgentSpawnWorkspaceRollbackPolicyCapturesModifiedCreatedAndDeletedFiles()
    {
        var root = CreateTempDirectory();
        var workspace = Path.Combine(root, "workspace");
        Directory.CreateDirectory(workspace);
        var modified = Path.Combine(workspace, "modified.txt");
        var deleted = Path.Combine(workspace, "deleted.txt");
        var created = Path.Combine(workspace, "created.txt");
        await File.WriteAllTextAsync(modified, "before");
        await File.WriteAllTextAsync(deleted, "remove me");
        var store = BuildStore(root);
        var paths = BuildPaths(root);
        var policy = new AgentSpawnWorkspaceRollbackPolicy(
            paths,
            new DiffPreviewService(paths, store),
            utcNow: () => DateTimeOffset.Parse("2026-06-02T00:00:00Z")
        );

        var baseline = policy.CaptureBaseline();
        await File.WriteAllTextAsync(modified, "after");
        await File.WriteAllTextAsync(created, "created");
        File.Delete(deleted);
        var snapshot = policy.SaveRollbackIfChanged(baseline, "run-1", "child-1");

        Assert.NotNull(snapshot);
        Assert.Equal(3, snapshot!.ChangedFiles);
        Assert.Equal(1, snapshot.ModifiedFiles);
        Assert.Equal(1, snapshot.CreatedFiles);
        Assert.Equal(1, snapshot.DeletedFiles);
        var rollback = store.TryLoadRollback(snapshot.RollbackId);
        Assert.NotNull(rollback);
        Assert.Contains(rollback!.Files, file => file.Path == modified && file.OriginalExists != false && file.AppliedExists != false);
        Assert.Contains(rollback.Files, file => file.Path == created && file.OriginalExists == false && file.AppliedExists != false);
        Assert.Contains(rollback.Files, file => file.Path == deleted && file.OriginalExists != false && file.AppliedExists == false);

        var service = BuildService(root, store);
        var restore = await service.RestoreRollbackAsync(snapshot.RollbackId, CancellationToken.None);

        Assert.True(restore.Ok);
        Assert.Equal("before", await File.ReadAllTextAsync(modified));
        Assert.False(File.Exists(created));
        Assert.Equal("remove me", await File.ReadAllTextAsync(deleted));
    }

    [Fact]
    public async Task AgentSpawnWorkspaceRollbackPolicyIgnoresExcludedWorkspaceDirectories()
    {
        var root = CreateTempDirectory();
        var workspace = Path.Combine(root, "workspace");
        var nodeModules = Path.Combine(workspace, "node_modules", "pkg");
        Directory.CreateDirectory(nodeModules);
        var tracked = Path.Combine(workspace, "tracked.txt");
        var ignored = Path.Combine(nodeModules, "ignored.txt");
        var ignoredNew = Path.Combine(nodeModules, "new.txt");
        await File.WriteAllTextAsync(tracked, "before");
        await File.WriteAllTextAsync(ignored, "ignored before");
        var store = BuildStore(root);
        var paths = BuildPaths(root);
        var policy = new AgentSpawnWorkspaceRollbackPolicy(
            paths,
            new DiffPreviewService(paths, store),
            utcNow: () => DateTimeOffset.Parse("2026-06-02T00:00:00Z")
        );

        var baseline = policy.CaptureBaseline();
        await File.WriteAllTextAsync(tracked, "after");
        await File.WriteAllTextAsync(ignored, "ignored after");
        await File.WriteAllTextAsync(ignoredNew, "ignored new");
        var snapshot = policy.SaveRollbackIfChanged(baseline, "run-1", "child-1");

        Assert.NotNull(snapshot);
        Assert.Equal(1, snapshot!.ChangedFiles);
        var rollback = store.TryLoadRollback(snapshot.RollbackId);
        Assert.NotNull(rollback);
        Assert.Collection(rollback!.Files, file => Assert.Equal(tracked, file.Path));
    }

    [Fact]
    public async Task AgentSpawnWorkspaceRollbackPolicyCapsRollbackFileCount()
    {
        var root = CreateTempDirectory();
        var workspace = Path.Combine(root, "workspace");
        Directory.CreateDirectory(workspace);
        for (var index = 0; index < 405; index++)
        {
            await File.WriteAllTextAsync(
                Path.Combine(workspace, $"file-{index:D3}.txt"),
                "before"
            );
        }
        var store = BuildStore(root);
        var paths = BuildPaths(root);
        var policy = new AgentSpawnWorkspaceRollbackPolicy(
            paths,
            new DiffPreviewService(paths, store),
            utcNow: () => DateTimeOffset.Parse("2026-06-02T00:00:00Z")
        );

        var baseline = policy.CaptureBaseline();
        for (var index = 0; index < 405; index++)
        {
            await File.WriteAllTextAsync(
                Path.Combine(workspace, $"file-{index:D3}.txt"),
                "after"
            );
        }
        var snapshot = policy.SaveRollbackIfChanged(baseline, "run-1", "child-1");

        Assert.NotNull(snapshot);
        Assert.Equal(400, snapshot!.ChangedFiles);
        Assert.True(snapshot.Partial);
        var rollback = store.TryLoadRollback(snapshot.RollbackId);
        Assert.NotNull(rollback);
        Assert.Equal(400, rollback!.Files.Count);
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
        var paths = BuildPaths(root);
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

    private static PathOptions BuildPaths(string root)
    {
        return new PathOptions(
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
