namespace Omnux.Middleware;

public sealed class TaskGraphApplicationService : ITaskGraphApplicationService
{
    private readonly TaskGraphService _taskGraphService;
    private readonly PlanService _planService;
    private readonly BackgroundTaskCoordinator _taskGraphCoordinator;

    public TaskGraphApplicationService(
        TaskGraphService taskGraphService,
        PlanService planService,
        BackgroundTaskCoordinator taskGraphCoordinator
    )
    {
        _taskGraphService = taskGraphService;
        _planService = planService;
        _taskGraphCoordinator = taskGraphCoordinator;
    }

    public TaskGraphActionResult CreateTaskGraph(string planId)
        => _taskGraphService.CreateGraphFromPlan(planId);

    public TaskGraphActionResult UpdateTaskGraph(string graphId, string? rawJson)
        => _taskGraphService.UpdateGraphFromJson(graphId, rawJson);

    public TaskGraphListResult ListTaskGraphs()
        => _taskGraphService.ListGraphs();

    public TaskGraphSnapshot? GetTaskGraph(string graphId)
        => _taskGraphService.GetGraph(graphId);

    public async Task<TaskGraphActionResult> RunTaskGraphAsync(
        string graphId,
        string source,
        TaskGraphEventSink? eventSink,
        CancellationToken cancellationToken
    )
    {
        var snapshot = _taskGraphService.GetGraph(graphId);
        if (snapshot == null)
        {
            return new TaskGraphActionResult(false, "Task graph를 찾을 수 없습니다.", null);
        }

        var blocked = ExecutionBlocker(snapshot);
        if (blocked != null) return blocked;

        return await _taskGraphCoordinator.RunGraphAsync(
            snapshot.Graph.GraphId,
            source,
            eventSink,
            cancellationToken
        );
    }

    public TaskGraphActionResult CancelTask(string graphId, string taskId)
        => _taskGraphCoordinator.CancelTask(graphId, taskId);

    public TaskGraphActionResult CancelTaskGraph(string graphId)
        => _taskGraphCoordinator.CancelGraph(graphId);

    public async Task<TaskGraphActionResult> RetryTaskAsync(
        string graphId,
        string taskId,
        string source,
        TaskGraphEventSink? eventSink,
        CancellationToken cancellationToken
    )
    {
        var snapshot = _taskGraphService.GetGraph(graphId);
        if (snapshot == null) return new TaskGraphActionResult(false, "Task graph를 찾을 수 없습니다.", null);
        var blocked = ExecutionBlocker(snapshot);
        if (blocked != null) return blocked;
        return await _taskGraphCoordinator.RetryTaskAsync(
            graphId,
            taskId,
            source,
            eventSink,
            cancellationToken
        );
    }

    public async Task<TaskGraphActionResult> ResumeTaskGraphAsync(
        string graphId,
        string source,
        TaskGraphEventSink? eventSink,
        CancellationToken cancellationToken
    )
    {
        var snapshot = _taskGraphService.GetGraph(graphId);
        if (snapshot == null)
        {
            return new TaskGraphActionResult(false, "Task graph를 찾을 수 없습니다.", null);
        }

        var blocked = ExecutionBlocker(snapshot);
        if (blocked != null) return blocked;
        return await _taskGraphCoordinator.ResumeGraphAsync(
            snapshot.Graph.GraphId,
            source,
            eventSink,
            cancellationToken
        );
    }

    private TaskGraphActionResult? ExecutionBlocker(TaskGraphSnapshot snapshot)
    {
        var sourcePlan = _planService.GetPlan(snapshot.Graph.SourcePlanId);
        if (sourcePlan != null
            && sourcePlan.Plan.Status != PlanStatus.Approved
            && sourcePlan.Plan.Status != PlanStatus.Completed
            && sourcePlan.Plan.Status != PlanStatus.Running)
        {
            return new TaskGraphActionResult(
                false,
                "Task graph 실행 전 원본 계획 승인 단계가 필요합니다.",
                snapshot
            );
        }

        return null;
    }

    public TaskOutputResult? GetTaskOutput(string graphId, string taskId)
        => _taskGraphService.GetTaskOutput(graphId, taskId);

    public TaskOutputResult? GetTaskOutput(string graphId, string taskId, long? attemptTimestamp)
        => _taskGraphService.GetTaskOutput(graphId, taskId, attemptTimestamp);
}
