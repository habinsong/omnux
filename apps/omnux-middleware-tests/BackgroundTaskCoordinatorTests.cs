using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class BackgroundTaskCoordinatorTests
{
    [Fact]
    public async Task ResumeWaitsForStoppedRunCleanup()
    {
        var root = Directory.CreateTempSubdirectory("omnux-task-stop-resume-").FullName;
        var paths = new TestStatePathResolver(Path.Combine(root,"state"),Path.Combine(root,"workspace"));
        var store = new FileTaskGraphStore(paths);
        store.SaveSnapshot(new TaskGraphSnapshot(new TaskGraph("stop_resume","plan",DateTimeOffset.UtcNow,DateTimeOffset.UtcNow,TaskGraphStatus.Draft,new[]{Node("build","coding",Array.Empty<string>())}),Array.Empty<TaskExecutionRecord>()));
        var service = new TaskGraphService(store,null!);
        var cleanup = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var coding = new PausingCodingExecutor(paths.WorkspaceRootDir) { Cleanup = cleanup.Task };
        var coordinator = new BackgroundTaskCoordinator(service,paths);
        coordinator.ConfigureExecutors(coding,new CommandExecutor());
        try
        {
            await coordinator.RunGraphAsync("stop_resume","web",null,CancellationToken.None);
            await coding.Started.Task.WaitAsync(TimeSpan.FromSeconds(5));
            coordinator.CancelGraph("stop_resume");
            var resumed = coordinator.ResumeGraphAsync("stop_resume","web",null,CancellationToken.None);
            Assert.False(resumed.IsCompleted);
            cleanup.SetResult();
            Assert.True((await resumed.WaitAsync(TimeSpan.FromSeconds(5))).Ok);
            Assert.Equal(TaskNodeStatus.Completed,(await WaitForCompletion(service,"stop_resume")).Graph.Nodes.Single().Status);
            Assert.Equal(2,coding.Requests.Count);
        }
        finally { cleanup.TrySetResult(); await coordinator.StopAsync(); Directory.Delete(root,true); }
    }

    [Fact]
    public async Task OneStopRequestCancelsRunningAndWaitingSteps()
    {
        var root = Directory.CreateTempSubdirectory("omnux-task-stop-").FullName;
        var paths = new TestStatePathResolver(Path.Combine(root,"state"),Path.Combine(root,"workspace"));
        var store = new FileTaskGraphStore(paths);
        var nodes = new[]{Node("build","coding",Array.Empty<string>()),Node("verify","verification",new[]{"build"})};
        store.SaveSnapshot(new TaskGraphSnapshot(new TaskGraph("stop","plan",DateTimeOffset.UtcNow,DateTimeOffset.UtcNow,TaskGraphStatus.Draft,nodes),Array.Empty<TaskExecutionRecord>()));
        var service = new TaskGraphService(store,null!);
        var coding = new PausingCodingExecutor(paths.WorkspaceRootDir);
        var coordinator = new BackgroundTaskCoordinator(service,paths);
        coordinator.ConfigureExecutors(coding,new CommandExecutor());
        try
        {
            await coordinator.RunGraphAsync("stop","web",null,CancellationToken.None);
            await coding.Started.Task.WaitAsync(TimeSpan.FromSeconds(5));
            Assert.True(coordinator.CancelGraph("stop").Ok);
            var result = await WaitForCompletion(service,"stop");
            Assert.All(result.Graph.Nodes,node=>Assert.Equal(TaskNodeStatus.Canceled,node.Status));
            Assert.Single(coding.Requests);
        }
        finally { await coordinator.StopAsync(); Directory.Delete(root,true); }
    }

    [Fact]
    public async Task RunningCodingTaskPersistsConversationBeforeCompletion()
    {
        var root = Directory.CreateTempSubdirectory("omnux-task-checkpoint-").FullName;
        var paths = new TestStatePathResolver(Path.Combine(root,"state"),Path.Combine(root,"workspace"));
        var store = new FileTaskGraphStore(paths);
        var node = Node("build","coding",Array.Empty<string>());
        store.SaveSnapshot(new TaskGraphSnapshot(new TaskGraph("checkpoint","plan",DateTimeOffset.UtcNow,DateTimeOffset.UtcNow,TaskGraphStatus.Draft,new[]{node}),Array.Empty<TaskExecutionRecord>()));
        var service = new TaskGraphService(store,null!);
        var coding = new PausingCodingExecutor(paths.WorkspaceRootDir);
        var coordinator = new BackgroundTaskCoordinator(service,paths);
        coordinator.ConfigureExecutors(coding,new CommandExecutor());
        try
        {
            await coordinator.RunGraphAsync("checkpoint","web",null,CancellationToken.None);
            await coding.Started.Task.WaitAsync(TimeSpan.FromSeconds(5));
            Assert.Equal("checkpoint_conversation",service.GetGraph("checkpoint")!.Executions.Single().ConversationId);
        }
        finally { await coordinator.StopAsync(); Directory.Delete(root,true); }
    }

    [Fact]
    public async Task RetryAfterCoordinatorRestartKeepsFilesAndPreviousAttemptLogs()
    {
        var root = Directory.CreateTempSubdirectory("omnux-task-attempts-").FullName;
        var paths = new TestStatePathResolver(Path.Combine(root,"state"),Path.Combine(root,"workspace"));
        var store = new FileTaskGraphStore(paths);
        var node = Node("build","coding",Array.Empty<string>());
        store.SaveSnapshot(new TaskGraphSnapshot(new TaskGraph("attempts","plan",DateTimeOffset.UtcNow,DateTimeOffset.UtcNow,TaskGraphStatus.Draft,new[]{node}),Array.Empty<TaskExecutionRecord>()));
        var service = new TaskGraphService(store,null!);
        var coding = new PausingCodingExecutor(paths.WorkspaceRootDir);
        var coordinator = new BackgroundTaskCoordinator(service,paths);
        coordinator.ConfigureExecutors(coding,new CommandExecutor());
        try
        {
            await coordinator.RunGraphAsync("attempts","web",null,CancellationToken.None);
            await coding.Started.Task.WaitAsync(TimeSpan.FromSeconds(5));
            await coordinator.StopAsync();
            var original = service.GetGraph("attempts")!.Executions.Single();
            var originalLog = File.ReadAllText(original.StdOutPath);
            service = new TaskGraphService(new FileTaskGraphStore(paths),null!);
            coordinator = new BackgroundTaskCoordinator(service,paths);
            coordinator.ConfigureExecutors(coding,new CommandExecutor());
            Assert.True((await coordinator.RetryTaskAsync("attempts","build","web",null,CancellationToken.None)).Ok);
            var resumed = await WaitForCompletion(service,"attempts");
            Assert.Equal(TaskNodeStatus.Completed,resumed.Graph.Nodes.Single().Status);
            Assert.Equal(2,resumed.Executions.Count);
            Assert.Equal(2,resumed.Executions.Select(item=>item.RuntimePath).Distinct().Count());
            Assert.Equal("checkpoint_conversation",coding.Requests[1].ConversationId);
            Assert.Equal(originalLog,File.ReadAllText(original.StdOutPath));
            Assert.Contains("resumed",service.GetTaskOutput("attempts","build")!.StdOut);
            Assert.Equal("ok",service.GetTaskOutput("attempts","build")!.Execution!.Status);
            var older = service.GetTaskOutput("attempts","build",original.StartedAtUtc.ToUnixTimeMilliseconds());
            Assert.Equal("canceled",older!.Execution!.Status);
            Assert.Equal(originalLog,older.StdOut);
            Assert.Null(service.GetTaskOutput("attempts","build",0));
        }
        finally { await coordinator.StopAsync(); Directory.Delete(root,true); }
    }

    [Fact]
    public async Task RuntimeDirectoryFailureTerminatesTaskInsteadOfReschedulingForever()
    {
        var root = Directory.CreateTempSubdirectory("omnux-task-runtime-error-").FullName;
        var paths = new TestStatePathResolver(Path.Combine(root,"state"),Path.Combine(root,"workspace"));
        var store = new FileTaskGraphStore(paths);
        var node = Node("build","coding",Array.Empty<string>());
        store.SaveSnapshot(new TaskGraphSnapshot(new TaskGraph("runtime_error","plan",DateTimeOffset.UtcNow,DateTimeOffset.UtcNow,TaskGraphStatus.Draft,new[]{node}),Array.Empty<TaskExecutionRecord>()));
        var badPath = paths.GetTaskRuntimePath("runtime_error",node.TaskId);
        Directory.CreateDirectory(Path.GetDirectoryName(badPath)!);
        File.WriteAllText(badPath,"fixture occupies directory path");
        var service = new TaskGraphService(store,null!);
        var coordinator = new BackgroundTaskCoordinator(service,paths);
        coordinator.ConfigureExecutors(new FileCodingExecutor(paths.WorkspaceRootDir),new CommandExecutor());
        try
        {
            await coordinator.RunGraphAsync("runtime_error","web",null,CancellationToken.None);
            var result = await WaitForCompletion(service,"runtime_error");
            Assert.Equal(TaskNodeStatus.Failed,result.Graph.Nodes.Single().Status);
            Assert.False(string.IsNullOrEmpty(result.Executions.Single().Error));
        }
        finally { await coordinator.StopAsync(); Directory.Delete(root,true); }
    }

    [Fact]
    public async Task ConcurrentRunRequestsStartOneGraphLoop()
    {
        var root = Directory.CreateTempSubdirectory("omnux-task-race-").FullName;
        var paths = new TestStatePathResolver(Path.Combine(root,"state"),Path.Combine(root,"workspace"));
        var store = new FileTaskGraphStore(paths);
        store.SaveSnapshot(new TaskGraphSnapshot(new TaskGraph("race","plan",DateTimeOffset.UtcNow,DateTimeOffset.UtcNow,TaskGraphStatus.Draft,new[]{Node("build","coding",Array.Empty<string>())}),Array.Empty<TaskExecutionRecord>()));
        var service = new TaskGraphService(store,null!);
        var coding = new PausingCodingExecutor(paths.WorkspaceRootDir);
        var coordinator = new BackgroundTaskCoordinator(service,paths);
        coordinator.ConfigureExecutors(coding,new CommandExecutor());
        try
        {
            var results = await Task.WhenAll(Enumerable.Range(0,16).Select(_=>Task.Run(()=>coordinator.RunGraphAsync("race","web",null,CancellationToken.None))));
            Assert.All(results,result=>Assert.True(result.Ok));
            await coding.Started.Task.WaitAsync(TimeSpan.FromSeconds(5));
            Assert.Single(coding.Requests);
            Assert.Single(service.GetGraph("race")!.Executions);
        }
        finally { await coordinator.StopAsync(); Directory.Delete(root,true); }
    }

    [Fact]
    public async Task FreshRunKeepsHistoryButStartsNewCodingContext()
    {
        var root = Directory.CreateTempSubdirectory("omnux-task-fresh-").FullName;
        var paths = new TestStatePathResolver(Path.Combine(root,"state"),Path.Combine(root,"workspace"));
        var store = new FileTaskGraphStore(paths);
        store.SaveSnapshot(new TaskGraphSnapshot(new TaskGraph("fresh","plan",DateTimeOffset.UtcNow,DateTimeOffset.UtcNow,TaskGraphStatus.Draft,new[]{Node("build","coding",Array.Empty<string>())}),Array.Empty<TaskExecutionRecord>()));
        var service = new TaskGraphService(store,null!);
        var coding = new FileCodingExecutor(paths.WorkspaceRootDir);
        var coordinator = new BackgroundTaskCoordinator(service,paths);
        coordinator.ConfigureExecutors(coding,new CommandExecutor());
        try
        {
            await coordinator.RunGraphAsync("fresh","web",null,CancellationToken.None);
            var first = (await WaitForCompletion(service,"fresh")).Executions.Single();
            await coordinator.StopAsync();
            await coordinator.RunGraphAsync("fresh","web",null,CancellationToken.None);
            var second = await WaitForCompletion(service,"fresh");
            Assert.Equal(2,second.Executions.Count);
            Assert.Null(coding.Requests[1].ConversationId);
            Assert.NotEqual(second.Executions[0].ConversationId,second.Executions[1].ConversationId);
            Assert.True(File.Exists(first.StdOutPath));
        }
        finally { await coordinator.StopAsync(); Directory.Delete(root,true); }
    }

    [Fact]
    public async Task RetryingOneTaskDoesNotRestartUnrelatedFailures()
    {
        var root = Directory.CreateTempSubdirectory("omnux-task-retry-scope-").FullName;
        var paths = new TestStatePathResolver(Path.Combine(root,"state"),Path.Combine(root,"workspace"));
        var store = new FileTaskGraphStore(paths);
        var nodes = new[]{Node("first","coding",Array.Empty<string>()) with {Status=TaskNodeStatus.Failed},Node("other","coding",Array.Empty<string>()) with {Status=TaskNodeStatus.Failed}};
        store.SaveSnapshot(new TaskGraphSnapshot(new TaskGraph("scope","plan",DateTimeOffset.UtcNow,DateTimeOffset.UtcNow,TaskGraphStatus.Failed,nodes),Array.Empty<TaskExecutionRecord>()));
        var service = new TaskGraphService(store,null!);
        var coding = new FileCodingExecutor(paths.WorkspaceRootDir);
        var coordinator = new BackgroundTaskCoordinator(service,paths);
        coordinator.ConfigureExecutors(coding,new CommandExecutor());
        try
        {
            Assert.True((await coordinator.RetryTaskAsync("scope","first","web",null,CancellationToken.None)).Ok);
            var result = await WaitForCompletion(service,"scope");
            Assert.Equal(TaskNodeStatus.Completed,result.Graph.Nodes[0].Status);
            Assert.Equal(TaskNodeStatus.Failed,result.Graph.Nodes[1].Status);
            Assert.Single(coding.Requests);
        }
        finally { await coordinator.StopAsync(); Directory.Delete(root,true); }
    }

    [Fact]
    public void RetryRejectsAnActiveDependentWithoutChangingState()
    {
        var root = Directory.CreateTempSubdirectory("omnux-task-active-dependent-").FullName;
        var paths = new TestStatePathResolver(Path.Combine(root,"state"),Path.Combine(root,"workspace"));
        try
        {
            var store = new FileTaskGraphStore(paths);
            var nodes = new[]{Node("first","coding",Array.Empty<string>()) with {Status=TaskNodeStatus.Completed},Node("verify","verification",new[]{"first"}) with {Status=TaskNodeStatus.Running}};
            store.SaveSnapshot(new TaskGraphSnapshot(new TaskGraph("active","plan",DateTimeOffset.UtcNow,DateTimeOffset.UtcNow,TaskGraphStatus.Running,nodes),Array.Empty<TaskExecutionRecord>()));
            Assert.False(new TaskGraphService(store,null!).RetryTask("active","first").Ok);
            Assert.Equal(TaskNodeStatus.Completed,store.TryLoadSnapshot("active")!.Graph.Nodes[0].Status);
        }
        finally { Directory.Delete(root,true); }
    }

    [Fact]
    public void RetryPreservesExecutionContextAndInvalidatesCompletedDependents()
    {
        var root = Directory.CreateTempSubdirectory("omnux-task-retry-").FullName;
        var paths = new TestStatePathResolver(Path.Combine(root,"state"),Path.Combine(root,"workspace"));
        try
        {
            var store = new FileTaskGraphStore(paths);
            var first = Node("build","coding",Array.Empty<string>()) with {Status=TaskNodeStatus.Failed};
            var second = Node("verify","verification",new[]{first.TaskId}) with {Status=TaskNodeStatus.Completed};
            var record = Record("retry",first,"checkpoint_conversation",paths.GetTaskRuntimePath("retry",first.TaskId));
            store.SaveSnapshot(new TaskGraphSnapshot(new TaskGraph("retry","plan",DateTimeOffset.UtcNow,DateTimeOffset.UtcNow,TaskGraphStatus.Failed,new[]{first,second}),new[]{record}));
            var result = new TaskGraphService(store,null!).RetryTask("retry","build");
            Assert.True(result.Ok);
            Assert.Equal(TaskNodeStatus.Blocked,result.Snapshot!.Graph.Nodes[1].Status);
            Assert.Contains(result.Snapshot.Executions,item=>item.ConversationId=="checkpoint_conversation");
        }
        finally { Directory.Delete(root,true); }
    }

    [Fact]
    public async Task ResumeAfterShutdownRunsOnlyUnfinishedNodes()
    {
        var root = Directory.CreateTempSubdirectory("omnux-task-resume-").FullName;
        var paths = new TestStatePathResolver(Path.Combine(root,"state"),Path.Combine(root,"workspace"));
        var store = new FileTaskGraphStore(paths);
        var first = Node("build","coding",Array.Empty<string>()) with {Status=TaskNodeStatus.Completed};
        var second = Node("verify","verification",new[]{first.TaskId}) with {Status=TaskNodeStatus.Canceled};
        var directory=Directory.CreateDirectory(Path.Combine(paths.WorkspaceRootDir,"conversation_1")).FullName;
        File.WriteAllText(Path.Combine(directory,"main.py"),"print(42)");
        store.SaveSnapshot(new TaskGraphSnapshot(new TaskGraph("resume","plan",DateTimeOffset.UtcNow,DateTimeOffset.UtcNow,TaskGraphStatus.Canceled,new[]{first,second}),new[]{Record("resume",first,"conversation_1",paths.GetTaskRuntimePath("resume",first.TaskId))}));
        var service = new TaskGraphService(store,null!);
        var coding = new FileCodingExecutor(paths.WorkspaceRootDir);
        var coordinator = new BackgroundTaskCoordinator(service,paths);
        coordinator.ConfigureExecutors(coding,new CommandExecutor());
        try
        {
            await coordinator.ResumeGraphAsync("resume","web",null,CancellationToken.None);
            var result = await WaitForCompletion(service,"resume");
            Assert.All(result.Graph.Nodes,node=>Assert.Equal(TaskNodeStatus.Completed,node.Status));
            Assert.Single(coding.Requests);
            Assert.Equal("conversation_1",coding.Requests[0].ConversationId);
        }
        finally { await coordinator.StopAsync(); Directory.Delete(root,true); }
    }

    private static TaskExecutionRecord Record(string graph,TaskNode node,string conversation,string runtime)
        => new(graph,node.TaskId,node.Title,node.Category,DateTimeOffset.UtcNow,null,"error","coding_orchestration","test",runtime,Path.Combine(runtime,"stdout.log"),Path.Combine(runtime,"stderr.log"),Path.Combine(runtime,"result.json"),conversation,null,null,"fixture");

    private sealed class PausingCodingExecutor(string root) : ICodingApplicationService
    {
    public Task<CodingInteractiveRunPlan> BuildInteractiveRunPlanAsync(
        string conversationId,
        string? preferredTarget,
        CancellationToken cancellationToken
    ) => throw new NotSupportedException();

        public TaskCompletionSource Started { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public Task? Cleanup { get; init; }
        public List<CodingRunRequest> Requests { get; } = new();
        public async Task<CodingRunResult> RunCodingOrchestrationAsync(CodingRunRequest request,CancellationToken token,Action<CodingProgressUpdate>? progress=null)
        {
            Requests.Add(request);
            var id = request.ConversationId ?? "checkpoint_conversation";
            var directory = Directory.CreateDirectory(Path.Combine(root,id)).FullName;
            var file = Path.Combine(directory,"kept.txt");
            if (Requests.Count == 1) File.WriteAllText(file,"partial");
            progress?.Invoke(new CodingProgressUpdate("orchestration","fixture","fixture","checkpoint","저장",0,0,0,false,ConversationId:id));
            Started.TrySetResult();
            if (Requests.Count == 1)
            {
                try { await Task.Delay(Timeout.Infinite,token); }
                finally { if (Cleanup != null) await Cleanup; }
            }
            Assert.Equal("partial",File.ReadAllText(file));
            var execution = new CodeExecutionResult("text",directory,file,"fixture",0,"resumed","","ok");
            var conversation = new ConversationThreadView(id,"coding","orchestration","fixture","task","coding",Array.Empty<string>(),DateTimeOffset.UtcNow,DateTimeOffset.UtcNow,Array.Empty<ConversationMessageView>(),Array.Empty<string>(),null);
            return new CodingRunResult("orchestration",id,"fixture","fixture","text","",execution,Array.Empty<CodingWorkerResult>(),new[]{file},"resumed",conversation,null);
        }
        public Task<CodingRunResult> RunCodingSingleAsync(CodingRunRequest request,CancellationToken token,Action<CodingProgressUpdate>? progress=null) => throw new NotSupportedException();
        public Task<CodingRunResult> RunCodingMultiAsync(CodingRunRequest request,CancellationToken token,Action<CodingProgressUpdate>? progress=null) => throw new NotSupportedException();
        public Task<CodingResultExecutionResult> ExecuteLatestCodingResultAsync(string id,string? input,CancellationToken token,string? preferredTarget = null) => throw new NotSupportedException();
    }

    [Fact]
    public async Task DependentCodingTasksReuseWorkspaceAndExposeOutput()
    {
        var root = Path.Combine(Path.GetTempPath(), $"omnux-task-context-{Guid.NewGuid():N}");
        var paths = new TestStatePathResolver(Path.Combine(root, "state"), Path.Combine(root, "workspace"));
        var store = new FileTaskGraphStore(paths);
        var first = Node("build", "coding", Array.Empty<string>());
        var second = Node("verify", "verification", new[] { first.TaskId });
        store.SaveSnapshot(new TaskGraphSnapshot(
            new TaskGraph("graph_1", "plan_1", DateTimeOffset.UtcNow, DateTimeOffset.UtcNow, TaskGraphStatus.Draft, new[] { first, second }),
            Array.Empty<TaskExecutionRecord>()));
        var service = new TaskGraphService(store, null!);
        var coding = new FileCodingExecutor(paths.WorkspaceRootDir);
        var coordinator = new BackgroundTaskCoordinator(service, paths);
        coordinator.ConfigureExecutors(coding, new CommandExecutor());
        try
        {
            Assert.True((await coordinator.RunGraphAsync("graph_1", "web", null, CancellationToken.None)).Ok);
            var snapshot = await WaitForCompletion(service, "graph_1");
            Assert.All(snapshot.Graph.Nodes, node => Assert.Equal(TaskNodeStatus.Completed, node.Status));
            Assert.Equal(2, coding.Requests.Count);
            Assert.Null(coding.Requests[0].ConversationId);
            Assert.Null(coding.Requests[0].GrokModel);
            Assert.Equal("conversation_1", coding.Requests[1].ConversationId);
            Assert.Contains("main.py", coding.Requests[1].Input);
            Assert.Contains("구현 완료", coding.Requests[1].Input);
            var output = service.GetTaskOutput("graph_1", "verify");
            Assert.NotNull(output);
            Assert.Contains("검증 출력", output.StdOut);
            Assert.True(Path.IsPathRooted(snapshot.Graph.Nodes[0].ArtifactPath));
            Assert.True(File.Exists(snapshot.Graph.Nodes[0].ArtifactPath));
        }
        finally
        {
            await coordinator.StopAsync();
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public async Task FailedExecutionExposesStderrWithoutClaimingSuccess()
    {
        var root = Path.Combine(Path.GetTempPath(), $"omnux-task-failure-{Guid.NewGuid():N}");
        var paths = new TestStatePathResolver(Path.Combine(root, "state"), Path.Combine(root, "workspace"));
        var store = new FileTaskGraphStore(paths);
        store.SaveSnapshot(new TaskGraphSnapshot(
            new TaskGraph("graph_2", "plan_2", DateTimeOffset.UtcNow, DateTimeOffset.UtcNow, TaskGraphStatus.Draft, new[] { Node("verify", "verification", Array.Empty<string>()) }),
            Array.Empty<TaskExecutionRecord>()));
        var service = new TaskGraphService(store, null!);
        var coordinator = new BackgroundTaskCoordinator(service, paths);
        coordinator.ConfigureExecutors(new FileCodingExecutor(paths.WorkspaceRootDir), new CommandExecutor());
        try
        {
            await coordinator.RunGraphAsync("graph_2", "web", null, CancellationToken.None);
            var snapshot = await WaitForCompletion(service, "graph_2");
            Assert.Equal(TaskNodeStatus.Failed, snapshot.Graph.Nodes.Single().Status);
            Assert.Contains("작업 파일이 없습니다", service.GetTaskOutput("graph_2", "verify")!.StdErr);
        }
        finally
        {
            await coordinator.StopAsync();
            Directory.Delete(root, recursive: true);
        }
    }

    private static TaskNode Node(string id, string category, string[] dependencies)
        => new(id, id, category, TaskNodeStatus.Pending, dependencies, id, Array.Empty<string>(), Array.Empty<string>(), null, null, null, null, null);

    private static async Task<TaskGraphSnapshot> WaitForCompletion(TaskGraphService service, string id)
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        while (true)
        {
            var snapshot = service.GetGraph(id)!;
            if (snapshot.Graph.Nodes.All(node => node.Status is TaskNodeStatus.Completed or TaskNodeStatus.Failed or TaskNodeStatus.Canceled)) return snapshot;
            await Task.Delay(10, timeout.Token);
        }
    }

    private sealed class FileCodingExecutor(string root) : ICodingApplicationService
    {
    public Task<CodingInteractiveRunPlan> BuildInteractiveRunPlanAsync(
        string conversationId,
        string? preferredTarget,
        CancellationToken cancellationToken
    ) => throw new NotSupportedException();

        public List<CodingRunRequest> Requests { get; } = new();
        public Task<CodingRunResult> RunCodingOrchestrationAsync(CodingRunRequest request, CancellationToken cancellationToken, Action<CodingProgressUpdate>? progressCallback = null)
        {
            Requests.Add(request);
            var conversation = request.ConversationId ?? $"conversation_{Requests.Count}";
            var directory = Path.Combine(root, conversation);
            Directory.CreateDirectory(directory);
            var path = Path.Combine(directory, "main.py");
            var build = request.Category == "coding";
            if (build) File.WriteAllText(path, "print(42)");
            var ok = File.Exists(path) && File.ReadAllText(path) == "print(42)";
            var execution = new CodeExecutionResult("python", directory, path, "fixture", ok ? 0 : 1, ok ? "검증 출력" : "", ok ? "" : "작업 파일이 없습니다", ok ? "ok" : "error");
            return Task.FromResult(new CodingRunResult("orchestration", conversation, "fixture", "fixture", "python", "", execution,
                Array.Empty<CodingWorkerResult>(), build ? new[] { "main.py" } : Array.Empty<string>(), build ? "구현 완료" : "검증 완료", null!, null));
        }
        public Task<CodingRunResult> RunCodingSingleAsync(CodingRunRequest request, CancellationToken cancellationToken, Action<CodingProgressUpdate>? progressCallback = null) => throw new NotSupportedException();
        public Task<CodingRunResult> RunCodingMultiAsync(CodingRunRequest request, CancellationToken cancellationToken, Action<CodingProgressUpdate>? progressCallback = null) => throw new NotSupportedException();
        public Task<CodingResultExecutionResult> ExecuteLatestCodingResultAsync(string conversationId, string? standardInput, CancellationToken cancellationToken, string? preferredTarget = null) => throw new NotSupportedException();
    }

    private sealed class CommandExecutor : ICommandExecutionService
    {
        public Task<string> ExecuteAsync(string input, string source, CancellationToken cancellationToken, IReadOnlyList<InputAttachment>? attachments = null, IReadOnlyList<string>? webUrls = null, bool webSearchEnabled = true, Action<string>? streamCallback = null, TelegramTurnContext? telegramContext = null) => throw new NotSupportedException();
        public TelegramExecutionMetadata GetCurrentTelegramExecutionMetadata() => new();
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
