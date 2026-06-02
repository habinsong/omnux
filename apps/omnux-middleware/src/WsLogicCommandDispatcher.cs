using System.Net.WebSockets;

namespace Omnux.Middleware;

internal sealed class WsLogicCommandDispatcher
{

    private readonly ILogicApplicationService _logicService;

    public WsLogicCommandDispatcher(
        ILogicApplicationService logicService
    )
    {
        _logicService = logicService;
    }

    public async Task<bool> TryHandleAsync(
        WebSocketGateway.ClientMessage message,
        bool remoteDashboardClient,
        WebSocket socket,
        SemaphoreSlim sendLock,
        CancellationToken cancellationToken
    )
    {
        if (message.Type == "logic_graph_list")
        {
            await SendLogicGraphListResultAsync(
                socket,
                sendLock,
                _logicService.ListLogicGraphs(),
                cancellationToken
            );
            return true;
        }

        if (message.Type == "logic_graph_get")
        {
            if (string.IsNullOrWhiteSpace(message.GraphId))
            {
                await WebSocketGateway.SendTextAsync(socket, sendLock, "{\"type\":\"error\",\"message\":\"graphId가 필요합니다.\"}", cancellationToken);
                return true;
            }

            await SendLogicGraphActionResultAsync(
                socket,
                sendLock,
                _logicService.GetLogicGraph(message.GraphId.Trim()),
                cancellationToken
            );
            return true;
        }

        if (message.Type == "logic_path_list")
        {
            var scope = string.IsNullOrWhiteSpace(message.Scope)
                ? "workspace"
                : message.Scope.Trim();
            var result = _logicService.BrowseLogicPath(scope, message.Target, message.FilePath);
            await SendLogicPathBrowseResultAsync(socket, sendLock, result, cancellationToken);
            return true;
        }

        if (message.Type == "logic_graph_save")
        {
            if (string.IsNullOrWhiteSpace(message.LogicGraphJson))
            {
                await WebSocketGateway.SendTextAsync(socket, sendLock, "{\"type\":\"error\",\"message\":\"logicGraph is required\"}", cancellationToken);
                return true;
            }

            var result = await _logicService.SaveLogicGraphAsync(
                message.GraphId,
                message.LogicGraphJson,
                "web",
                cancellationToken
            );
            await SendLogicGraphActionResultAsync(socket, sendLock, result, cancellationToken);
            await SendLogicGraphListResultAsync(socket, sendLock, _logicService.ListLogicGraphs(), cancellationToken);
            return true;
        }

        if (message.Type == "logic_graph_delete")
        {
            if (string.IsNullOrWhiteSpace(message.GraphId))
            {
                await WebSocketGateway.SendTextAsync(socket, sendLock, "{\"type\":\"error\",\"message\":\"graphId가 필요합니다.\"}", cancellationToken);
                return true;
            }

            var result = _logicService.DeleteLogicGraph(message.GraphId.Trim());
            await SendLogicGraphActionResultAsync(socket, sendLock, result, cancellationToken);
            await SendLogicGraphListResultAsync(socket, sendLock, _logicService.ListLogicGraphs(), cancellationToken);
            return true;
        }

        if (message.Type == "logic_graph_run")
        {
            var targetGraphId = message.GraphId?.Trim() ?? string.Empty;
            if (!string.IsNullOrWhiteSpace(message.LogicGraphJson))
            {
                var saveResult = await _logicService.SaveLogicGraphAsync(
                    targetGraphId,
                    message.LogicGraphJson,
                    "web",
                    cancellationToken
                );
                await SendLogicGraphActionResultAsync(socket, sendLock, saveResult, cancellationToken);
                await SendLogicGraphListResultAsync(socket, sendLock, _logicService.ListLogicGraphs(), cancellationToken);
                if (!saveResult.Ok)
                {
                    return true;
                }

                targetGraphId = saveResult.Summary?.GraphId
                    ?? saveResult.Graph?.GraphId
                    ?? targetGraphId;
            }

            if (string.IsNullOrWhiteSpace(targetGraphId))
            {
                await WebSocketGateway.SendTextAsync(socket, sendLock, "{\"type\":\"error\",\"message\":\"graphId가 필요합니다.\"}", cancellationToken);
                return true;
            }

            var result = await _logicService.RunLogicGraphAsync(
                targetGraphId.Trim(),
                "web",
                string.IsNullOrWhiteSpace(message.LogicRunInput) ? null : message.LogicRunInput.Trim(),
                evt => _ = SendLogicRunEventAsync(socket, sendLock, evt, cancellationToken),
                cancellationToken
            );
            await SendLogicRunActionResultAsync(socket, sendLock, result, cancellationToken);
            await SendLogicGraphListResultAsync(socket, sendLock, _logicService.ListLogicGraphs(), cancellationToken);
            return true;
        }

        if (message.Type == "logic_graph_cancel")
        {
            if (string.IsNullOrWhiteSpace(message.LogicRunId))
            {
                await WebSocketGateway.SendTextAsync(socket, sendLock, "{\"type\":\"error\",\"message\":\"runId가 필요합니다.\"}", cancellationToken);
                return true;
            }

            var result = _logicService.CancelLogicGraphRun(message.LogicRunId.Trim());
            await SendLogicRunActionResultAsync(socket, sendLock, result, cancellationToken);
            return true;
        }

        if (message.Type == "logic_graph_run_get")
        {
            if (string.IsNullOrWhiteSpace(message.LogicRunId))
            {
                await WebSocketGateway.SendTextAsync(socket, sendLock, "{\"type\":\"error\",\"message\":\"runId가 필요합니다.\"}", cancellationToken);
                return true;
            }

            var snapshot = _logicService.GetLogicGraphRun(message.LogicRunId.Trim());
            var result = snapshot == null
                ? new LogicRunActionResult(false, "실행 기록을 찾을 수 없습니다.", message.LogicRunId.Trim(), null)
                : new LogicRunActionResult(true, "실행 기록을 불러왔습니다.", message.LogicRunId.Trim(), snapshot);
            await SendLogicRunActionResultAsync(socket, sendLock, result, cancellationToken);
            return true;
        }

        return false;
    }
private static Task SendLogicGraphListResultAsync(
    WebSocket socket,
    SemaphoreSlim sendLock,
    LogicGraphListResult result,
    CancellationToken cancellationToken
)
{
    return WebSocketGateway.SendTextAsync(
        socket,
        sendLock,
        "{"
        + "\"type\":\"logic_graph_list_result\","
        + $"\"items\":{LogicGraphJson.Serialize(result.Items)}"
        + "}",
        cancellationToken
    );
}

private static Task SendLogicGraphActionResultAsync(
    WebSocket socket,
    SemaphoreSlim sendLock,
    LogicGraphActionResult result,
    CancellationToken cancellationToken
)
{
    return WebSocketGateway.SendTextAsync(
        socket,
        sendLock,
        "{"
        + "\"type\":\"logic_graph_result\","
        + $"\"ok\":{(result.Ok ? "true" : "false")},"
        + $"\"message\":\"{WebSocketGateway.EscapeJson(result.Message)}\","
        + $"\"summary\":{(result.Summary == null ? "null" : LogicGraphJson.Serialize(result.Summary))},"
        + $"\"graph\":{(result.Graph == null ? "null" : LogicGraphJson.Serialize(result.Graph))}"
        + "}",
        cancellationToken
    );
}

private static Task SendLogicPathBrowseResultAsync(
    WebSocket socket,
    SemaphoreSlim sendLock,
    LogicPathBrowseResult result,
    CancellationToken cancellationToken
)
{
    return WebSocketGateway.SendTextAsync(
        socket,
        sendLock,
        "{"
        + "\"type\":\"logic_path_list_result\","
        + $"\"ok\":{(result.Ok ? "true" : "false")},"
        + $"\"message\":\"{WebSocketGateway.EscapeJson(result.Message)}\","
        + $"\"scope\":\"{WebSocketGateway.EscapeJson(result.Scope)}\","
        + $"\"rootKey\":\"{WebSocketGateway.EscapeJson(result.RootKey)}\","
        + $"\"rootLabel\":\"{WebSocketGateway.EscapeJson(result.RootLabel)}\","
        + $"\"displayPath\":\"{WebSocketGateway.EscapeJson(result.DisplayPath)}\","
        + $"\"browsePath\":\"{WebSocketGateway.EscapeJson(result.BrowsePath)}\","
        + $"\"parentBrowsePath\":{WebSocketGateway.ToJsonStringOrNull(result.ParentBrowsePath)},"
        + $"\"directorySelectPath\":{WebSocketGateway.ToJsonStringOrNull(result.DirectorySelectPath)},"
        + $"\"roots\":{LogicGraphJson.Serialize(result.Roots)},"
        + $"\"items\":{LogicGraphJson.Serialize(result.Items)}"
        + "}",
        cancellationToken
    );
}

private static Task SendLogicRunActionResultAsync(
    WebSocket socket,
    SemaphoreSlim sendLock,
    LogicRunActionResult result,
    CancellationToken cancellationToken
)
{
    return WebSocketGateway.SendTextAsync(
        socket,
        sendLock,
        "{"
        + "\"type\":\"logic_graph_run_result\","
        + $"\"ok\":{(result.Ok ? "true" : "false")},"
        + $"\"message\":\"{WebSocketGateway.EscapeJson(result.Message)}\","
        + $"\"runId\":{WebSocketGateway.ToJsonStringOrNull(result.RunId)},"
        + $"\"snapshot\":{(result.Snapshot == null ? "null" : LogicGraphJson.Serialize(result.Snapshot))}"
        + "}",
        cancellationToken
    );
}

private static Task SendLogicRunEventAsync(
    WebSocket socket,
    SemaphoreSlim sendLock,
    LogicRunEvent result,
    CancellationToken cancellationToken
)
{
    return WebSocketGateway.SendTextAsync(
        socket,
        sendLock,
        "{"
        + "\"type\":\"logic_graph_run_event\","
        + $"\"runId\":\"{WebSocketGateway.EscapeJson(result.RunId)}\","
        + $"\"graphId\":\"{WebSocketGateway.EscapeJson(result.GraphId)}\","
        + $"\"kind\":\"{WebSocketGateway.EscapeJson(result.Kind)}\","
        + $"\"message\":\"{WebSocketGateway.EscapeJson(result.Message)}\","
        + $"\"nodeId\":{WebSocketGateway.ToJsonStringOrNull(result.NodeId)},"
        + $"\"snapshot\":{LogicGraphJson.Serialize(result.Snapshot)}"
        + "}",
        cancellationToken
    );
}

}
