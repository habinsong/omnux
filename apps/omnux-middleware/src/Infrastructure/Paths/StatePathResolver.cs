namespace Omnux.Middleware;

public interface IStatePathResolver
{
    string StateRootDir { get; }
    string WorkspaceRootDir { get; }
    string DashboardIndexPath { get; }
    string RoutinePromptDir { get; }
    string GetDoctorRoot();
    string GetDoctorLastReportPath();
    string GetDoctorHistoryRoot();
    string GetPlansRoot();
    string GetPlansIndexPath();
    string GetRoutingPolicyPath();
    string GetTaskGraphsRoot();
    string GetTaskGraphsIndexPath();
    string GetTaskRuntimeRoot();
    string GetTaskRuntimePath(string graphId, string taskId);
    string GetLogicRuntimeRoot();
    string GetLogicRuntimePath(string routineId, string runId);
    string GetNotebooksRoot();
    string GetNotebookProjectRoot(string projectKey);
    string GetRefactorPreviewRoot();
    string GetRefactorPreviewPath(string previewId);
    string GetTelegramReplyOutboxPath();
    string GetGlobalSkillsRoot();
    string GetGlobalCommandsRoot();
    string ResolveStateFilePath(string fileName);
    string ResolveStateDirectoryPath(string directoryName);
}

public sealed class DefaultStatePathResolver : IStatePathResolver
{
    public string StateRootDir { get; }
    public string WorkspaceRootDir { get; }
    public string DashboardIndexPath { get; }
    public string RoutinePromptDir { get; }

    private DefaultStatePathResolver(
        string stateRootDir,
        string workspaceRootDir,
        string dashboardIndexPath
    )
    {
        StateRootDir = stateRootDir;
        WorkspaceRootDir = workspaceRootDir;
        DashboardIndexPath = dashboardIndexPath;
        RoutinePromptDir = Path.Combine(WorkspaceRootDir, "_routine_prompts");
    }

    public static DefaultStatePathResolver CreateDefault()
    {
        var stateRootDir = ResolveDefaultStateDir();
        var workspaceRootDir = ResolveDefaultWorkspaceRootDir();
        var dashboardIndexPath = ResolveDefaultDashboardIndexPath();
        return new DefaultStatePathResolver(
            stateRootDir,
            workspaceRootDir,
            dashboardIndexPath
        );
    }

    public string ResolveStateFilePath(string fileName)
    {
        return Path.Combine(StateRootDir, fileName);
    }

    public string ResolveStateDirectoryPath(string directoryName)
    {
        return Path.Combine(StateRootDir, directoryName);
    }

    public string GetDoctorRoot()
    {
        return ResolveStateDirectoryPath("doctor");
    }

    public string GetDoctorLastReportPath()
    {
        return Path.Combine(GetDoctorRoot(), "last-report.json");
    }

    public string GetDoctorHistoryRoot()
    {
        return Path.Combine(GetDoctorRoot(), "history");
    }

    public string GetPlansRoot()
    {
        return ResolveStateDirectoryPath("plans");
    }

    public string GetPlansIndexPath()
    {
        return Path.Combine(GetPlansRoot(), "index.json");
    }

    public string GetRoutingPolicyPath()
    {
        return ResolveStateFilePath("routing-policy.json");
    }

    public string GetTaskGraphsRoot()
    {
        return ResolveStateDirectoryPath("tasks");
    }

    public string GetTaskGraphsIndexPath()
    {
        return Path.Combine(GetTaskGraphsRoot(), "index.json");
    }

    public string GetTaskRuntimeRoot()
    {
        var workspaceContainerRoot = ResolveWorkspaceContainerRoot();
        return Path.Combine(workspaceContainerRoot, ".runtime", "tasks");
    }

    public string GetTaskRuntimePath(string graphId, string taskId)
    {
        return Path.Combine(GetTaskRuntimeRoot(), graphId.Trim(), taskId.Trim());
    }

    public string GetLogicRuntimeRoot()
    {
        var workspaceContainerRoot = ResolveWorkspaceContainerRoot();
        return Path.Combine(workspaceContainerRoot, ".runtime", "logic");
    }

    public string GetLogicRuntimePath(string routineId, string runId)
    {
        return Path.Combine(GetLogicRuntimeRoot(), routineId.Trim(), runId.Trim());
    }

    public string GetNotebooksRoot()
    {
        return ResolveStateDirectoryPath("notebooks");
    }

    public string GetNotebookProjectRoot(string projectKey)
    {
        return Path.Combine(GetNotebooksRoot(), projectKey.Trim());
    }

    public string GetRefactorPreviewRoot()
    {
        var workspaceContainerRoot = ResolveWorkspaceContainerRoot();
        return Path.Combine(workspaceContainerRoot, ".runtime", "refactor-preview");
    }

    public string GetRefactorPreviewPath(string previewId)
    {
        return Path.Combine(GetRefactorPreviewRoot(), $"{previewId.Trim()}.json");
    }

    public string GetTelegramReplyOutboxPath()
    {
        return ResolveStateFilePath("telegram_reply_outbox.json");
    }

    public string GetGlobalSkillsRoot()
    {
        return ResolveStateDirectoryPath("skills");
    }

    public string GetGlobalCommandsRoot()
    {
        return ResolveStateDirectoryPath("commands");
    }

    private static string ResolveDefaultDashboardIndexPath()
    {
        var baseDir = AppContext.BaseDirectory;
        var cwd = Directory.GetCurrentDirectory();
        var candidates = new[]
        {
            Path.GetFullPath(Path.Combine(baseDir, "../../../../omnux-dashboard/index.html")),
            Path.GetFullPath(Path.Combine(cwd, "apps/omnux-dashboard/index.html")),
            Path.GetFullPath(Path.Combine(cwd, "omnux-dashboard/index.html")),
            Path.GetFullPath(Path.Combine(cwd, "../omnux-dashboard/index.html")),
            Path.GetFullPath(Path.Combine(cwd, "../apps/omnux-dashboard/index.html")),
            Path.GetFullPath(Path.Combine(baseDir, "../../../../omninode-dashboard/index.html")),
            Path.GetFullPath(Path.Combine(cwd, "omninode-dashboard/index.html")),
            Path.GetFullPath(Path.Combine(cwd, "../omninode-dashboard/index.html"))
        };

        foreach (var candidate in candidates)
        {
            if (File.Exists(candidate))
            {
                return candidate;
            }
        }

        return candidates[0];
    }

    private static string ResolveDefaultWorkspaceRootDir()
    {
        var baseDir = AppContext.BaseDirectory;
        var cwd = Directory.GetCurrentDirectory();
        var candidates = new[]
        {
            Path.GetFullPath(Path.Combine(baseDir, "../../../../../workspace/coding")),
            Path.GetFullPath(Path.Combine(baseDir, "../../../../../coding")),
            Path.GetFullPath(Path.Combine(cwd, "workspace/coding")),
            Path.GetFullPath(Path.Combine(cwd, "coding")),
            Path.GetFullPath(Path.Combine(cwd, "../omnux/coding")),
            Path.GetFullPath(Path.Combine(cwd, "../Omni-node/coding")),
            Path.GetFullPath(Path.Combine(cwd, "../coding")),
            Path.GetFullPath(Path.Combine(cwd, "../workspace/coding"))
        };

        foreach (var candidate in candidates)
        {
            var parent = Directory.GetParent(candidate);
            if (parent != null && Directory.Exists(parent.FullName))
            {
                return candidate;
            }
        }

        return candidates[0];
    }

    private static string ResolveDefaultStateDir()
    {
        var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        if (string.IsNullOrWhiteSpace(home))
        {
            var currentTemp = Path.Combine(Path.GetTempPath(), "omnux");
            var legacyTemp = Path.Combine(Path.GetTempPath(), "omninode");
            return Directory.Exists(legacyTemp) && !Directory.Exists(currentTemp) ? legacyTemp : currentTemp;
        }

        var current = Path.Combine(home, ".omnux");
        var legacy = Path.Combine(home, ".omninode");
        return Directory.Exists(legacy) && !Directory.Exists(current) ? legacy : current;
    }

    private string ResolveWorkspaceContainerRoot()
    {
        var workspaceRoot = Path.GetFullPath(WorkspaceRootDir);
        var leaf = Path.GetFileName(workspaceRoot.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar));
        if (leaf.Equals("coding", StringComparison.OrdinalIgnoreCase))
        {
            var parent = Directory.GetParent(workspaceRoot);
            if (parent != null)
            {
                return parent.FullName;
            }
        }

        return workspaceRoot;
    }

}
