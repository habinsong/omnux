using System.Net.WebSockets;
using System.Text.Json;

namespace Omnux.Middleware;

internal sealed class WsProjectCommandDispatcher
{
    private readonly IProjectApplicationService _projectService;

    public WsProjectCommandDispatcher(IProjectApplicationService projectService)
    {
        _projectService = projectService;
    }

    public async Task<bool> TryHandleAsync(
        WebSocketGateway.ClientMessage message,
        WebSocket socket,
        SemaphoreSlim sendLock,
        CancellationToken cancellationToken
    )
    {
        if (message.Type == "projects_list")
        {
            await SendProjectsStateAsync(socket, sendLock, _projectService.ListProjects(), cancellationToken);
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
            await SendProjectResultAsync(socket, sendLock, "create", result, cancellationToken);
            await SendProjectsStateAsync(socket, sendLock, result.Items, cancellationToken);
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
            await SendProjectResultAsync(socket, sendLock, "update", result, cancellationToken);
            await SendProjectsStateAsync(socket, sendLock, result.Items, cancellationToken);
            return true;
        }

        if (message.Type == "project_delete")
        {
            var result = _projectService.DeleteProject(
                message.ProjectKey,
                message.Project ?? message.Title,
                message.FilePath
            );
            await SendProjectResultAsync(socket, sendLock, "delete", result, cancellationToken);
            await SendProjectsStateAsync(socket, sendLock, result.Items, cancellationToken);
            return true;
        }

        if (message.Type == "project_touch")
        {
            var result = _projectService.TouchProject(
                message.ProjectKey,
                message.Project ?? message.Title,
                message.FilePath
            );
            await SendProjectResultAsync(socket, sendLock, "touch", result, cancellationToken);
            await SendProjectsStateAsync(socket, sendLock, result.Items, cancellationToken);
            return true;
        }

        return false;
    }

    private static Task SendProjectsStateAsync(
        WebSocket socket,
        SemaphoreSlim sendLock,
        IReadOnlyList<ProjectItem> items,
        CancellationToken cancellationToken
    )
    {
        var json = JsonSerializer.Serialize(items.ToArray(), ProjectJsonContext.Default.ProjectItemArray);
        return WebSocketGateway.SendTextAsync(
            socket,
            sendLock,
            "{"
            + "\"type\":\"projects_state\","
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
        CancellationToken cancellationToken
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
            + $"\"action\":\"{WebSocketGateway.EscapeJson(action)}\","
            + $"\"ok\":{(result.Ok ? "true" : "false")},"
            + $"\"message\":\"{WebSocketGateway.EscapeJson(result.Message)}\","
            + $"\"item\":{itemJson}"
            + "}",
            cancellationToken
        );
    }
}
