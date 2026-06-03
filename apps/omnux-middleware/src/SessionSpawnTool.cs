namespace Omnux.Middleware;

public sealed record SessionSpawnToolResult(
    string Status,
    string? Error,
    string RunId,
    string ChildSessionKey,
    string Mode,
    string Runtime,
    string? Note,
    int RunTimeoutSeconds,
    bool Thread,
    bool TaskTruncated,
    string FollowUpStatus,
    string FollowUpAction,
    string? BackendSessionId = null,
    string? ThreadBindingKey = null,
    string? CommandPriority = null
);

public sealed record SessionSpawnQueueStatus(
    bool BreakerBlocked,
    string BreakerReason,
    string? BreakerMessage,
    AgentSpawnQueueSnapshot? Queue,
    AgentSpawnActiveSnapshot? Active = null,
    AgentSpawnWatchdogSnapshot? Watchdog = null
);

public sealed class SessionSpawnTool
{
    private const int SessionsSpawnTaskMaxChars = 4000;
    private const int SessionsSpawnLabelMaxChars = 80;
    private const int SessionsSpawnMaxTimeoutSeconds = 86_400;
    private const string SpawnAcceptedNote =
        "auto-announces on completion, do not poll/sleep. The response will be sent back as an user message.";
    private const string SpawnSessionAcceptedNote =
        "thread-bound session stays active after this task; continue in-thread for follow-ups.";
    private const string AcpSpawnAcceptedNote =
        "initial ACP task queued in isolated session; follow-ups continue in the bound thread.";
    private const string AcpSpawnSessionAcceptedNote =
        "thread-bound ACP session stays active after this task; continue in-thread for follow-ups.";
    private const string AcpPlaceholderReply =
        "ACP runtime bridge accepted this session and started dispatch preparation.";
    private const string AcpDispatchStartedReply =
        "ACP runtime bridge dispatched the initial task to the session runtime lane.";
    private const string AcpRunAnnounceReply =
        "ACP run completed in bridge mode. Review this child session transcript for result handoff.";
    private const string AcpSessionActiveReply =
        "ACP persistent session is active. Continue follow-ups in this bound thread.";
    private const string QueuedSpawnReply =
        "sessions_spawn was accepted into the persistent queue and will retry when budget or rate limits allow.";
    private const string QueueDispatchStartedReply =
        "persistent sessions_spawn queue resumed this task.";

    private readonly ConversationStore _conversationStore;
    private readonly AcpSessionBindingAdapter _acpSessionBindingAdapter;
    private readonly AgentSpawnAdmissionLimiter _admissionLimiter;
    private readonly AgentSpawnDailyCostLedger _dailyCostLedger;
    private readonly FileAgentSpawnQueueStore? _queueStore;
    private readonly FileAgentSpawnActiveRunStore? _activeRunStore;
    private readonly AgentSpawnWatchdogCoordinator? _watchdogCoordinator;
    private readonly AgentSpawnRunBreaker _runBreaker;
    private readonly AgentSpawnWorkspaceRollbackPolicy? _workspaceRollbackPolicy;
    private readonly GitWorktreeIsolationManager? _worktreeIsolationManager;
    private readonly Func<DateTimeOffset> _utcNow;

    public SessionSpawnTool(
        ConversationStore conversationStore,
        AcpSessionBindingAdapter acpSessionBindingAdapter
    )
        : this(
            conversationStore,
            acpSessionBindingAdapter,
            new AgentSpawnAdmissionLimiter(),
            new AgentSpawnDailyCostLedger(
                DefaultStatePathResolver.CreateDefault().ResolveStateFilePath("agent_spawn_daily_cost_ledger.json")
            ),
            new FileAgentSpawnQueueStore(DefaultStatePathResolver.CreateDefault()),
            new AgentSpawnRunBreaker(DefaultStatePathResolver.CreateDefault())
        )
    {
    }

    internal SessionSpawnTool(
        ConversationStore conversationStore,
        AcpSessionBindingAdapter acpSessionBindingAdapter,
        AgentSpawnAdmissionLimiter admissionLimiter,
        AgentSpawnDailyCostLedger dailyCostLedger,
        FileAgentSpawnQueueStore? queueStore = null,
        AgentSpawnRunBreaker? runBreaker = null,
        FileAgentSpawnActiveRunStore? activeRunStore = null,
        AgentSpawnWorkspaceRollbackPolicy? workspaceRollbackPolicy = null,
        GitWorktreeIsolationManager? worktreeIsolationManager = null,
        Func<DateTimeOffset>? utcNow = null
    )
    {
        _conversationStore = conversationStore;
        _acpSessionBindingAdapter = acpSessionBindingAdapter;
        _admissionLimiter = admissionLimiter;
        _dailyCostLedger = dailyCostLedger;
        _queueStore = queueStore;
        _activeRunStore = activeRunStore;
        _watchdogCoordinator = activeRunStore == null
            ? null
            : new AgentSpawnWatchdogCoordinator(activeRunStore, conversationStore);
        _runBreaker = runBreaker ?? new AgentSpawnRunBreaker(DefaultStatePathResolver.CreateDefault());
        _workspaceRollbackPolicy = workspaceRollbackPolicy;
        _worktreeIsolationManager = worktreeIsolationManager;
        _utcNow = utcNow ?? (() => DateTimeOffset.UtcNow);
    }

    public SessionSpawnToolResult Spawn(
        string? task,
        string? label = null,
        string? runtime = null,
        int? runTimeoutSeconds = null,
        int? timeoutSeconds = null,
        bool? thread = null,
        string? mode = null,
        string? acpModel = null,
        string? acpThinking = null,
        bool? acpLightContext = null,
        string? acpToolProfile = null,
        string? acpOutputDirectory = null,
        string? commandPriority = null
    ) => SpawnInternal(
        task,
        label,
        runtime,
        runTimeoutSeconds,
        timeoutSeconds,
        thread,
        mode,
        acpModel,
        acpThinking,
        acpLightContext,
        acpToolProfile,
        acpOutputDirectory,
        commandPriority,
        allowQueue: true,
        existingRunId: null,
        existingChildSessionKey: null,
        queuedAttemptCount: 0
    );

    internal IReadOnlyList<SessionSpawnToolResult> FlushQueuedSpawns(int maxCount)
    {
        if (_queueStore == null)
        {
            return Array.Empty<SessionSpawnToolResult>();
        }

        var breakerDecision = _runBreaker.Evaluate();
        if (breakerDecision.Blocked)
        {
            MarkActiveRunsBlockedByBreaker(breakerDecision);
            Console.Error.WriteLine($"[agent-spawn-breaker] queue flush skipped: {breakerDecision.Message}");
            return Array.Empty<SessionSpawnToolResult>();
        }

        var ready = _queueStore.ClaimReadyEntries(
            _utcNow(),
            Math.Max(1, maxCount),
            $"session-spawn-flush:{Environment.ProcessId}"
        );
        var results = new List<SessionSpawnToolResult>(ready.Count);
        foreach (var entry in ready)
        {
            try
            {
                _ = _conversationStore.AppendMessage(
                    entry.ChildSessionKey,
                    "system",
                    $"agent_spawn_queue.resume queueId={entry.Id} attempt={entry.AttemptCount + 1}",
                    "sessions_spawn_queue_resume"
                );
                _ = _conversationStore.AppendMessage(
                    entry.ChildSessionKey,
                    "assistant",
                    QueueDispatchStartedReply,
                    "sessions_spawn_queue_resume"
                );

                var result = SpawnInternal(
                    entry.Task,
                    entry.Label,
                    entry.Runtime,
                    entry.RunTimeoutSeconds,
                    entry.RunTimeoutSeconds,
                    entry.Thread,
                    entry.Mode,
                    entry.AcpModel,
                    entry.AcpThinking,
                    entry.AcpLightContext,
                    entry.AcpToolProfile,
                    entry.AcpOutputDirectory,
                    entry.CommandPriority,
                    allowQueue: false,
                    existingRunId: entry.RunId,
                    existingChildSessionKey: entry.ChildSessionKey,
                    queuedAttemptCount: entry.AttemptCount
                );

                results.Add(result);
                if (string.Equals(result.Status, "accepted", StringComparison.OrdinalIgnoreCase))
                {
                    _queueStore.MarkDelivered(entry.Id);
                    _ = _conversationStore.AppendMessage(
                        entry.ChildSessionKey,
                        "system",
                        $"agent_spawn_queue.delivered queueId={entry.Id} status={result.FollowUpStatus}",
                        "sessions_spawn_queue_delivered"
                    );
                    continue;
                }

                var retryScheduled = _queueStore.MarkFailed(entry.Id, result.Error ?? "queued spawn retry failed", _utcNow());
                _ = _conversationStore.AppendMessage(
                    entry.ChildSessionKey,
                    "system",
                    retryScheduled
                        ? $"agent_spawn_queue.retry_failed queueId={entry.Id} error={NormalizeSingleLine(result.Error) ?? "unknown"}"
                        : $"agent_spawn_queue.dead_letter queueId={entry.Id} attempts={entry.AttemptCount + 1} error={NormalizeSingleLine(result.Error) ?? "unknown"}",
                    retryScheduled ? "sessions_spawn_queue_retry_failed" : "sessions_spawn_queue_dead_letter"
                );
            }
            catch (Exception ex)
            {
                var retryScheduled = _queueStore.MarkFailed(entry.Id, ex.Message, _utcNow());
                _ = _conversationStore.AppendMessage(
                    entry.ChildSessionKey,
                    "system",
                    retryScheduled
                        ? $"agent_spawn_queue.retry_exception queueId={entry.Id} error={NormalizeSingleLine(ex.Message) ?? "unknown"}"
                        : $"agent_spawn_queue.dead_letter queueId={entry.Id} attempts={entry.AttemptCount + 1} error={NormalizeSingleLine(ex.Message) ?? "unknown"}",
                    retryScheduled ? "sessions_spawn_queue_retry_failed" : "sessions_spawn_queue_dead_letter"
                );
            }
        }

        return results;
    }

    public SessionSpawnQueueStatus GetQueueStatus()
    {
        var breakerDecision = _runBreaker.Evaluate();
        if (breakerDecision.Blocked)
        {
            MarkActiveRunsBlockedByBreaker(breakerDecision);
        }

        var watchdog = _watchdogCoordinator?.Evaluate(_utcNow());
        return new SessionSpawnQueueStatus(
            breakerDecision.Blocked,
            breakerDecision.Reason,
            breakerDecision.Message,
            _queueStore?.GetSnapshot(),
            _activeRunStore?.GetSnapshot(_utcNow()),
            watchdog
        );
    }

    public AgentSpawnQueueSnapshot? GetQueueSnapshot() => GetQueueStatus().Queue;

    private void MarkActiveRunsBlockedByBreaker(AgentSpawnRunBreakerDecision breakerDecision)
    {
        if (!breakerDecision.Blocked)
        {
            return;
        }

        var marked = _activeRunStore?.MarkActiveBlockedByBreaker(
            breakerDecision.Reason,
            breakerDecision.Message,
            _utcNow()
        ) ?? Array.Empty<AgentSpawnBlockedActiveRun>();
        if (marked.Count > 0)
        {
            Console.Error.WriteLine($"[agent-spawn-breaker] marked {marked.Count} active run(s) blocked by breaker: {breakerDecision.Reason}");
            foreach (var blocked in marked)
            {
                if (_conversationStore.Get(blocked.ChildSessionKey) == null)
                {
                    Console.Error.WriteLine($"[agent-spawn-breaker] skipped transcript audit for missing child session: {blocked.ChildSessionKey}");
                    continue;
                }

                _ = _conversationStore.AppendMessage(
                    blocked.ChildSessionKey,
                    "system",
                    $"agent_spawn_breaker.blocked runId={blocked.RunId} runtime={blocked.Runtime} mode={blocked.Mode} backend={blocked.Backend} killAction={ResolveBreakerKillAction(blocked.Backend)} recoveryAction={ResolveBreakerRecoveryAction(blocked.Backend, blocked.WorkspaceRollbackId)} workspaceRollbackId={NormalizeSingleLine(blocked.WorkspaceRollbackId) ?? "-"} workspaceRollbackChangedFiles={Math.Max(0, blocked.WorkspaceRollbackChangedFiles)} workspaceRollbackPartial={(blocked.WorkspaceRollbackPartial ? "true" : "false")} reason={blocked.Reason} message={NormalizeSingleLine(blocked.Message) ?? "blocked_by_breaker"}",
                    "sessions_spawn_breaker_blocked"
                );
                _ = _conversationStore.AppendMessage(
                    blocked.ChildSessionKey,
                    "assistant",
                    BuildBreakerClosedReply(blocked),
                    "sessions_spawn_breaker_closed"
                );
                _ = _conversationStore.UpdateMetadata(
                    blocked.ChildSessionKey,
                    project: null,
                    category: null,
                    tags: new[] { "sessions_spawn", blocked.Runtime, blocked.Mode, "blocked_by_breaker" }
                );
            }
        }
    }

    private SessionSpawnToolResult SpawnInternal(
        string? task,
        string? label,
        string? runtime,
        int? runTimeoutSeconds,
        int? timeoutSeconds,
        bool? thread,
        string? mode,
        string? acpModel,
        string? acpThinking,
        bool? acpLightContext,
        string? acpToolProfile,
        string? acpOutputDirectory,
        string? commandPriority,
        bool allowQueue,
        string? existingRunId,
        string? existingChildSessionKey,
        int queuedAttemptCount
    )
    {
        var runId = string.IsNullOrWhiteSpace(existingRunId) ? Guid.NewGuid().ToString("N") : existingRunId.Trim();
        var normalizedRuntime = NormalizeRuntime(runtime);
        var threadRequested = thread == true;
        var resolvedMode = ResolveMode(mode, threadRequested);
        var resolvedTimeoutSeconds = ResolveRunTimeoutSeconds(runTimeoutSeconds, timeoutSeconds);
        var resolvedCommandPriority = ResolveCommandPriority(commandPriority, normalizedRuntime, resolvedMode);
        var breakerDecision = _runBreaker.Evaluate();
        if (breakerDecision.Blocked)
        {
            MarkActiveRunsBlockedByBreaker(breakerDecision);
            return ErrorResult(
                breakerDecision.Message ?? "sessions_spawn run breaker active.",
                runId,
                normalizedRuntime,
                resolvedMode,
                resolvedTimeoutSeconds,
                threadRequested,
                "blocked_by_breaker",
                "wait_for_operator"
            );
        }

        var normalizedTask = (task ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalizedTask))
        {
            return ErrorResult(
                "task is required",
                runId,
                normalizedRuntime,
                resolvedMode,
                resolvedTimeoutSeconds,
                threadRequested
            );
        }

        if (resolvedMode == "session" && !threadRequested)
        {
            return ErrorResult(
                "mode=session requires thread=true.",
                runId,
                normalizedRuntime,
                resolvedMode,
                resolvedTimeoutSeconds,
                threadRequested
            );
        }

        var budgetDecision = AgentSpawnBudgetPolicy.Evaluate(
            normalizedRuntime,
            resolvedMode,
            resolvedTimeoutSeconds,
            threadRequested,
            normalizedTask.Length
        );
        if (!budgetDecision.Allowed)
        {
            return ErrorResult(
                budgetDecision.Error ?? "sessions_spawn budget rejected",
                runId,
                normalizedRuntime,
                resolvedMode,
                resolvedTimeoutSeconds,
                threadRequested
            );
        }

        var admissionDecision = _admissionLimiter.TryAcquire(
            budgetDecision,
            normalizedRuntime,
            resolvedMode,
            resolvedTimeoutSeconds,
            normalizedTask.Length
        );
        if (!admissionDecision.Allowed)
        {
            if (allowQueue && CanQueueRejectedSpawn(admissionDecision.Reason, admissionDecision.Error))
            {
                return QueueRejectedSpawn(
                    runId,
                    existingChildSessionKey,
                    normalizedTask,
                    label,
                    normalizedRuntime,
                    resolvedMode,
                    resolvedTimeoutSeconds,
                    threadRequested,
                    taskTruncated: false,
                    budgetTaskLength: normalizedTask.Length,
                    acpModel,
                    acpThinking,
                    acpLightContext,
                    acpToolProfile,
                    acpOutputDirectory,
                    resolvedCommandPriority,
                    admissionDecision.Reason,
                    admissionDecision.Error ?? "sessions_spawn admission rejected",
                    queuedAttemptCount
                );
            }

            return ErrorResult(
                admissionDecision.Error ?? "sessions_spawn admission rejected",
                runId,
                normalizedRuntime,
                resolvedMode,
                resolvedTimeoutSeconds,
                threadRequested
            );
        }

        var dailyCostDecision = _dailyCostLedger.TryReserve(
            admissionDecision.EstimatedTokens,
            admissionDecision.CostClass,
            normalizedRuntime,
            resolvedMode,
            resolvedTimeoutSeconds
        );
        if (!dailyCostDecision.Allowed)
        {
            _admissionLimiter.Release(admissionDecision.ReservationId);
            if (allowQueue && CanQueueRejectedSpawn(dailyCostDecision.Reason, dailyCostDecision.Error))
            {
                return QueueRejectedSpawn(
                    runId,
                    existingChildSessionKey,
                    normalizedTask,
                    label,
                    normalizedRuntime,
                    resolvedMode,
                    resolvedTimeoutSeconds,
                    threadRequested,
                    taskTruncated: false,
                    budgetTaskLength: normalizedTask.Length,
                    acpModel,
                    acpThinking,
                    acpLightContext,
                    acpToolProfile,
                    acpOutputDirectory,
                    resolvedCommandPriority,
                    dailyCostDecision.Reason,
                    dailyCostDecision.Error ?? "sessions_spawn daily cost cap rejected",
                    queuedAttemptCount
                );
            }

            return ErrorResult(
                dailyCostDecision.Error ?? "sessions_spawn daily cost cap rejected",
                runId,
                normalizedRuntime,
                resolvedMode,
                resolvedTimeoutSeconds,
                threadRequested
            );
        }

        try
        {
            var taskTruncated = false;
            if (normalizedTask.Length > SessionsSpawnTaskMaxChars)
            {
                normalizedTask = normalizedTask[..SessionsSpawnTaskMaxChars] + "\n...(truncated)...";
                taskTruncated = true;
            }

            var normalizedLabel = NormalizeLabel(label);
            if (normalizedRuntime == "acp")
            {
                return SpawnAcpSession(
                    runId,
                    normalizedTask,
                    normalizedLabel,
                    resolvedMode,
                    resolvedTimeoutSeconds,
                    threadRequested,
                    taskTruncated,
                    acpModel,
                    acpThinking,
                    acpLightContext,
                    acpToolProfile,
                    acpOutputDirectory,
                    resolvedCommandPriority,
                    budgetDecision,
                    admissionDecision,
                    dailyCostDecision,
                    existingChildSessionKey
                );
            }

            return SpawnSubagentSession(
                runId,
                normalizedTask,
                normalizedLabel,
                normalizedRuntime,
                resolvedMode,
                resolvedTimeoutSeconds,
                threadRequested,
                taskTruncated,
                budgetDecision,
                admissionDecision,
                dailyCostDecision,
                existingChildSessionKey
            );
        }
        catch
        {
            _dailyCostLedger.Release(dailyCostDecision.ReservationId);
            _admissionLimiter.Release(admissionDecision.ReservationId);
            throw;
        }
    }

    private SessionSpawnToolResult SpawnSubagentSession(
        string runId,
        string task,
        string? label,
        string runtime,
        string mode,
        int runTimeoutSeconds,
        bool thread,
        bool taskTruncated,
        AgentSpawnBudgetDecision budgetDecision,
        AgentSpawnAdmissionDecision admissionDecision,
        AgentSpawnDailyCostDecision dailyCostDecision,
        string? existingChildSessionKey
    )
    {
        try
        {
            var childSessionKey = EnsureSpawnConversation(
                existingChildSessionKey,
                label,
                runtime,
                mode,
                "subagent",
                new[] { "sessions_spawn", runtime, mode },
                task,
                placeholderReply: null,
                placeholderMeta: null
            );
            var activeId = _activeRunStore?.Start(new AgentSpawnActiveRunEntry
            {
                RunId = runId,
                ChildSessionKey = childSessionKey,
                Runtime = "subagent",
                Mode = mode,
                Backend = runtime,
                RunTimeoutSeconds = runTimeoutSeconds,
                StartedUtc = _utcNow(),
                LastHeartbeatUtc = _utcNow(),
                State = mode == "session" ? "session_active" : "pending_completion"
            });

            var note = mode == "session"
                ? SpawnSessionAcceptedNote
                : SpawnAcceptedNote;
            note = AppendAdmissionNote(
                AppendDailyCostNote(AppendBudgetNote(note, budgetDecision), dailyCostDecision),
                admissionDecision
            );
            var result = new SessionSpawnToolResult(
                "accepted",
                null,
                runId,
                childSessionKey,
                mode,
                runtime,
                note,
                runTimeoutSeconds,
                thread,
                taskTruncated,
                mode == "session" ? "session_active" : "pending_completion",
                mode == "session" ? "continue_in_thread" : "announce_on_completion"
            );
            if (mode != "session")
            {
                _activeRunStore?.Complete(activeId, "completion_announced", _utcNow());
            }

            return result;
        }
        catch
        {
            _dailyCostLedger.Release(dailyCostDecision.ReservationId);
            _admissionLimiter.Release(admissionDecision.ReservationId);
            throw;
        }
    }

    private SessionSpawnToolResult SpawnAcpSession(
        string runId,
        string task,
        string? label,
        string mode,
        int runTimeoutSeconds,
        bool thread,
        bool taskTruncated,
        string? acpModel,
        string? acpThinking,
        bool? acpLightContext,
        string? acpToolProfile,
        string? acpOutputDirectory,
        string commandPriority,
        AgentSpawnBudgetDecision budgetDecision,
        AgentSpawnAdmissionDecision admissionDecision,
        AgentSpawnDailyCostDecision dailyCostDecision,
        string? existingChildSessionKey
    )
    {
        AcpSessionBindingDispatchResult? dispatchResultSnapshot = null;
        var childSessionKey = EnsureSpawnConversation(
            existingChildSessionKey,
            label,
            "acp",
            mode,
            "acp",
            new[] { "sessions_spawn", "acp", mode, "staged" },
            task,
            AcpPlaceholderReply,
            "sessions_spawn_acp_staged"
        );
        _ = _conversationStore.UpdateMetadata(
            childSessionKey,
            project: null,
            category: null,
            tags: new[] { "sessions_spawn", "acp", mode, "staged" }
        );

        string? activeId = null;
        AgentSpawnWorkspaceBaseline? workspaceBaseline = null;
        GitWorktreeIsolationLease? worktreeLease = null;
        try
        {
            worktreeLease = TryPrepareWorktreeIsolation(runId, childSessionKey);
            workspaceBaseline = TryCaptureWorkspaceRollbackBaseline(runId, childSessionKey);
            _ = _conversationStore.AppendMessage(
                childSessionKey,
                "system",
                $"acp.lifecycle runId={runId} state=dispatched mode={mode}",
                "sessions_spawn_acp_dispatched"
            );
            _ = _conversationStore.AppendMessage(
                childSessionKey,
                "assistant",
                AcpDispatchStartedReply,
                "sessions_spawn_acp_dispatched"
            );
            _ = _conversationStore.UpdateMetadata(
                childSessionKey,
                project: null,
                category: null,
                tags: new[] { "sessions_spawn", "acp", mode, "dispatching" }
            );
            activeId = _activeRunStore?.Start(new AgentSpawnActiveRunEntry
            {
                RunId = runId,
                ChildSessionKey = childSessionKey,
                Runtime = "acp",
                Mode = mode,
                Backend = "acp_dispatch",
                RunTimeoutSeconds = runTimeoutSeconds,
                StartedUtc = _utcNow(),
                LastHeartbeatUtc = _utcNow(),
                State = "dispatching"
            });
            var dispatchResult = _acpSessionBindingAdapter.Dispatch(
                new AcpSessionBindingDispatchRequest(
                    runId,
                    childSessionKey,
                    mode,
                    task,
                    runTimeoutSeconds,
                    thread,
                    acpModel,
                    acpThinking,
                    acpLightContext,
                    acpToolProfile,
                    acpOutputDirectory,
                    commandPriority,
                    DefaultStatePathResolver.CreateDefault().ResolveStateFilePath("agent_spawn_breaker.json"),
                    worktreeLease?.Ready == true ? worktreeLease.WorktreePath : null
                )
            );
            dispatchResultSnapshot = dispatchResult;
            _activeRunStore?.MarkBackend(activeId, dispatchResult.Backend, dispatchResult.BackendSessionId, _utcNow());
            _ = _conversationStore.AppendMessage(
                childSessionKey,
                "system",
                BuildAcpDispatchTraceLine(
                    runId,
                    dispatchResult,
                    acpModel,
                    acpThinking,
                    acpLightContext,
                    acpToolProfile,
                    acpOutputDirectory,
                    commandPriority,
                    worktreeLease
                ),
                "sessions_spawn_acp_dispatch"
            );
            if (!dispatchResult.Accepted)
            {
                var errorText = NormalizeSingleLine(dispatchResult.Error);
                if (string.IsNullOrWhiteSpace(errorText))
                {
                    errorText = NormalizeSingleLine(dispatchResult.Message);
                }

                throw new InvalidOperationException(errorText ?? "acp adapter rejected dispatch");
            }

            if (mode == "session")
            {
                var workspaceRollback = TrySaveWorkspaceRollbackSnapshot(workspaceBaseline, runId, childSessionKey, activeId);
                var sessionNote = BuildAcpAcceptedNote(
                    AcpSpawnSessionAcceptedNote,
                    budgetDecision,
                    admissionDecision,
                    dailyCostDecision,
                    dispatchResult
                );
                sessionNote = AppendWorkspaceRollbackNote(sessionNote, workspaceRollback);
                sessionNote = AppendWorktreeNote(sessionNote, worktreeLease);
                _ = _conversationStore.AppendMessage(
                    childSessionKey,
                    "assistant",
                    AcpSessionActiveReply,
                    "sessions_spawn_acp_session_active"
                );
                _ = _conversationStore.AppendMessage(
                    childSessionKey,
                    "system",
                    $"acp.lifecycle runId={runId} state=session_active mode={mode}",
                    "sessions_spawn_acp_lifecycle"
                );
                _ = _conversationStore.UpdateMetadata(
                    childSessionKey,
                    project: null,
                    category: null,
                    tags: new[] { "sessions_spawn", "acp", mode, "active" }
                );
                _activeRunStore?.MarkState(activeId, "session_active", _utcNow());
                return new SessionSpawnToolResult(
                    "accepted",
                    null,
                    runId,
                    childSessionKey,
                    mode,
                    "acp",
                    sessionNote,
                    runTimeoutSeconds,
                    thread,
                    taskTruncated,
                    "session_active",
                    "continue_in_thread",
                    dispatchResult.BackendSessionId,
                    dispatchResult.ThreadBindingKey,
                    commandPriority
                );
            }

            var finalReply = string.IsNullOrWhiteSpace(dispatchResult.RawOutput)
                ? AcpRunAnnounceReply
                : dispatchResult.RawOutput.Trim();
            _ = _conversationStore.AppendMessage(
                childSessionKey,
                "assistant",
                finalReply,
                string.IsNullOrWhiteSpace(dispatchResult.RawOutput)
                    ? "sessions_spawn_acp_announced"
                    : "sessions_spawn_acp_result"
            );
            _ = _conversationStore.AppendMessage(
                childSessionKey,
                "system",
                $"acp.lifecycle runId={runId} state=completed mode={mode}",
                "sessions_spawn_acp_lifecycle"
            );
            _ = _conversationStore.UpdateMetadata(
                childSessionKey,
                project: null,
                category: null,
                tags: new[] { "sessions_spawn", "acp", mode, "completed" }
            );
            var completedWorkspaceRollback = TrySaveWorkspaceRollbackSnapshot(workspaceBaseline, runId, childSessionKey, activeId);
            _activeRunStore?.Complete(activeId, "completed", _utcNow());
            var runNote = BuildAcpAcceptedNote(
                AcpSpawnAcceptedNote,
                budgetDecision,
                admissionDecision,
                dailyCostDecision,
                dispatchResult
            );
            runNote = AppendWorkspaceRollbackNote(runNote, completedWorkspaceRollback);
            runNote = AppendWorktreeNote(runNote, worktreeLease);
            return new SessionSpawnToolResult(
                "accepted",
                null,
                runId,
                childSessionKey,
                mode,
                "acp",
                runNote,
                runTimeoutSeconds,
                thread,
                taskTruncated,
                "completion_announced",
                "review_child_session",
                dispatchResult.BackendSessionId,
                dispatchResult.ThreadBindingKey,
                commandPriority
            );
        }
        catch (Exception ex)
        {
            _dailyCostLedger.Release(dailyCostDecision.ReservationId);
            _admissionLimiter.Release(admissionDecision.ReservationId);
            var workspaceRollback = TrySaveWorkspaceRollbackSnapshot(workspaceBaseline, runId, childSessionKey, activeId);
            _ = _conversationStore.AppendMessage(
                childSessionKey,
                "assistant",
                $"ACP runtime bridge dispatch failed: {ex.Message}",
                "sessions_spawn_acp_failed"
            );
            _ = _conversationStore.UpdateMetadata(
                childSessionKey,
                project: null,
                category: null,
                tags: new[] { "sessions_spawn", "acp", mode, "failed" }
            );
            _activeRunStore?.Fail(activeId, ex.Message, _utcNow());
            return new SessionSpawnToolResult(
                "error",
                $"acp runtime dispatch failed: {ex.Message}",
                runId,
                childSessionKey,
                mode,
                "acp",
                BuildFailureWorkspaceRollbackNote(workspaceRollback),
                runTimeoutSeconds,
                thread,
                taskTruncated,
                "failed",
                "inspect_error",
                dispatchResultSnapshot?.BackendSessionId,
                dispatchResultSnapshot?.ThreadBindingKey,
                commandPriority
            );
        }
    }

    private AgentSpawnWorkspaceBaseline? TryCaptureWorkspaceRollbackBaseline(string runId, string childSessionKey)
    {
        if (_workspaceRollbackPolicy == null || !_acpSessionBindingAdapter.UsesCommandDispatch())
        {
            return null;
        }

        try
        {
            var baseline = _workspaceRollbackPolicy.CaptureBaseline();
            _ = _conversationStore.AppendMessage(
                childSessionKey,
                "system",
                $"agent_spawn_workspace_rollback.baseline runId={runId} scanned={baseline.ScannedFiles} skipped={baseline.SkippedFiles} partial={(baseline.Partial ? "true" : "false")}",
                "sessions_spawn_workspace_rollback_baseline"
            );
            return baseline;
        }
        catch (Exception ex)
        {
            _ = _conversationStore.AppendMessage(
                childSessionKey,
                "system",
                $"agent_spawn_workspace_rollback.baseline_failed runId={runId} error={NormalizeSingleLine(ex.Message) ?? "unknown"}",
                "sessions_spawn_workspace_rollback_failed"
            );
            return null;
        }
    }

    private GitWorktreeIsolationLease? TryPrepareWorktreeIsolation(string runId, string childSessionKey)
    {
        if (_worktreeIsolationManager == null)
        {
            return null;
        }

        var lease = _worktreeIsolationManager.Prepare(runId);
        if (!lease.Enabled)
        {
            return lease;
        }

        _ = _conversationStore.AppendMessage(
            childSessionKey,
            "system",
            $"agent_spawn_worktree status={lease.Status} ready={(lease.Ready ? "true" : "false")} path={NormalizeSingleLine(lease.WorktreePath) ?? "-"} message={NormalizeSingleLine(lease.Message) ?? "-"}",
            lease.Ready ? "sessions_spawn_worktree_ready" : "sessions_spawn_worktree_failed"
        );

        if (!lease.Ready)
        {
            throw new InvalidOperationException($"worktree isolation failed: {lease.Status}: {lease.Message}");
        }

        return lease;
    }

    private AgentSpawnWorkspaceRollbackSnapshot? TrySaveWorkspaceRollbackSnapshot(
        AgentSpawnWorkspaceBaseline? baseline,
        string runId,
        string childSessionKey,
        string? activeId
    )
    {
        if (_workspaceRollbackPolicy == null || baseline == null)
        {
            return null;
        }

        try
        {
            var rollback = _workspaceRollbackPolicy.SaveRollbackIfChanged(baseline, runId, childSessionKey);
            if (rollback == null)
            {
                return null;
            }

            _activeRunStore?.MarkWorkspaceRollback(
                activeId,
                rollback.RollbackId,
                rollback.Path,
                rollback.ChangedFiles,
                rollback.Partial,
                _utcNow()
            );
            _ = _conversationStore.AppendMessage(
                childSessionKey,
                "system",
                $"agent_spawn_workspace_rollback.ready runId={runId} rollbackId={rollback.RollbackId} files={rollback.ChangedFiles} modified={rollback.ModifiedFiles} created={rollback.CreatedFiles} deleted={rollback.DeletedFiles} partial={(rollback.Partial ? "true" : "false")} skipped={rollback.SkippedFiles}",
                "sessions_spawn_workspace_rollback_ready"
            );
            return rollback;
        }
        catch (Exception ex)
        {
            _ = _conversationStore.AppendMessage(
                childSessionKey,
                "system",
                $"agent_spawn_workspace_rollback.save_failed runId={runId} error={NormalizeSingleLine(ex.Message) ?? "unknown"}",
                "sessions_spawn_workspace_rollback_failed"
            );
            return null;
        }
    }

    private static string AppendWorkspaceRollbackNote(string note, AgentSpawnWorkspaceRollbackSnapshot? rollback)
    {
        if (rollback == null)
        {
            return note;
        }

        return note
            + $" workspace_rollback_id={rollback.RollbackId} workspace_rollback_files={rollback.ChangedFiles}"
            + $" workspace_rollback_partial={(rollback.Partial ? "true" : "false")}.";
    }

    private static string AppendWorktreeNote(string note, GitWorktreeIsolationLease? lease)
    {
        if (lease?.Ready != true || string.IsNullOrWhiteSpace(lease.WorktreePath))
        {
            return note;
        }

        return $"{note} worktree_isolation={lease.Status} worktree_path={lease.WorktreePath}.";
    }

    private static string? BuildFailureWorkspaceRollbackNote(AgentSpawnWorkspaceRollbackSnapshot? rollback)
    {
        if (rollback == null)
        {
            return null;
        }

        return $"workspace rollback snapshot available: rollback_id={rollback.RollbackId} files={rollback.ChangedFiles} partial={(rollback.Partial ? "true" : "false")}.";
    }

    private static SessionSpawnToolResult ErrorResult(
        string error,
        string runId,
        string runtime,
        string mode,
        int runTimeoutSeconds,
        bool thread,
        string followUpStatus = "none",
        string followUpAction = "fix_request"
    )
    {
        return new SessionSpawnToolResult(
            "error",
            error,
            runId,
            string.Empty,
            mode,
            runtime,
            null,
            runTimeoutSeconds,
            thread,
            false,
            followUpStatus,
            followUpAction
        );
    }

    private SessionSpawnToolResult QueueRejectedSpawn(
        string runId,
        string? existingChildSessionKey,
        string task,
        string? label,
        string runtime,
        string mode,
        int runTimeoutSeconds,
        bool thread,
        bool taskTruncated,
        int budgetTaskLength,
        string? acpModel,
        string? acpThinking,
        bool? acpLightContext,
        string? acpToolProfile,
        string? acpOutputDirectory,
        string commandPriority,
        string reason,
        string error,
        int queuedAttemptCount
    )
    {
        if (_queueStore == null)
        {
            return ErrorResult(error, runId, runtime, mode, runTimeoutSeconds, thread);
        }

        var normalizedLabel = NormalizeLabel(label);
        var childSessionKey = EnsureSpawnConversation(
            existingChildSessionKey,
            normalizedLabel,
            runtime,
            mode,
            runtime == "acp" ? "acp" : "subagent",
            runtime == "acp"
                ? new[] { "sessions_spawn", "acp", mode, "queued" }
                : new[] { "sessions_spawn", runtime, mode, "queued" },
            task,
            QueuedSpawnReply,
            "sessions_spawn_queued"
        );
        var nowUtc = _utcNow();
        var entry = new AgentSpawnQueueEntry
        {
            RunId = runId,
            ChildSessionKey = childSessionKey,
            Task = task,
            Label = normalizedLabel,
            Runtime = runtime,
            Mode = mode,
            RunTimeoutSeconds = runTimeoutSeconds,
            Thread = thread,
            TaskTruncated = taskTruncated,
            BudgetTaskLength = budgetTaskLength,
            AcpModel = acpModel,
            AcpThinking = acpThinking,
            AcpLightContext = acpLightContext,
            AcpToolProfile = acpToolProfile,
            AcpOutputDirectory = acpOutputDirectory,
            CommandPriority = commandPriority,
            Reason = reason,
            EnqueuedUtc = nowUtc,
            NextAttemptUtc = nowUtc + FileAgentSpawnQueueStore.ComputeInitialDelay(reason + " " + error, nowUtc),
            AttemptCount = Math.Max(0, queuedAttemptCount),
            LastError = error
        };
        var queueId = _queueStore.Enqueue(entry);
        if (string.IsNullOrWhiteSpace(queueId))
        {
            return ErrorResult(error, runId, runtime, mode, runTimeoutSeconds, thread);
        }

        var snapshot = _queueStore.GetSnapshot();
        _ = _conversationStore.AppendMessage(
            childSessionKey,
            "system",
            $"agent_spawn_queue.enqueued queueId={queueId} reason={NormalizeSingleLine(reason) ?? "queued"} nextAttemptUtc={entry.NextAttemptUtc:O}",
            "sessions_spawn_queue_enqueued"
        );
        _ = _conversationStore.UpdateMetadata(
            childSessionKey,
            project: null,
            category: null,
            tags: runtime == "acp"
                ? new[] { "sessions_spawn", "acp", mode, "queued" }
                : new[] { "sessions_spawn", runtime, mode, "queued" }
        );

        var note =
            $"persistent queue accepted: queue_id={queueId} reason={reason} next_attempt_utc={entry.NextAttemptUtc:O} queued_total={snapshot.Total} queued_ready={snapshot.Ready}. {BuildQueueSnapshotNote(snapshot)}";
        return new SessionSpawnToolResult(
            "accepted",
            null,
            runId,
            childSessionKey,
            mode,
            runtime,
            note,
            runTimeoutSeconds,
            thread,
            taskTruncated,
            "queued",
            "wait_for_queue",
            CommandPriority: commandPriority
        );
    }

    private string EnsureSpawnConversation(
        string? existingChildSessionKey,
        string? label,
        string runtime,
        string mode,
        string project,
        IReadOnlyList<string> tags,
        string task,
        string? placeholderReply,
        string? placeholderMeta
    )
    {
        if (!string.IsNullOrWhiteSpace(existingChildSessionKey)
            && _conversationStore.Get(existingChildSessionKey.Trim()) != null)
        {
            return existingChildSessionKey.Trim();
        }

        var created = _conversationStore.Create(
            scope: "chat",
            mode: "single",
            title: string.IsNullOrWhiteSpace(label)
                ? $"spawn-{runtime}-{mode}-{DateTimeOffset.UtcNow:MMdd-HHmm}"
                : label,
            project: project,
            category: mode,
            tags: tags
        );
        _ = _conversationStore.AppendMessage(
            created.Id,
            "user",
            task,
            "sessions_spawn"
        );
        if (!string.IsNullOrWhiteSpace(placeholderReply))
        {
            _ = _conversationStore.AppendMessage(
                created.Id,
                "assistant",
                placeholderReply,
                string.IsNullOrWhiteSpace(placeholderMeta) ? "sessions_spawn" : placeholderMeta
            );
        }

        return created.Id;
    }

    private static bool CanQueueRejectedSpawn(string? reason, string? error)
    {
        var normalized = $"{reason ?? string.Empty} {error ?? string.Empty}".Trim().ToLowerInvariant();
        if (normalized.Length == 0)
        {
            return false;
        }

        return normalized.Contains("concurrency", StringComparison.Ordinal)
            || normalized.Contains("token_bucket", StringComparison.Ordinal)
            || normalized.Contains("daily_cost_cap", StringComparison.Ordinal)
            || normalized.Contains("daily cost cap", StringComparison.Ordinal)
            || normalized.Contains("429", StringComparison.Ordinal)
            || normalized.Contains("retry-after", StringComparison.Ordinal)
            || normalized.Contains("rate limit", StringComparison.Ordinal);
    }

    private static string BuildBreakerClosedReply(AgentSpawnBlockedActiveRun blocked)
    {
        var killAction = ResolveBreakerKillAction(blocked.Backend);
        var recoveryAction = ResolveBreakerRecoveryAction(blocked.Backend, blocked.WorkspaceRollbackId);
        var rollbackText = string.IsNullOrWhiteSpace(blocked.WorkspaceRollbackId)
            ? "workspace_rollback_id=none"
            : $"workspace_rollback_id={blocked.WorkspaceRollbackId} workspace_rollback_files={Math.Max(0, blocked.WorkspaceRollbackChangedFiles)} workspace_rollback_partial={(blocked.WorkspaceRollbackPartial ? "true" : "false")}";
        return $"sessions_spawn breaker closed this child session. runId={blocked.RunId} backend={blocked.Backend} process_kill={killAction} recovery={recoveryAction} {rollbackText}. Further sessions_send follow-ups are disabled until an operator clears the breaker and starts a new run.";
    }

    private static string ResolveBreakerKillAction(string? backend)
    {
        var normalized = (backend ?? string.Empty).Trim().ToLowerInvariant();
        if (normalized.Contains("codex", StringComparison.Ordinal)
            || normalized.Contains("command", StringComparison.Ordinal)
            || normalized.Contains("exec", StringComparison.Ordinal))
        {
            return "handled_by_command_adapter";
        }

        if (normalized is "staged" or "fake" or "subagent" or "acp_dispatch")
        {
            return "not_applicable_no_process";
        }

        return "unknown_manual_check_required";
    }

    private static string ResolveBreakerRecoveryAction(string? backend, string? workspaceRollbackId = null)
    {
        if (!string.IsNullOrWhiteSpace(workspaceRollbackId))
        {
            return "restore_workspace_rollback_snapshot";
        }

        var normalized = (backend ?? string.Empty).Trim().ToLowerInvariant();
        if (normalized.Contains("codex", StringComparison.Ordinal)
            || normalized.Contains("command", StringComparison.Ordinal)
            || normalized.Contains("exec", StringComparison.Ordinal))
        {
            return "review_transcript_and_restore_workspace_if_needed";
        }

        if (normalized is "staged" or "fake" or "subagent" or "acp_dispatch")
        {
            return "no_workspace_rollback_expected_close_transcript";
        }

        return "manual_recovery_required";
    }

    private static string BuildQueueSnapshotNote(AgentSpawnQueueSnapshot snapshot)
    {
        var parts = new List<string>
        {
            $"queue_observed: pending={snapshot.Total}",
            $"ready={snapshot.Ready}",
            $"near_dead_letter={snapshot.NearDeadLetterCount}"
        };
        if (snapshot.NextAttemptUtc.HasValue)
        {
            parts.Add($"next_attempt_utc={snapshot.NextAttemptUtc.Value:O}");
        }

        var nextReason = NormalizeSingleLine(snapshot.NextReason);
        if (!string.IsNullOrWhiteSpace(nextReason))
        {
            parts.Add($"oldest_reason={nextReason}");
        }

        var nextError = NormalizeSingleLine(snapshot.NextError);
        if (!string.IsNullOrWhiteSpace(nextError))
        {
            parts.Add($"latest_error={nextError}");
        }

        return string.Join(" ", parts) + ".";
    }

    private static string NormalizeRuntime(string? runtime)
    {
        var normalized = (runtime ?? string.Empty).Trim().ToLowerInvariant();
        return normalized == "acp" ? "acp" : "subagent";
    }

    private static string ResolveMode(string? mode, bool threadRequested)
    {
        var normalized = (mode ?? string.Empty).Trim().ToLowerInvariant();
        if (normalized is "run" or "session")
        {
            return normalized;
        }

        return threadRequested ? "session" : "run";
    }

    internal static string ResolveCommandPriority(string? priority, string runtime, string mode)
    {
        var normalized = (priority ?? string.Empty).Trim().ToLowerInvariant()
            .Replace("-", string.Empty, StringComparison.Ordinal)
            .Replace("_", string.Empty, StringComparison.Ordinal);
        return normalized switch
        {
            "interactive" or "foreground" or "high" or "timesensitive" => "interactive",
            "background" or "passive" or "low" => "background",
            "normal" or "active" or "standard" => "normal",
            _ => string.Equals(runtime, "acp", StringComparison.OrdinalIgnoreCase)
                && string.Equals(mode, "run", StringComparison.OrdinalIgnoreCase)
                    ? "background"
                    : "normal"
        };
    }

    private static int ResolveRunTimeoutSeconds(int? runTimeoutSeconds, int? timeoutSeconds)
    {
        var candidate = runTimeoutSeconds ?? timeoutSeconds ?? 0;
        return Math.Clamp(candidate, 0, SessionsSpawnMaxTimeoutSeconds);
    }

    private static string? NormalizeLabel(string? label)
    {
        if (string.IsNullOrWhiteSpace(label))
        {
            return null;
        }

        var normalized = label
            .Replace('\r', ' ')
            .Replace('\n', ' ')
            .Trim();
        if (normalized.Length <= SessionsSpawnLabelMaxChars)
        {
            return normalized;
        }

        return normalized[..SessionsSpawnLabelMaxChars].TrimEnd();
    }

    private static string BuildAcpDispatchTraceLine(
        string runId,
        AcpSessionBindingDispatchResult dispatchResult,
        string? acpModel,
        string? acpThinking,
        bool? acpLightContext,
        string? acpToolProfile,
        string? acpOutputDirectory,
        string? commandPriority,
        GitWorktreeIsolationLease? worktreeLease = null
    )
    {
        var lines = new List<string>
        {
            $"acp.dispatch runId={runId} status={dispatchResult.Status} backend={NormalizeSingleLine(dispatchResult.Backend) ?? "unknown"} mode={NormalizeSingleLine(dispatchResult.DispatchMode) ?? "unknown"}"
        };

        if (!string.IsNullOrWhiteSpace(dispatchResult.BackendSessionId))
        {
            lines.Add($"acp.dispatch.backendSessionId={NormalizeSingleLine(dispatchResult.BackendSessionId)}");
        }

        if (!string.IsNullOrWhiteSpace(dispatchResult.ThreadBindingKey))
        {
            lines.Add($"acp.dispatch.threadBindingKey={NormalizeSingleLine(dispatchResult.ThreadBindingKey)}");
        }

        if (!string.IsNullOrWhiteSpace(acpModel))
        {
            lines.Add($"acp.option.model={NormalizeSingleLine(acpModel)}");
        }

        if (!string.IsNullOrWhiteSpace(commandPriority))
        {
            lines.Add($"acp.option.commandPriority={NormalizeSingleLine(commandPriority)}");
        }

        if (!string.IsNullOrWhiteSpace(acpThinking))
        {
            lines.Add($"acp.option.thinking={NormalizeSingleLine(acpThinking)}");
        }

        if (acpLightContext.HasValue)
        {
            lines.Add($"acp.option.lightContext={(acpLightContext.Value ? "true" : "false")}");
        }

        if (!string.IsNullOrWhiteSpace(acpToolProfile))
        {
            lines.Add($"acp.option.toolProfile={NormalizeSingleLine(acpToolProfile)}");
        }

        if (!string.IsNullOrWhiteSpace(acpOutputDirectory))
        {
            lines.Add($"acp.option.outputDirectory={NormalizeSingleLine(acpOutputDirectory)}");
        }

        if (worktreeLease?.Ready == true)
        {
            lines.Add($"acp.option.workspaceDirectory={NormalizeSingleLine(worktreeLease.WorktreePath)}");
            lines.Add($"acp.worktree.status={NormalizeSingleLine(worktreeLease.Status)}");
        }

        if (!string.IsNullOrWhiteSpace(dispatchResult.Message))
        {
            lines.Add($"acp.dispatch.message={NormalizeSingleLine(dispatchResult.Message)}");
        }

        if (!string.IsNullOrWhiteSpace(dispatchResult.Error))
        {
            lines.Add($"acp.dispatch.error={NormalizeSingleLine(dispatchResult.Error)}");
        }

        return string.Join("\n", lines);
    }

    private static string? NormalizeSingleLine(string? value)
    {
        var normalized = (value ?? string.Empty)
            .Replace('\r', ' ')
            .Replace('\n', ' ')
            .Trim();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return null;
        }

        if (normalized.Length <= 240)
        {
            return normalized;
        }

        return normalized[..240].TrimEnd() + "...";
    }

    private static string AppendBudgetNote(string note, AgentSpawnBudgetDecision decision)
    {
        var budgetNote = string.IsNullOrWhiteSpace(decision.Note)
            ? $"spawn budget: cost_class={decision.CostClass}."
            : $"{decision.Note} cost_class={decision.CostClass}.";
        return $"{note} {budgetNote}";
    }

    private static string AppendAdmissionNote(string note, AgentSpawnAdmissionDecision decision)
    {
        if (string.IsNullOrWhiteSpace(decision.Note))
        {
            return $"{note} spawn admission: token_bucket_remaining={decision.RemainingTokens} active_spawns={decision.ActiveSpawns} estimated_tokens={decision.EstimatedTokens}.";
        }

        return $"{note} {decision.Note}";
    }

    private static string AppendDailyCostNote(string note, AgentSpawnDailyCostDecision decision)
    {
        if (string.IsNullOrWhiteSpace(decision.Note))
        {
            return $"{note} spawn cost: daily_spent={decision.SpentTokens} daily_remaining={decision.RemainingTokens} daily_cap={decision.DailyCapTokens} estimated_tokens={decision.EstimatedTokens}.";
        }

        return $"{note} {decision.Note}";
    }

    private static string BuildAcpAcceptedNote(
        string baseNote,
        AgentSpawnBudgetDecision budgetDecision,
        AgentSpawnAdmissionDecision admissionDecision,
        AgentSpawnDailyCostDecision dailyCostDecision,
        AcpSessionBindingDispatchResult dispatchResult
    )
    {
        var note = AppendAdmissionNote(
            AppendDailyCostNote(AppendBudgetNote(baseNote, budgetDecision), dailyCostDecision),
            admissionDecision
        );
        if (!string.Equals(dispatchResult.DispatchMode, "command_fallback_staged", StringComparison.OrdinalIgnoreCase))
        {
            return note;
        }

        return $"{note} acp fallback: command dispatch unavailable, staged queue receipt recorded.";
    }
}
