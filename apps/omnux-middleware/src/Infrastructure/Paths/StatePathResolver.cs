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
    string GetTaskAttemptRuntimePath(string graphId, string taskId, string attemptId)
        => Path.Combine(GetTaskRuntimePath(graphId, taskId), "attempts", attemptId);
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
    public const string CodingProjectPreviewsDirectoryName = "coding-project-previews";
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
        var workspaceRootDir = ResolveDefaultWorkspaceRootDir(stateRootDir);
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
            Path.GetFullPath(Path.Combine(baseDir, "../../../../desktop/dist/index.html")),
            Path.GetFullPath(Path.Combine(cwd, "apps/desktop/dist/index.html")),
            Path.GetFullPath(Path.Combine(cwd, "desktop/dist/index.html"))
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

    internal static string ResolveDefaultWorkspaceRootDir(string stateRootDir)
        => ResolveDefaultWorkspaceRootDir(stateRootDir, AppContext.BaseDirectory, Directory.GetCurrentDirectory());

    internal static string ResolveDefaultWorkspaceRootDir(string stateRootDir, string baseDir, string cwd)
    {
        var configured = Env.Get("OMNUX_WORKSPACE_ROOT");
        if (!string.IsNullOrWhiteSpace(configured))
        {
            return Path.GetFullPath(configured.Trim());
        }

        var candidates = new[]
        {
            Path.GetFullPath(Path.Combine(baseDir, "../../../../../workspace/coding")),
            Path.GetFullPath(Path.Combine(baseDir, "../../../../../coding")),
            Path.GetFullPath(Path.Combine(cwd, "workspace/coding")),
            Path.GetFullPath(Path.Combine(cwd, "coding")),
            Path.GetFullPath(Path.Combine(cwd, "../omnux/coding")),
            Path.GetFullPath(Path.Combine(cwd, "../coding")),
            Path.GetFullPath(Path.Combine(cwd, "../workspace/coding"))
        };

        foreach (var candidate in candidates)
        {
            if (Directory.Exists(candidate))
            {
                return candidate;
            }
        }

        // 새로 클론한 저장소에는 workspace/coding 이 아직 없다. 저장소 루트를 찾으면 canonical 경로를 쓴다.
        var repositoryRoot = FindRepositoryRoot(baseDir) ?? FindRepositoryRoot(cwd);
        if (repositoryRoot != null)
        {
            return Path.Combine(repositoryRoot, "workspace", "coding");
        }

        foreach (var candidate in candidates)
        {
            var parent = Directory.GetParent(candidate);
            // 부모가 파일시스템 루트면 후보를 버린다. `/coding` 을 고르면 컨테이너 루트가 `/` 가 되어
            // `/.runtime` 생성이 read-only file system 으로 실패한다(패키징된 .app 에서 실제로 발생).
            if (parent != null && !IsFileSystemRoot(parent.FullName) && Directory.Exists(parent.FullName))
            {
                return candidate;
            }
        }

        // 리포 상대 경로가 모두 빗나가는 패키징 실행(.app / installed binary) 대비 안전한 기본값.
        return Path.Combine(stateRootDir, "workspace", "coding");
    }

    private static string? FindRepositoryRoot(string startDir)
    {
        for (var directory = new DirectoryInfo(Path.GetFullPath(startDir)); directory != null; directory = directory.Parent)
        {
            if (File.Exists(Path.Combine(directory.FullName, "apps", "omnux-middleware", "Omnux.Middleware.csproj")))
            {
                return directory.FullName;
            }
        }

        return null;
    }

    private static bool IsFileSystemRoot(string path)
    {
        var full = Path.GetFullPath(path);
        return string.Equals(full, Path.GetPathRoot(full), StringComparison.Ordinal);
    }

    private static string ResolveDefaultStateDir()
    {
        var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        if (string.IsNullOrWhiteSpace(home))
        {
            return Path.Combine(Path.GetTempPath(), "omnux");
        }

        return Path.Combine(home, ".omnux");
    }

    private string ResolveWorkspaceContainerRoot()
    {
        var workspaceRoot = Path.GetFullPath(WorkspaceRootDir);
        var leaf = Path.GetFileName(workspaceRoot.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar));
        if (leaf.Equals("coding", StringComparison.OrdinalIgnoreCase))
        {
            var parent = Directory.GetParent(workspaceRoot);
            if (parent != null && !IsFileSystemRoot(parent.FullName))
            {
                return parent.FullName;
            }
        }

        return workspaceRoot;
    }

}
