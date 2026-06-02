namespace Omnux.Middleware;

public sealed partial class CommandService
{
    public TaskGraphActionResult CreateTaskGraph(string planId)
        => _taskGraphAppService.CreateTaskGraph(planId);

    public TaskGraphActionResult UpdateTaskGraph(string graphId, string? rawJson)
        => _taskGraphAppService.UpdateTaskGraph(graphId, rawJson);

    public TaskGraphListResult ListTaskGraphs()
        => _taskGraphAppService.ListTaskGraphs();

    public TaskGraphSnapshot? GetTaskGraph(string graphId)
        => _taskGraphAppService.GetTaskGraph(graphId);

    public Task<TaskGraphActionResult> RunTaskGraphAsync(
        string graphId,
        string source,
        TaskGraphEventSink? eventSink,
        CancellationToken cancellationToken
    ) => _taskGraphAppService.RunTaskGraphAsync(graphId, source, eventSink, cancellationToken);

    public TaskGraphActionResult CancelTask(string graphId, string taskId)
        => _taskGraphAppService.CancelTask(graphId, taskId);

    public Task<TaskGraphActionResult> RetryTaskAsync(
        string graphId,
        string taskId,
        string source,
        TaskGraphEventSink? eventSink,
        CancellationToken cancellationToken
    ) => _taskGraphAppService.RetryTaskAsync(graphId, taskId, source, eventSink, cancellationToken);

    public Task<TaskGraphActionResult> ResumeTaskGraphAsync(
        string graphId,
        string source,
        TaskGraphEventSink? eventSink,
        CancellationToken cancellationToken
    ) => _taskGraphAppService.ResumeTaskGraphAsync(graphId, source, eventSink, cancellationToken);

    public TaskOutputResult? GetTaskOutput(string graphId, string taskId)
        => _taskGraphAppService.GetTaskOutput(graphId, taskId);
}
