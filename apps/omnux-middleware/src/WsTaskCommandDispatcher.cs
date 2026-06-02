using System.Net.WebSockets;

namespace Omnux.Middleware;

internal sealed class WsTaskCommandDispatcher
{

    private readonly ITaskGraphApplicationService _taskGraphService;

    public WsTaskCommandDispatcher(
        ITaskGraphApplicationService taskGraphService
    )
    {
        _taskGraphService = taskGraphService;
    }

    public async Task<bool> TryHandleAsync(
        WebSocketGateway.ClientMessage message,
        WebSocket socket,
        SemaphoreSlim sendLock,
        CancellationToken cancellationToken
    )
    {
        if (message.Type == "task_graph_list")
        {
            await SendTaskGraphListResultAsync(
                socket,
                sendLock,
                _taskGraphService.ListTaskGraphs(),
                cancellationToken
            );
            return true;
        }

        if (message.Type == "task_graph_create")
        {
            var result = _taskGraphService.CreateTaskGraph(message.PlanId ?? string.Empty);
            await SendTaskGraphActionResultAsync(socket, sendLock, "create", result, cancellationToken);
            return true;
        }

        if (message.Type == "task_graph_update")
        {
            var result = _taskGraphService.UpdateTaskGraph(message.GraphId ?? string.Empty, message.RawJson);
            await SendTaskGraphActionResultAsync(socket, sendLock, "update", result, cancellationToken);
            return true;
        }

        if (message.Type == "task_graph_get")
        {
            var snapshot = _taskGraphService.GetTaskGraph(message.GraphId ?? string.Empty);
            var result = snapshot == null
                ? new TaskGraphActionResult(false, "Task graph를 찾을 수 없습니다.", null)
                : new TaskGraphActionResult(true, "Task graph를 불러왔습니다.", snapshot);
            await SendTaskGraphActionResultAsync(socket, sendLock, "get", result, cancellationToken);
            return true;
        }

        if (message.Type == "task_graph_run")
        {
            var sink = new TaskGraphEventSink
            {
                OnTaskUpdatedAsync = (graphId, task, token) =>
                    SendTaskUpdatedAsync(socket, sendLock, graphId, task, token),
                OnTaskLogAsync = (graphId, taskId, line, token) =>
                    SendTaskLogAsync(socket, sendLock, graphId, taskId, line, token)
            };
            var result = await _taskGraphService.RunTaskGraphAsync(
                message.GraphId ?? string.Empty,
                "web",
                sink,
                cancellationToken
            );
            await SendTaskGraphActionResultAsync(socket, sendLock, "run", result, cancellationToken);
            return true;
        }

        if (message.Type == "task_cancel")
        {
            var result = _taskGraphService.CancelTask(
                message.GraphId ?? string.Empty,
                message.TaskId ?? string.Empty
            );
            await SendTaskGraphActionResultAsync(socket, sendLock, "cancel", result, cancellationToken);
            return true;
        }

        if (message.Type == "task_retry")
        {
            var sink = new TaskGraphEventSink
            {
                OnTaskUpdatedAsync = (graphId, task, token) =>
                    SendTaskUpdatedAsync(socket, sendLock, graphId, task, token),
                OnTaskLogAsync = (graphId, taskId, line, token) =>
                    SendTaskLogAsync(socket, sendLock, graphId, taskId, line, token)
            };
            var result = await _taskGraphService.RetryTaskAsync(
                message.GraphId ?? string.Empty,
                message.TaskId ?? string.Empty,
                "web",
                sink,
                cancellationToken
            );
            await SendTaskGraphActionResultAsync(socket, sendLock, "retry", result, cancellationToken);
            return true;
        }

        if (message.Type == "task_resume")
        {
            var sink = new TaskGraphEventSink
            {
                OnTaskUpdatedAsync = (graphId, task, token) =>
                    SendTaskUpdatedAsync(socket, sendLock, graphId, task, token),
                OnTaskLogAsync = (graphId, taskId, line, token) =>
                    SendTaskLogAsync(socket, sendLock, graphId, taskId, line, token)
            };
            var result = await _taskGraphService.ResumeTaskGraphAsync(
                message.GraphId ?? string.Empty,
                "web",
                sink,
                cancellationToken
            );
            await SendTaskGraphActionResultAsync(socket, sendLock, "resume", result, cancellationToken);
            return true;
        }

        if (message.Type == "task_output_get")
        {
            var output = _taskGraphService.GetTaskOutput(
                message.GraphId ?? string.Empty,
                message.TaskId ?? string.Empty
            );
            if (output == null)
            {
                var fallback = new TaskGraphActionResult(false, "Task output을 찾을 수 없습니다.", null);
                await SendTaskGraphActionResultAsync(socket, sendLock, "output", fallback, cancellationToken);
            }
            else
            {
                await SendTaskOutputResultAsync(socket, sendLock, output, cancellationToken);
            }

            return true;
        }

        return false;
    }
private static Task SendTaskGraphActionResultAsync(
    WebSocket socket,
    SemaphoreSlim sendLock,
    string action,
    TaskGraphActionResult result,
    CancellationToken cancellationToken
)
{
    var payload = TaskGraphJson.Serialize(result);
    return WebSocketGateway.SendTextAsync(
        socket,
        sendLock,
        "{"
        + "\"type\":\"task_graph_result\","
        + $"\"action\":\"{WebSocketGateway.EscapeJson(action)}\","
        + $"\"payload\":{payload}"
        + "}",
        cancellationToken
    );
}

private static Task SendTaskGraphListResultAsync(
    WebSocket socket,
    SemaphoreSlim sendLock,
    TaskGraphListResult result,
    CancellationToken cancellationToken
)
{
    var payload = TaskGraphJson.Serialize(result);
    return WebSocketGateway.SendTextAsync(
        socket,
        sendLock,
        "{"
        + "\"type\":\"task_graph_list_result\","
        + $"\"payload\":{payload}"
        + "}",
        cancellationToken
    );
}

private static Task SendTaskOutputResultAsync(
    WebSocket socket,
    SemaphoreSlim sendLock,
    TaskOutputResult result,
    CancellationToken cancellationToken
)
{
    var payload = TaskGraphJson.Serialize(result);
    return WebSocketGateway.SendTextAsync(
        socket,
        sendLock,
        "{"
        + "\"type\":\"task_output_result\","
        + $"\"payload\":{payload}"
        + "}",
        cancellationToken
    );
}

private static Task SendTaskUpdatedAsync(
    WebSocket socket,
    SemaphoreSlim sendLock,
    string graphId,
    TaskNode task,
    CancellationToken cancellationToken
)
{
    return WebSocketGateway.SendTextAsync(
        socket,
        sendLock,
        "{"
        + "\"type\":\"task_updated\","
        + $"\"graphId\":\"{WebSocketGateway.EscapeJson(graphId)}\","
        + $"\"task\":{TaskGraphJson.Serialize(task)}"
        + "}",
        cancellationToken
    );
}

private static Task SendTaskLogAsync(
    WebSocket socket,
    SemaphoreSlim sendLock,
    string graphId,
    string taskId,
    string line,
    CancellationToken cancellationToken
)
{
    return WebSocketGateway.SendTextAsync(
        socket,
        sendLock,
        "{"
        + "\"type\":\"task_log\","
        + $"\"graphId\":\"{WebSocketGateway.EscapeJson(graphId)}\","
        + $"\"taskId\":\"{WebSocketGateway.EscapeJson(taskId)}\","
        + $"\"line\":\"{WebSocketGateway.EscapeJson(line)}\""
        + "}",
        cancellationToken
    );
}

}
