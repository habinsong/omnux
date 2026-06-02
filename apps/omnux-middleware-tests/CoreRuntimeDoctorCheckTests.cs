using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class CoreRuntimeDoctorCheckTests
{
    [Fact]
    public async Task RunAsyncUsesDotNetRuntimeWithoutSocketFile()
    {
        var root = CreateTempDirectory();
        var stateRoot = Path.Combine(root, "state");
        Directory.CreateDirectory(stateRoot);
        var paths = CreatePathOptions(root, stateRoot);
        var check = new CoreSocketDoctorCheck(paths, new FakeCoreRuntimeClient("status=ok cpu_usage=0.10 mem_free_mb=256"));

        var result = await check.RunAsync(CancellationToken.None);

        Assert.Equal("core_runtime", result.Id);
        Assert.Equal(DoctorStatus.Ok, result.Status);
        Assert.Contains("runtime=dotnet", result.Detail);
        Assert.DoesNotContain("endpoint=", result.Detail);
    }

    private static PathOptions CreatePathOptions(string root, string stateRoot)
    {
        return new PathOptions(
            DashboardIndexPath: Path.Combine(root, "index.html"),
            LlmUsageStatePath: Path.Combine(stateRoot, "llm_usage.json"),
            CopilotUsageStatePath: Path.Combine(stateRoot, "copilot_usage.json"),
            ConversationStatePath: Path.Combine(stateRoot, "conversations.json"),
            AuthSessionStatePath: Path.Combine(stateRoot, "auth_sessions.json"),
            MemoryNotesRootDir: Path.Combine(stateRoot, "memory"),
            CodeRunsRootDir: Path.Combine(root, "workspace", "coding"),
            RoutineRunsRootDir: Path.Combine(root, "workspace", "routines"),
            WorkspaceRootDir: Path.Combine(root, "workspace"),
            RoutineStatePath: Path.Combine(stateRoot, "routines.json"),
            RoutinePromptDir: Path.Combine(root, "workspace", "_routine_prompts"),
            AuditLogPath: Path.Combine(stateRoot, "audit.log"),
            GuardRetryTimelineStatePath: Path.Combine(stateRoot, "guard_retry_timeline.json"),
            GatewayHealthStatePath: Path.Combine(stateRoot, "gateway_health.json"),
            GatewayStartupProbeStatePath: Path.Combine(stateRoot, "gateway_startup_probe.json"),
            DashboardAccessStatePath: Path.Combine(stateRoot, "dashboard_access.json"),
            SandboxExecutorPath: Path.Combine(root, "executor.py")
        );
    }

    private static string CreateTempDirectory()
    {
        var path = Path.Combine(Path.GetTempPath(), "omnux-tests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(path);
        return path;
    }

    private sealed class FakeCoreRuntimeClient : ICoreRuntimeClient
    {
        private readonly string _metrics;

        public FakeCoreRuntimeClient(string metrics)
        {
            _metrics = metrics;
        }

        public Task<string> GetMetricsAsync(CancellationToken cancellationToken)
            => Task.FromResult(_metrics);

        public Task<string> KillAsync(int pid, CancellationToken cancellationToken)
            => Task.FromResult($"status=ok killed_pid={pid}");
    }
}
