using System.Net.WebSockets;
using System.Text.Json;

namespace Omnux.Middleware;

internal sealed class WsProjectCommandDispatcher
{
    private readonly IProjectApplicationService _projectService;
    private readonly ICodingProjectChangeService _codingChanges;

    public WsProjectCommandDispatcher(IProjectApplicationService projectService, ICodingProjectChangeService codingChanges)
    {
        _projectService = projectService;
        _codingChanges = codingChanges;
    }

    public async Task<bool> TryHandleAsync(
        WebSocketGateway.ClientMessage message,
        WebSocket socket,
        SemaphoreSlim sendLock,
        CancellationToken cancellationToken
    )
    {
        try { return await HandleAsync(message, socket, sendLock, cancellationToken); }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException)
        {
            await WebSocketGateway.SendTextAsync(socket, sendLock,
                "{\"type\":\"error\",\"requestId\":\"" + WebSocketGateway.EscapeJson(message.RequestId ?? "")
                + "\",\"requestType\":\"" + WebSocketGateway.EscapeJson(message.Type ?? "")
                + "\",\"message\":\"프로젝트 정보를 처리하지 못했습니다. " + WebSocketGateway.EscapeJson(error.Message) + "\"}", cancellationToken);
            return true;
        }
    }

    private async Task<bool> HandleAsync(WebSocketGateway.ClientMessage message, WebSocket socket, SemaphoreSlim sendLock, CancellationToken cancellationToken)
    {
        if (message.Type == "project_folders_list")
        {
            var result = _projectService.BrowseFolders(message.FilePath, message.Search);
            var payload = JsonSerializer.Serialize(result, ProjectJsonContext.Default.ProjectFolderSnapshot);
            await WebSocketGateway.SendTextAsync(socket, sendLock,
                $"{{\"type\":\"project_folders_result\",\"requestId\":\"{WebSocketGateway.EscapeJson(message.RequestId ?? "")}\",\"payload\":{payload}}}", cancellationToken);
            return true;
        }
        if (message.Type is "project_build_preview" or "project_build_apply")
        {
            var result = message.Type == "project_build_preview"
                ? await _codingChanges.PreviewAsync(message.ConversationId ?? "", message.Target ?? "main", cancellationToken)
                : await _codingChanges.ApplyAsync(message.PreviewId ?? "", cancellationToken);
            var payload = JsonSerializer.Serialize(result, ProjectChangeJsonContext.Default.ProjectChangeResponse);
            await WebSocketGateway.SendTextAsync(socket, sendLock,
                $"{{\"type\":\"{message.Type}_result\",\"requestId\":\"{WebSocketGateway.EscapeJson(message.RequestId ?? "")}\",\"payload\":{payload}}}", cancellationToken);
            return true;
        }

        if (message.Type == "projects_list")
        {
            await SendProjectsStateAsync(socket, sendLock, _projectService.ListProjects(), cancellationToken, message.RequestId);
            return true;
        }

        if (message.Type == "project_create")
        {
            var result = _projectService.CreateProject(
                message.Title ?? message.Project,
                message.FilePath,
                message.Message,
                message.Category
            );
            await SendProjectResultAsync(socket, sendLock, "create", result, cancellationToken, message.RequestId);
            await SendProjectsStateAsync(socket, sendLock, result.Items, cancellationToken, message.RequestId);
            return true;
        }

        if (message.Type == "project_update")
        {
            var result = _projectService.UpdateProject(
                message.ProjectKey,
                message.Title ?? message.Project,
                message.FilePath,
                message.Message,
                message.Category,
                message.Enabled == true ? true : null
            );
            await SendProjectResultAsync(socket, sendLock, "update", result, cancellationToken, message.RequestId);
            await SendProjectsStateAsync(socket, sendLock, result.Items, cancellationToken, message.RequestId);
            return true;
        }

        if (message.Type == "project_delete")
        {
            var result = _projectService.DeleteProject(
                message.ProjectKey,
                message.Project ?? message.Title,
                message.FilePath
            );
            await SendProjectResultAsync(socket, sendLock, "delete", result, cancellationToken, message.RequestId);
            await SendProjectsStateAsync(socket, sendLock, result.Items, cancellationToken, message.RequestId);
            return true;
        }

        if (message.Type == "project_touch")
        {
            var result = _projectService.TouchProject(
                message.ProjectKey,
                message.Project ?? message.Title,
                message.FilePath
            );
            await SendProjectResultAsync(socket, sendLock, "touch", result, cancellationToken, message.RequestId);
            await SendProjectsStateAsync(socket, sendLock, result.Items, cancellationToken, message.RequestId);
            return true;
        }

        return false;
    }

    private static Task SendProjectsStateAsync(
        WebSocket socket,
        SemaphoreSlim sendLock,
        IReadOnlyList<ProjectItem> items,
        CancellationToken cancellationToken,
        string? requestId
    )
    {
        var json = JsonSerializer.Serialize(items.ToArray(), ProjectJsonContext.Default.ProjectItemArray);
        return WebSocketGateway.SendTextAsync(
            socket,
            sendLock,
            "{"
            + "\"type\":\"projects_state\","
            + $"\"requestId\":\"{WebSocketGateway.EscapeJson(requestId ?? string.Empty)}\","
            + $"\"items\":{json}"
            + "}",
            cancellationToken
        );
    }

    private static Task SendProjectResultAsync(
        WebSocket socket,
        SemaphoreSlim sendLock,
        string action,
        ProjectActionResult result,
        CancellationToken cancellationToken,
        string? requestId
    )
    {
        var itemJson = result.Item == null
            ? "null"
            : JsonSerializer.Serialize(result.Item, ProjectJsonContext.Default.ProjectItem);
        return WebSocketGateway.SendTextAsync(
            socket,
            sendLock,
            "{"
            + "\"type\":\"project_result\","
            + $"\"requestId\":\"{WebSocketGateway.EscapeJson(requestId ?? string.Empty)}\","
            + $"\"action\":\"{WebSocketGateway.EscapeJson(action)}\","
            + $"\"ok\":{(result.Ok ? "true" : "false")},"
            + $"\"message\":\"{WebSocketGateway.EscapeJson(result.Message)}\","
            + $"\"item\":{itemJson}"
            + "}",
            cancellationToken
        );
    }
}
