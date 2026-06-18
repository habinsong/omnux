using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class NotebookServiceTests
{
    [Fact]
    public void AppendEntryPersistsRequestedKind()
    {
        var root = Path.Combine(Path.GetTempPath(), $"omnux-notebook-{Guid.NewGuid():N}");
        var resolver = new TestStatePathResolver(Path.Combine(root, "state"), root);
        var contextLoader = new ProjectContextLoader(
            new AgentInstructionLoader(resolver, new AppConfig()),
            new SkillManifestLoader(resolver),
            new CommandTemplateLoader(resolver)
        );
        var service = new NotebookService(new FileNotebookStore(resolver), contextLoader);

        try
        {
            var result = service.AppendEntry(
                "qa-project",
                "decision",
                "배포는 카나리 방식으로 진행한다"
            );

            Assert.True(result.Ok);
            var path = Path.Combine(
                resolver.GetNotebookProjectRoot("qa-project"),
                "decisions.md"
            );
            Assert.Contains("배포는 카나리 방식으로 진행한다", File.ReadAllText(path));
        }
        finally
        {
            if (Directory.Exists(root))
            {
                Directory.Delete(root, recursive: true);
            }
        }
    }

    private sealed class TestStatePathResolver : IStatePathResolver
    {
        public TestStatePathResolver(string stateRootDir, string workspaceRootDir)
        {
            StateRootDir = stateRootDir;
            WorkspaceRootDir = workspaceRootDir;
            DashboardIndexPath = Path.Combine(stateRootDir, "index.html");
            RoutinePromptDir = Path.Combine(workspaceRootDir, "_routine_prompts");
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
