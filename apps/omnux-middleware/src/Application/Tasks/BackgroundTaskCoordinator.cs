using System.Text;
namespace Omnux.Middleware;

public sealed partial class BackgroundTaskCoordinator
{
    private const int MaxParallelBackgroundTasks = 3;

    private readonly TaskGraphService _taskGraphService;
    private readonly IStatePathResolver _pathResolver;
    private readonly object _gate = new();
    private readonly Dictionary<string, GraphRunState> _runs = new(StringComparer.Ordinal);
    private readonly SemaphoreSlim _workspaceLane = new(1, 1);

    private ICodingApplicationService? _codingService;
    private ICommandExecutionService? _commandExecutionService;

    private sealed class GraphRunState
    {
        public GraphRunState(string graphId, bool freshRun)
        {
            GraphId = graphId;
            HistoryStartUtc = freshRun ? DateTimeOffset.UtcNow : DateTimeOffset.MinValue;
        }

        public string GraphId { get; }
        public DateTimeOffset HistoryStartUtc { get; }
        public bool Stopping { get; set; }
        public CancellationTokenSource CancellationSource { get; } = new();
        public List<TaskGraphEventSink> Subscribers { get; } = new();
        public Dictionary<string, CancellationTokenSource> TaskTokens { get; } = new(StringComparer.Ordinal);
        public Task? LoopTask { get; set; }
    }

    private sealed record RunningTaskHandle(
        string Category,
        Task Task
    );

    public BackgroundTaskCoordinator(TaskGraphService taskGraphService, IStatePathResolver pathResolver)
    {
        _taskGraphService = taskGraphService;
        _pathResolver = pathResolver;
    }

    public void ConfigureExecutors(
        ICodingApplicationService codingService,
        ICommandExecutionService commandExecutionService
    )
    {
        _codingService = codingService;
        _commandExecutionService = commandExecutionService;
    }

    public Task<TaskGraphActionResult> RunGraphAsync(
        string graphId,
        string source,
        TaskGraphEventSink? eventSink,
        CancellationToken cancellationToken
    )
    {
        return RunGraphInternalAsync(graphId, source, eventSink, resetAll: true, cancellationToken);
    }

    public Task<TaskGraphActionResult> ResumeGraphAsync(
        string graphId,
        string source,
        TaskGraphEventSink? eventSink,
        CancellationToken cancellationToken
    )
    {
        return RunGraphInternalAsync(graphId, source, eventSink, resetAll: false, cancellationToken);
    }

    public Task<TaskGraphActionResult> RetryTaskAsync(string graphId, string taskId, string source,
        TaskGraphEventSink? eventSink, CancellationToken cancellationToken)
        => RunGraphInternalAsync(graphId, source, eventSink, false, cancellationToken, taskId);

    private Task<TaskGraphActionResult> RunGraphInternalAsync(
        string graphId,
        string source,
        TaskGraphEventSink? eventSink,
        bool resetAll,
        CancellationToken cancellationToken,
        string? retryTaskId = null
    )
    {
        if (cancellationToken.IsCancellationRequested)
            return Task.FromResult(new TaskGraphActionResult(false, "실행 요청이 취소되었습니다.", null));
        if (_codingService == null || _commandExecutionService == null)
        {
            return Task.FromResult(new TaskGraphActionResult(false, "Task graph 실행기가 아직 준비되지 않았습니다.", null));
        }

        var current = _taskGraphService.GetGraph(graphId);
        if (current == null)
        {
            return Task.FromResult(new TaskGraphActionResult(false, "Task graph를 찾을 수 없습니다.", null));
        }

        lock (_gate)
        {
            if (_runs.TryGetValue(current.Graph.GraphId, out var stopping) && stopping.Stopping && stopping.LoopTask != null)
                return AfterGraphStopsAsync(stopping.LoopTask, () => RunGraphInternalAsync(graphId, source, eventSink, resetAll, cancellationToken, retryTaskId));
            var retry = retryTaskId == null ? null : _taskGraphService.RetryTask(current.Graph.GraphId, retryTaskId);
            if (retry is { Ok: false }) return Task.FromResult(retry);
            if (_runs.TryGetValue(current.Graph.GraphId, out var existing))
            {
                if (eventSink != null)
                {
                    existing.Subscribers.Add(eventSink);
                }

                return Task.FromResult(retry ?? new TaskGraphActionResult(true, "이미 실행 중인 Task graph에 연결했습니다.", current));
            }
            var prepared = retry?.Snapshot ?? (resetAll
                ? _taskGraphService.PrepareForRun(current.Graph.GraphId)
                : _taskGraphService.PrepareForResume(current.Graph.GraphId));
            if (prepared.Graph.Nodes.All(node => node.Status == TaskNodeStatus.Completed))
                return Task.FromResult(new TaskGraphActionResult(false, "이어서 실행할 작업이 없습니다.", prepared));
            var runState = new GraphRunState(prepared.Graph.GraphId, resetAll && retryTaskId == null);
            if (eventSink != null) runState.Subscribers.Add(eventSink);
            _runs[prepared.Graph.GraphId] = runState;
            runState.LoopTask = Task.Run(() => ExecuteGraphLoopAsync(prepared.Graph.GraphId, source, runState));
            return Task.FromResult(new TaskGraphActionResult(true, "Task graph 실행을 시작했습니다.", prepared));
        }
    }

    private static async Task<TaskGraphActionResult> AfterGraphStopsAsync(Task loop, Func<Task<TaskGraphActionResult>> next)
    {
        try { await loop.ConfigureAwait(false); }
        catch (OperationCanceledException) { }
        return await next().ConfigureAwait(false);
    }

    public TaskGraphActionResult CancelGraph(string graphId)
    {
        var snapshot = _taskGraphService.GetGraph(graphId);
        if (snapshot == null) return new TaskGraphActionResult(false, "작업을 찾을 수 없습니다.", null);
        GraphRunState? run;
        lock (_gate)
        {
            _runs.TryGetValue(snapshot.Graph.GraphId, out run);
            if (run != null) run.Stopping = true;
        }
        if (run == null)
            return new TaskGraphActionResult(IsTerminal(snapshot.Graph.Status), IsTerminal(snapshot.Graph.Status) ? "작업이 이미 종료되었습니다." : "현재 서버에서 실행 중인 작업이 아닙니다.", snapshot);
        try { run.CancellationSource.Cancel(); }
        catch (ObjectDisposedException) { return new TaskGraphActionResult(true, "작업이 이미 종료되었습니다.", _taskGraphService.GetGraph(graphId)); }
        return new TaskGraphActionResult(true, "작업 중단을 요청했습니다. 실행을 정리하고 있습니다.", snapshot);
    }

    public TaskGraphActionResult CancelTask(string graphId, string taskId)
    {
        var snapshot = _taskGraphService.GetGraph(graphId);
        if (snapshot == null)
        {
            return new TaskGraphActionResult(false, "Task graph를 찾을 수 없습니다.", null);
        }

        GraphRunState? runState;
        CancellationTokenSource? taskToken = null;
        lock (_gate)
        {
            _runs.TryGetValue(snapshot.Graph.GraphId, out runState);
            if (runState != null) runState.TaskTokens.TryGetValue(taskId, out taskToken);
        }
        if (taskToken != null)
        {
            try
            {
                taskToken.Cancel();
                return new TaskGraphActionResult(true, "실행 중인 작업에 취소 요청을 전달했습니다.", snapshot);
            }
            catch (ObjectDisposedException)
            {
                return new TaskGraphActionResult(true, "작업이 이미 종료되었습니다.", _taskGraphService.GetGraph(graphId));
            }
        }

        try
        {
            var updated = _taskGraphService.CancelPendingTask(snapshot.Graph.GraphId, taskId);
            var node = updated.Graph.Nodes.FirstOrDefault(item => item.TaskId.Equals(taskId, StringComparison.Ordinal));
            if (runState != null && node != null)
            {
                _ = Task.Run(() => EmitTaskUpdatedAsync(runState, updated.Graph.GraphId, node, CancellationToken.None));
            }

            return new TaskGraphActionResult(true, "대기 중인 작업을 취소했습니다.", updated);
        }
        catch (Exception ex)
        {
            return new TaskGraphActionResult(false, $"작업 취소 실패: {ex.Message}", snapshot);
        }
    }

    public async Task StopAsync()
    {
        Task[] tasks;
        GraphRunState[] runs;
        lock (_gate)
        {
            runs = _runs.Values.ToArray();
            foreach (var run in runs) run.Stopping = true;
            tasks = _runs.Values
                .Select(run => run.LoopTask)
                .Where(task => task != null)
                .Cast<Task>()
                .ToArray();
        }
        foreach (var run in runs)
        {
            try { run.CancellationSource.Cancel(); }
            catch (ObjectDisposedException) { }
        }

        if (tasks.Length == 0)
        {
            return;
        }

        try
        {
            await Task.WhenAll(tasks);
        }
        catch
        {
        }
    }

    private async Task ExecuteGraphLoopAsync(string graphId, string source, GraphRunState runState)
    {
        var inflight = new Dictionary<string, RunningTaskHandle>(StringComparer.Ordinal);

        try
        {
            while (!runState.CancellationSource.IsCancellationRequested)
            {
                foreach (var completed in inflight.Where(item => item.Value.Task.IsCompleted).Select(item => item.Key).ToArray())
                {
                    var handle = inflight[completed];
                    inflight.Remove(completed);
                    try
                    {
                        await handle.Task;
                    }
                    catch
                    {
                    }
                }

                var before = _taskGraphService.GetGraph(graphId);
                if (before == null)
                {
                    break;
                }

                var snapshot = _taskGraphService.UpdateReadiness(graphId);
                await EmitSnapshotDiffAsync(runState, before, snapshot, runState.CancellationSource.Token);

                if (IsTerminal(snapshot.Graph.Status) && inflight.Count == 0)
                {
                    break;
                }

                var workspaceBusy = inflight.Values.Any(item => IsWorkspaceExclusive(item.Category));
                var runningBackgroundCount = inflight.Values.Count(item => !IsWorkspaceExclusive(item.Category));
                var readyNodes = snapshot.Graph.Nodes
                    .Where(node => node.Status == TaskNodeStatus.Pending && !inflight.ContainsKey(node.TaskId))
                    .OrderBy(node => node.TaskId, StringComparer.Ordinal)
                    .ToArray();

                foreach (var node in readyNodes)
                {
                    if (IsWorkspaceExclusive(node.Category))
                    {
                        if (workspaceBusy)
                        {
                            continue;
                        }

                        workspaceBusy = true;
                    }
                    else
                    {
                        if (runningBackgroundCount >= MaxParallelBackgroundTasks)
                        {
                            continue;
                        }

                        runningBackgroundCount += 1;
                    }

                    inflight[node.TaskId] = new RunningTaskHandle(
                        node.Category,
                        ExecuteNodeAsync(graphId, node, source, runState)
                    );
                }

                if (inflight.Count == 0)
                {
                    var current = _taskGraphService.GetGraph(graphId);
                    if (current == null || IsTerminal(current.Graph.Status))
                    {
                        break;
                    }
                }

                await Task.Delay(TimeSpan.FromMilliseconds(250), runState.CancellationSource.Token);
            }
        }
        catch (OperationCanceledException)
        {
        }
        finally
        {
            foreach (var handle in inflight.Values)
            {
                try
                {
                    await handle.Task;
                }
                catch
                {
                }
            }

            FinalizeGraphShutdown(graphId);
            lock (_gate)
            {
                _runs.Remove(graphId);
            }

            runState.CancellationSource.Dispose();
        }
    }

    private void FinalizeGraphShutdown(string graphId)
    {
        var snapshot = _taskGraphService.GetGraph(graphId);
        if (snapshot == null)
        {
            return;
        }

        if (!IsTerminal(snapshot.Graph.Status))
        {
            foreach (var node in snapshot.Graph.Nodes)
            {
                if (node.Status == TaskNodeStatus.Pending || node.Status == TaskNodeStatus.Blocked)
                {
                    try
                    {
                        _taskGraphService.CancelPendingTask(graphId, node.TaskId, "애플리케이션 종료로 취소되었습니다.");
                    }
                    catch
                    {
                    }
                }
            }
        }

        _ = _taskGraphService.UpdateReadiness(graphId);
    }

    private async Task EmitSnapshotDiffAsync(
        GraphRunState runState,
        TaskGraphSnapshot before,
        TaskGraphSnapshot after,
        CancellationToken cancellationToken
    )
    {
        var beforeById = before.Graph.Nodes.ToDictionary(node => node.TaskId, StringComparer.Ordinal);
        foreach (var node in after.Graph.Nodes)
        {
            if (beforeById.TryGetValue(node.TaskId, out var previous)
                && string.Equals(
                    TaskGraphJson.Serialize(previous),
                    TaskGraphJson.Serialize(node),
                    StringComparison.Ordinal))
            {
                continue;
            }

            await EmitTaskUpdatedAsync(runState, after.Graph.GraphId, node, cancellationToken);
        }
    }

    private async Task EmitTaskUpdatedAsync(
        GraphRunState runState,
        string graphId,
        TaskNode node,
        CancellationToken cancellationToken
    )
    {
        foreach (var sink in SnapshotSubscribers(runState))
        {
            if (sink.OnTaskUpdatedAsync == null)
            {
                continue;
            }

            try
            {
                await sink.OnTaskUpdatedAsync(graphId, node, cancellationToken);
            }
            catch
            {
            }
        }
    }

    private async Task AppendLogAsync(
        GraphRunState runState,
        string graphId,
        string taskId,
        string path,
        string line,
        CancellationToken cancellationToken
    )
    {
        AppendPlainLog(path, line);
        foreach (var sink in SnapshotSubscribers(runState))
        {
            if (sink.OnTaskLogAsync == null)
            {
                continue;
            }

            try
            {
                await sink.OnTaskLogAsync(graphId, taskId, line, cancellationToken);
            }
            catch
            {
            }
        }
    }

    private TaskGraphEventSink[] SnapshotSubscribers(GraphRunState runState)
    {
        lock (_gate) return runState.Subscribers.ToArray();
    }

    private static void AppendPlainLog(string path, string line)
    {
        var text = $"[{DateTimeOffset.UtcNow:O}] {line}{Environment.NewLine}";
        File.AppendAllText(path, text, Encoding.UTF8);
    }

    private static TaskNode FindNode(TaskGraphSnapshot snapshot, string taskId)
    {
        return snapshot.Graph.Nodes.First(node => node.TaskId.Equals(taskId, StringComparison.Ordinal));
    }

    private static bool IsWorkspaceExclusive(string category)
    {
        return category == "coding"
            || category == "refactor"
            || category == "documentation"
            || category == "verification";
    }

    private static bool IsTerminal(TaskGraphStatus status)
    {
        return status == TaskGraphStatus.Completed
            || status == TaskGraphStatus.Failed
            || status == TaskGraphStatus.Canceled;
    }

    private static string ResolveExecutorKind(string category)
    {
        return IsWorkspaceExclusive(category) ? "coding_orchestration" : "command_execution";
    }

    private static string NormalizeExecutionSource(string source)
    {
        return source.Equals("telegram", StringComparison.OrdinalIgnoreCase) ? "web" : "web";
    }

    private static bool IsSuccessfulExecutionStatus(string? status)
    {
        var normalized = (status ?? string.Empty).Trim().ToLowerInvariant();
        return normalized == "ok" || normalized == "success";
    }

    private static string TrimText(string value, int maxChars)
    {
        var normalized = (value ?? string.Empty).Trim();
        if (normalized.Length <= maxChars)
        {
            return normalized;
        }

        return normalized[..maxChars] + "...";
    }

    private static string BuildFailedResultJson(string error)
    {
        return "{\n"
            + "  \"ok\": false,\n"
            + $"  \"error\": \"{WebSocketGateway.EscapeJson(error)}\"\n"
            + "}";
    }

    private static string BuildCodingResultJson(CodingRunResult result, string summary, string runtimePath)
    {
        var builder = new StringBuilder();
        builder.AppendLine("{");
        builder.AppendLine($"  \"ok\": {(IsSuccessfulExecutionStatus(result.Execution.Status) ? "true" : "false")},");
        builder.AppendLine($"  \"mode\": \"{WebSocketGateway.EscapeJson(result.Mode)}\",");
        builder.AppendLine($"  \"provider\": \"{WebSocketGateway.EscapeJson(result.Provider)}\",");
        builder.AppendLine($"  \"model\": \"{WebSocketGateway.EscapeJson(result.Model)}\",");
        builder.AppendLine($"  \"conversationId\": \"{WebSocketGateway.EscapeJson(result.ConversationId)}\",");
        builder.AppendLine("  \"changedFiles\": [");
        for (var i = 0; i < result.ChangedFiles.Count; i += 1)
        {
            var suffix = i == result.ChangedFiles.Count - 1 ? string.Empty : ",";
            builder.AppendLine($"    \"{WebSocketGateway.EscapeJson(result.ChangedFiles[i])}\"{suffix}");
        }

        builder.AppendLine("  ],");
        builder.AppendLine("  \"execution\": {");
        builder.AppendLine($"    \"status\": \"{WebSocketGateway.EscapeJson(result.Execution.Status)}\",");
        builder.AppendLine($"    \"exitCode\": {result.Execution.ExitCode},");
        builder.AppendLine($"    \"command\": \"{WebSocketGateway.EscapeJson(result.Execution.Command)}\",");
        builder.AppendLine($"    \"stdout\": \"{WebSocketGateway.EscapeJson(TrimText(result.Execution.ProgramStdOut ?? result.Execution.StdOut, 16000))}\",");
        builder.AppendLine($"    \"stderr\": \"{WebSocketGateway.EscapeJson(TrimText(result.Execution.ProgramStdErr ?? result.Execution.StdErr, 16000))}\",");
        builder.AppendLine($"    \"runDirectory\": \"{WebSocketGateway.EscapeJson(result.Execution.RunDirectory)}\"");
        builder.AppendLine("  },");
        builder.AppendLine($"  \"summary\": \"{WebSocketGateway.EscapeJson(summary)}\",");
        builder.AppendLine($"  \"runtimePath\": \"{WebSocketGateway.EscapeJson(runtimePath)}\"");
        builder.Append('}');
        return builder.ToString();
    }

    private static string BuildCommandResultJson(string summary, string runtimePath)
    {
        return "{\n"
            + "  \"ok\": true,\n"
            + "  \"executor\": \"command_execution\",\n"
            + $"  \"output\": \"{WebSocketGateway.EscapeJson(summary)}\",\n"
            + $"  \"runtimePath\": \"{WebSocketGateway.EscapeJson(runtimePath)}\"\n"
            + "}";
    }
}
