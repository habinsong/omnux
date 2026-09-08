using System.Text;

namespace Omnux.Middleware;

public sealed partial class BackgroundTaskCoordinator
{
    private sealed record TaskExecutionOutcome(
        string Status,
        string ExecutorKind,
        string? ConversationId,
        string OutputSummary,
        string? ArtifactPath,
        string ResultJson
    );

    private async Task ExecuteNodeAsync(string graphId, TaskNode node, string source, GraphRunState runState)
    {
        var taskCts = new CancellationTokenSource();
        lock (_gate)
        {
            runState.TaskTokens[node.TaskId] = taskCts;
        }

        using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(
            runState.CancellationSource.Token,
            taskCts.Token
        );
        var token = linkedCts.Token;
        var startedAtUtc = DateTimeOffset.UtcNow;
        var runtimePath = _pathResolver.GetTaskAttemptRuntimePath(graphId, node.TaskId, Guid.NewGuid().ToString("N"));
        var stdoutPath = Path.Combine(runtimePath, "stdout.log");
        var stderrPath = Path.Combine(runtimePath, "stderr.log");
        var resultPath = Path.Combine(runtimePath, "result.json");
        var previous = _taskGraphService.GetGraph(graphId);
        if (previous != null) previous = previous with { Executions = previous.Executions.Where(item => item.StartedAtUtc >= runState.HistoryStartUtc).ToArray() };
        var conversationId = previous != null && IsWorkspaceExclusive(node.Category)
            ? TaskExecutionContext.ResolveConversationId(previous, node) : null;

        var startRecord = new TaskExecutionRecord(
            graphId,
            node.TaskId,
            node.Title,
            node.Category,
            startedAtUtc,
            null,
            "running",
            ResolveExecutorKind(node.Category),
            source,
            runtimePath,
            stdoutPath,
            stderrPath,
            resultPath,
            conversationId,
            null,
            null,
            null
        );
        try
        {
            token.ThrowIfCancellationRequested();
            Directory.CreateDirectory(runtimePath);
            File.WriteAllText(stdoutPath, string.Empty, Encoding.UTF8);
            File.WriteAllText(stderrPath, string.Empty, Encoding.UTF8);
            var runningSnapshot = _taskGraphService.UpdateTaskState(
                graphId,
                node.TaskId,
                current => current with
                {
                    Status = TaskNodeStatus.Running,
                    Error = null,
                    OutputSummary = null,
                    ArtifactPath = null,
                    StartedAtUtc = startedAtUtc,
                    CompletedAtUtc = null
                },
                executions => UpsertExecution(executions, startRecord)
            );
            await EmitTaskUpdatedAsync(runState, graphId, FindNode(runningSnapshot, node.TaskId), token);
            await AppendLogAsync(runState, graphId, node.TaskId, stdoutPath, $"started {node.Category}", token);
            TaskExecutionOutcome outcome;
            if (IsWorkspaceExclusive(node.Category))
            {
                await _workspaceLane.WaitAsync(token);
                try
                {
                    outcome = await ExecuteWorkspaceTaskAsync(graphId, node, source, stdoutPath, stderrPath, token, runtimePath, startRecord.ConversationId, id =>
                    {
                        if (string.IsNullOrWhiteSpace(id) || id == startRecord.ConversationId) return;
                        startRecord = startRecord with { ConversationId = id };
                        var checkpointRecord = startRecord;
                        _taskGraphService.UpdateTaskState(graphId, node.TaskId, current => current,
                            executions => UpsertExecution(executions, checkpointRecord));
                    });
                }
                finally
                {
                    _workspaceLane.Release();
                }
            }
            else
            {
                outcome = await ExecuteBackgroundTaskAsync(node, source, stdoutPath, token, runtimePath);
            }

            token.ThrowIfCancellationRequested();
            await File.WriteAllTextAsync(resultPath, outcome.ResultJson, Encoding.UTF8, token);
            var completedAtUtc = DateTimeOffset.UtcNow;
            var completedRecord = startRecord with
            {
                CompletedAtUtc = completedAtUtc,
                Status = outcome.Status,
                ConversationId = outcome.ConversationId ?? startRecord.ConversationId,
                OutputSummary = outcome.OutputSummary,
                ArtifactPath = outcome.ArtifactPath
            };
            var completedSnapshot = _taskGraphService.UpdateTaskState(
                graphId,
                node.TaskId,
                current => current with
                {
                    Status = outcome.Status == "ok" ? TaskNodeStatus.Completed : TaskNodeStatus.Failed,
                    OutputSummary = outcome.OutputSummary,
                    ArtifactPath = outcome.ArtifactPath,
                    Error = outcome.Status == "ok" ? null : outcome.OutputSummary,
                    CompletedAtUtc = completedAtUtc
                },
                executions => UpsertExecution(executions, completedRecord)
            );
            await AppendLogAsync(
                runState,
                graphId,
                node.TaskId,
                outcome.Status == "ok" ? stdoutPath : stderrPath,
                outcome.Status == "ok" ? "completed" : $"failed {outcome.OutputSummary}",
                token
            );
            await EmitTaskUpdatedAsync(runState, graphId, FindNode(completedSnapshot, node.TaskId), token);
        }
        catch (OperationCanceledException) when (token.IsCancellationRequested)
        {
            var canceledAtUtc = DateTimeOffset.UtcNow;
            var canceledRecord = startRecord with
            {
                CompletedAtUtc = canceledAtUtc,
                Status = "canceled",
                Error = "작업이 취소되었습니다."
            };
            var canceledSnapshot = _taskGraphService.UpdateTaskState(
                graphId,
                node.TaskId,
                current => current with
                {
                    Status = TaskNodeStatus.Canceled,
                    Error = "작업이 취소되었습니다.",
                    CompletedAtUtc = canceledAtUtc
                },
                executions => UpsertExecution(executions, canceledRecord)
            );
            TryWriteFailureResult(resultPath, "작업이 취소되었습니다.");
            await AppendFailureLogAsync(runState, graphId, node.TaskId, stderrPath, "canceled");
            await EmitTaskUpdatedAsync(runState, graphId, FindNode(canceledSnapshot, node.TaskId), CancellationToken.None);
        }
        catch (Exception ex)
        {
            var failedAtUtc = DateTimeOffset.UtcNow;
            var failedMessage = TrimText(ex.Message, 800);
            var failedRecord = startRecord with
            {
                CompletedAtUtc = failedAtUtc,
                Status = "error",
                Error = failedMessage
            };
            var failedSnapshot = _taskGraphService.UpdateTaskState(
                graphId,
                node.TaskId,
                current => current with
                {
                    Status = TaskNodeStatus.Failed,
                    Error = failedMessage,
                    CompletedAtUtc = failedAtUtc
                },
                executions => UpsertExecution(executions, failedRecord)
            );
            TryWriteFailureResult(resultPath, failedMessage);
            await AppendFailureLogAsync(runState, graphId, node.TaskId, stderrPath, $"exception {failedMessage}");
            await EmitTaskUpdatedAsync(runState, graphId, FindNode(failedSnapshot, node.TaskId), CancellationToken.None);
        }
        finally
        {
            lock (_gate)
            {
                if (_runs.TryGetValue(graphId, out var active))
                {
                    if (active.TaskTokens.Remove(node.TaskId, out var registeredToken))
                    {
                        registeredToken.Dispose();
                    }
                }
                else
                {
                    taskCts.Dispose();
                }
            }
        }
    }

    private static void TryWriteFailureResult(string resultPath, string message)
    {
        try { File.WriteAllText(resultPath, BuildFailedResultJson(message), Encoding.UTF8); }
        catch (IOException) { }
        catch (UnauthorizedAccessException) { }
    }

    private async Task AppendFailureLogAsync(GraphRunState run, string graphId, string taskId, string path, string line)
    {
        try { await AppendLogAsync(run, graphId, taskId, path, line, CancellationToken.None); }
        catch (IOException) { }
        catch (UnauthorizedAccessException) { }
    }

    private async Task<TaskExecutionOutcome> ExecuteWorkspaceTaskAsync(
        string graphId,
        TaskNode node,
        string source,
        string stdoutPath,
        string stderrPath,
        CancellationToken cancellationToken,
        string runtimePath,
        string? conversationId,
        Action<string> conversationReady
    )
    {
        if (_codingService == null)
        {
            throw new InvalidOperationException("coding executor is not configured");
        }

        var effectiveSource = NormalizeExecutionSource(source);
        var snapshot = _taskGraphService.GetGraph(graphId)
            ?? throw new InvalidOperationException("Task graph를 찾을 수 없습니다.");
        var result = await _codingService.RunCodingOrchestrationAsync(
            TaskExecutionContext.CreateCodingRequest(snapshot, node, effectiveSource) with { ConversationId = conversationId },
            cancellationToken,
            progress =>
            {
                if (!string.IsNullOrWhiteSpace(progress.ConversationId)) conversationReady(progress.ConversationId);
                var line = string.IsNullOrWhiteSpace(progress.Message)
                    ? $"{progress.Phase} {progress.StageTitle} {progress.StageDetail}".Trim()
                    : progress.Message;
                if (string.IsNullOrWhiteSpace(line))
                {
                    return;
                }

                AppendPlainLog(stdoutPath, $"progress {TrimText(line, 400)}");
            }
        );

        if (!string.IsNullOrWhiteSpace(result.Execution.StdOut)) AppendPlainLog(stdoutPath, result.Execution.StdOut);
        if (!string.IsNullOrWhiteSpace(result.Execution.StdErr)) AppendPlainLog(stderrPath, result.Execution.StdErr);
        var summary = TrimText(result.Summary, 1600);
        var artifactPath = result.ChangedFiles.FirstOrDefault();
        if (!string.IsNullOrWhiteSpace(artifactPath) && !Path.IsPathRooted(artifactPath)
            && Path.IsPathRooted(result.Execution.RunDirectory))
        {
            artifactPath = Path.GetFullPath(Path.Combine(result.Execution.RunDirectory, artifactPath));
        }
        return new TaskExecutionOutcome(
            IsSuccessfulExecutionStatus(result.Execution.Status) ? "ok" : "error",
            "coding_orchestration",
            result.ConversationId,
            summary,
            artifactPath,
            BuildCodingResultJson(result, summary, runtimePath)
        );
    }

    private async Task<TaskExecutionOutcome> ExecuteBackgroundTaskAsync(
        TaskNode node,
        string source,
        string stdoutPath,
        CancellationToken cancellationToken,
        string runtimePath
    )
    {
        if (_commandExecutionService == null)
        {
            throw new InvalidOperationException("command executor is not configured");
        }

        var effectiveSource = NormalizeExecutionSource(source);
        var output = await _commandExecutionService.ExecuteAsync(
            node.Prompt,
            effectiveSource,
            cancellationToken
        );
        var summary = TrimText(output, 1600);
        AppendPlainLog(stdoutPath, summary);
        return new TaskExecutionOutcome(
            "ok",
            "command_execution",
            null,
            summary,
            runtimePath,
            BuildCommandResultJson(summary, runtimePath)
        );
    }

    private static IReadOnlyList<TaskExecutionRecord> UpsertExecution(
        IReadOnlyList<TaskExecutionRecord> executions,
        TaskExecutionRecord nextRecord
    )
    {
        var next = executions
            .Where(item => !item.RuntimePath.Equals(nextRecord.RuntimePath, StringComparison.Ordinal))
            .ToList();
        next.Add(nextRecord);
        return next
            .OrderBy(item => item.StartedAtUtc)
            .ToArray();
    }

}
