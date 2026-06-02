using System.Net.WebSockets;
using System.Text.Json;

namespace Omnux.Middleware;

internal sealed class WsRoutineCommandDispatcher
{
    private readonly IRoutineApplicationService _routineService;

    public WsRoutineCommandDispatcher(IRoutineApplicationService routineService)
    {
        _routineService = routineService;
    }

    public async Task<bool> TryHandleAsync(
        WebSocketGateway.ClientMessage message,
        WebSocket socket,
        SemaphoreSlim sendLock,
        CancellationToken cancellationToken
    )
    {
        if (message.Type == "get_routines")
        {
            await SendRoutinesAsync(socket, sendLock, cancellationToken);
            return true;
        }

        if (message.Type == "preview_routine")
        {
            var preview = _routineService.PreviewRoutine(
                message.Text ?? string.Empty,
                message.ExecutionMode,
                message.ScheduleSourceMode,
                message.ScheduleKind,
                message.ScheduleTime,
                message.Weekdays,
                message.DayOfMonth,
                message.TimezoneId
            );
            await WebSocketGateway.SendTextAsync(socket, sendLock, BuildRoutinePreviewJson(preview), cancellationToken);
            return true;
        }

        if (message.Type == "get_routine_scheduler_status")
        {
            var status = _routineService.GetRoutineSchedulerStatus();
            await WebSocketGateway.SendTextAsync(socket, sendLock, BuildRoutineSchedulerStatusJson(status), cancellationToken);
            return true;
        }

        if (message.Type == "create_routine")
        {
            if (string.IsNullOrWhiteSpace(message.Text))
            {
                await WebSocketGateway.SendTextAsync(socket, sendLock, "{\"type\":\"error\",\"message\":\"routine request is required\"}", cancellationToken);
                return true;
            }

            var result = await _routineService.CreateRoutineAsync(
                message.Text.Trim(),
                message.Title,
                message.ExecutionMode,
                message.AgentProvider,
                message.AgentModel,
                message.AgentStartUrl,
                message.AgentTimeoutSeconds,
                message.AgentToolProfile,
                message.AgentUsePlaywright,
                message.ScheduleSourceMode,
                message.MaxRetries,
                message.RetryDelaySeconds,
                message.NotifyPolicy,
                message.NotifyTelegram,
                message.ScheduleKind,
                message.ScheduleTime,
                message.Weekdays,
                message.DayOfMonth,
                message.TimezoneId,
                message.RunImmediately ?? true,
                "web",
                cancellationToken,
                update => _ = SendRoutineProgressAsync(socket, sendLock, update, cancellationToken)
            );
            await SendRoutineActionResultAsync(socket, sendLock, result, cancellationToken);
            await SendRoutinesAsync(socket, sendLock, cancellationToken);
            return true;
        }

        if (message.Type == "update_routine")
        {
            if (string.IsNullOrWhiteSpace(message.RoutineId))
            {
                await WebSocketGateway.SendTextAsync(socket, sendLock, "{\"type\":\"error\",\"message\":\"routineId is required\"}", cancellationToken);
                return true;
            }

            if (string.IsNullOrWhiteSpace(message.Text))
            {
                await WebSocketGateway.SendTextAsync(socket, sendLock, "{\"type\":\"error\",\"message\":\"routine request is required\"}", cancellationToken);
                return true;
            }

            var result = await _routineService.UpdateRoutineAsync(
                message.RoutineId.Trim(),
                message.Text.Trim(),
                message.Title,
                message.ExecutionMode,
                message.AgentProvider,
                message.AgentModel,
                message.AgentStartUrl,
                message.AgentTimeoutSeconds,
                message.AgentToolProfile,
                message.AgentUsePlaywright,
                message.ScheduleSourceMode,
                message.MaxRetries,
                message.RetryDelaySeconds,
                message.NotifyPolicy,
                message.NotifyTelegram,
                message.ScheduleKind,
                message.ScheduleTime,
                message.Weekdays,
                message.DayOfMonth,
                message.TimezoneId,
                cancellationToken
            );
            await SendRoutineActionResultAsync(socket, sendLock, result, cancellationToken);
            await SendRoutinesAsync(socket, sendLock, cancellationToken);
            return true;
        }

        if (message.Type == "run_routine")
        {
            if (string.IsNullOrWhiteSpace(message.RoutineId))
            {
                await WebSocketGateway.SendTextAsync(socket, sendLock, "{\"type\":\"error\",\"message\":\"routineId is required\"}", cancellationToken);
                return true;
            }

            var result = await _routineService.RunRoutineNowAsync(message.RoutineId.Trim(), "web", cancellationToken);
            await SendRoutineActionResultAsync(socket, sendLock, result, cancellationToken);
            await SendRoutinesAsync(socket, sendLock, cancellationToken);
            return true;
        }

        if (message.Type == "test_routine_telegram")
        {
            if (string.IsNullOrWhiteSpace(message.RoutineId))
            {
                await WebSocketGateway.SendTextAsync(socket, sendLock, "{\"type\":\"error\",\"message\":\"routineId is required\"}", cancellationToken);
                return true;
            }

            var result = await _routineService.RunRoutineNowAsync(message.RoutineId.Trim(), "telegram_test", cancellationToken);
            await SendRoutineActionResultAsync(socket, sendLock, result, cancellationToken);
            await SendRoutinesAsync(socket, sendLock, cancellationToken);
            return true;
        }

        if (message.Type == "test_browser_agent_routine")
        {
            if (string.IsNullOrWhiteSpace(message.RoutineId))
            {
                await WebSocketGateway.SendTextAsync(socket, sendLock, "{\"type\":\"error\",\"message\":\"routineId is required\"}", cancellationToken);
                return true;
            }

            var result = await _routineService.RunRoutineNowAsync(message.RoutineId.Trim(), "browser_agent_test", cancellationToken);
            await SendRoutineActionResultAsync(socket, sendLock, result, cancellationToken);
            await SendRoutinesAsync(socket, sendLock, cancellationToken);
            return true;
        }

        if (message.Type == "get_routine_run_detail")
        {
            if (string.IsNullOrWhiteSpace(message.RoutineId) || !message.Timestamp.HasValue)
            {
                await WebSocketGateway.SendTextAsync(socket, sendLock, "{\"type\":\"error\",\"message\":\"routineId and ts are required\"}", cancellationToken);
                return true;
            }

            var detail = _routineService.GetRoutineRunDetail(message.RoutineId.Trim(), message.Timestamp.Value);
            await SendRoutineRunDetailAsync(socket, sendLock, detail, cancellationToken);
            return true;
        }

        if (message.Type == "resend_routine_run_telegram")
        {
            if (string.IsNullOrWhiteSpace(message.RoutineId) || !message.Timestamp.HasValue)
            {
                await WebSocketGateway.SendTextAsync(socket, sendLock, "{\"type\":\"error\",\"message\":\"routineId and ts are required\"}", cancellationToken);
                return true;
            }

            var result = await _routineService.ResendRoutineRunToTelegramAsync(
                message.RoutineId.Trim(),
                message.Timestamp.Value,
                cancellationToken
            );
            await SendRoutineActionResultAsync(socket, sendLock, result, cancellationToken);
            await SendRoutinesAsync(socket, sendLock, cancellationToken);
            return true;
        }

        if (message.Type == "toggle_routine")
        {
            if (string.IsNullOrWhiteSpace(message.RoutineId))
            {
                await WebSocketGateway.SendTextAsync(socket, sendLock, "{\"type\":\"error\",\"message\":\"routineId is required\"}", cancellationToken);
                return true;
            }

            if (message.Enabled == null)
            {
                await WebSocketGateway.SendTextAsync(socket, sendLock, "{\"type\":\"error\",\"message\":\"enabled is required\"}", cancellationToken);
                return true;
            }

            var result = _routineService.SetRoutineEnabled(message.RoutineId.Trim(), message.Enabled.Value);
            await SendRoutineActionResultAsync(socket, sendLock, result, cancellationToken);
            await SendRoutinesAsync(socket, sendLock, cancellationToken);
            return true;
        }

        if (message.Type == "delete_routine")
        {
            if (string.IsNullOrWhiteSpace(message.RoutineId))
            {
                await WebSocketGateway.SendTextAsync(socket, sendLock, "{\"type\":\"error\",\"message\":\"routineId is required\"}", cancellationToken);
                return true;
            }

            var result = _routineService.DeleteRoutine(message.RoutineId.Trim());
            await SendRoutineActionResultAsync(socket, sendLock, result, cancellationToken);
            await SendRoutinesAsync(socket, sendLock, cancellationToken);
            return true;
        }

        return false;
    }

        private async Task SendRoutinesAsync(WebSocket socket, SemaphoreSlim sendLock, CancellationToken cancellationToken)
    {
        var items = _routineService.ListRoutines();
        var response = new RoutinesStateWsResponse("routines_state", items);
        var json = JsonSerializer.Serialize(response, WsRoutineJsonContext.Default.RoutinesStateWsResponse);
        await WebSocketGateway.SendTextAsync(socket, sendLock, json, cancellationToken);
    }

    private async Task SendRoutineActionResultAsync(WebSocket socket, SemaphoreSlim sendLock, RoutineActionResult result, CancellationToken cancellationToken)
    {
        var response = new RoutineActionResultWsResponse("routine_result", result.Ok, result.Message, result.Routine);
        var json = JsonSerializer.Serialize(response, WsRoutineJsonContext.Default.RoutineActionResultWsResponse);
        await WebSocketGateway.SendTextAsync(socket, sendLock, json, cancellationToken);
    }

    private async Task SendRoutineProgressAsync(WebSocket socket, SemaphoreSlim sendLock, RoutineProgressUpdate update, CancellationToken cancellationToken)
    {
        var response = new RoutineProgressWsResponse(
            "routine_progress",
            update.Operation,
            update.Message,
            update.Percent,
            update.Done,
            update.Ok,
            update.StageKey,
            update.StageTitle,
            update.StageDetail,
            update.StageIndex
        );
        var json = JsonSerializer.Serialize(response, WsRoutineJsonContext.Default.RoutineProgressWsResponse);
        await WebSocketGateway.SendTextAsync(socket, sendLock, json, cancellationToken);
    }

    private async Task SendRoutineRunDetailAsync(WebSocket socket, SemaphoreSlim sendLock, RoutineRunDetailResult result, CancellationToken cancellationToken)
    {
        var response = new RoutineRunDetailWsResponse(
            "routine_run_detail",
            result.Ok,
            result.RoutineId,
            result.Ts,
            DateTimeOffset.FromUnixTimeMilliseconds(result.Ts).ToLocalTime().ToString("yyyy-MM-dd HH:mm:ss"),
            result.Title,
            result.Status,
            result.Source,
            result.AttemptCount,
            result.TelegramStatus,
            result.ArtifactPath,
            result.AgentSessionId,
            result.AgentRunId,
            result.AgentProvider,
            result.AgentModel,
            result.ToolProfile,
            result.StartUrl,
            result.FinalUrl,
            result.PageTitle,
            result.ScreenshotPath,
            result.DownloadPaths ?? Array.Empty<string>(),
            result.Error,
            result.Content
        );
        var json = JsonSerializer.Serialize(response, WsRoutineJsonContext.Default.RoutineRunDetailWsResponse);
        await WebSocketGateway.SendTextAsync(socket, sendLock, json, cancellationToken);
    }

    private static string BuildRoutinePreviewJson(RoutineExecutionPreviewResult preview)
    {
        var response = new RoutineExecutionPreviewWsResponse(
            "routine_preview",
            preview.Request,
            preview.ScheduleSourceMode,
            preview.ScheduleText,
            preview.ScheduleKind,
            preview.TimezoneId,
            preview.ResolvedExecutionMode,
            preview.ExecutionRoute,
            preview.Warnings
        );
        return JsonSerializer.Serialize(response, WsRoutineJsonContext.Default.RoutineExecutionPreviewWsResponse);
    }

    private static string BuildRoutineSchedulerStatusJson(RoutineSchedulerStatus status)
    {
        var response = new RoutineSchedulerStatusWsResponse(
            "routine_scheduler_status",
            status.Enabled,
            status.TotalRoutines,
            status.EnabledRoutines,
            status.RunningRoutines,
            status.DueRoutines,
            status.NextRunAtMs,
            status.LastError
        );
        return JsonSerializer.Serialize(response, WsRoutineJsonContext.Default.RoutineSchedulerStatusWsResponse);
    }
}
