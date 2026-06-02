using System.Net.WebSockets;

namespace Omnux.Middleware;

internal sealed class WsPlanningCommandDispatcher
{

    private readonly IPlanningApplicationService _planService;

    public WsPlanningCommandDispatcher(
        IPlanningApplicationService planService
    )
    {
        _planService = planService;
    }

    public async Task<bool> TryHandleAsync(
        WebSocketGateway.ClientMessage message,
        WebSocket socket,
        SemaphoreSlim sendLock,
        CancellationToken cancellationToken
    )
    {
        if (message.Type == "plan_create")
        {
            var result = await _planService.CreatePlanAsync(
                message.Text ?? message.Message ?? string.Empty,
                message.Constraints,
                message.Mode,
                message.ConversationId,
                cancellationToken
            );
            await SendPlanActionResultAsync(socket, sendLock, "create", result, cancellationToken);
            return true;
        }

        if (message.Type == "plan_review")
        {
            var result = await _planService.ReviewPlanAsync(message.PlanId ?? string.Empty, cancellationToken);
            await SendPlanActionResultAsync(socket, sendLock, "review", result, cancellationToken);
            return true;
        }

        if (message.Type == "plan_approve")
        {
            var result = _planService.ApprovePlan(message.PlanId ?? string.Empty);
            await SendPlanActionResultAsync(socket, sendLock, "approve", result, cancellationToken);
            return true;
        }

        if (message.Type == "plan_update")
        {
            var result = _planService.UpdatePlan(message.PlanId ?? string.Empty, message.RawJson);
            await SendPlanActionResultAsync(socket, sendLock, "update", result, cancellationToken);
            return true;
        }

        if (message.Type == "plan_list")
        {
            await SendPlanListResultAsync(socket, sendLock, _planService.ListPlans(), cancellationToken);
            return true;
        }

        if (message.Type == "plan_get")
        {
            var snapshot = _planService.GetPlan(message.PlanId ?? string.Empty);
            var result = snapshot == null
                ? new PlanActionResult(false, "계획을 찾을 수 없습니다.", null)
                : new PlanActionResult(true, "계획을 불러왔습니다.", snapshot);
            await SendPlanActionResultAsync(socket, sendLock, "get", result, cancellationToken);
            return true;
        }

        if (message.Type == "plan_run")
        {
            var result = await _planService.RunPlanAsync(message.PlanId ?? string.Empty, "web", cancellationToken);
            await SendPlanActionResultAsync(socket, sendLock, "run", result, cancellationToken);
            return true;
        }

        return false;
    }
private static Task SendPlanActionResultAsync(
    WebSocket socket,
    SemaphoreSlim sendLock,
    string action,
    PlanActionResult result,
    CancellationToken cancellationToken
)
{
    var payload = PlanJson.Serialize(result);
    return WebSocketGateway.SendTextAsync(
        socket,
        sendLock,
        "{"
        + "\"type\":\"plan_result\","
        + $"\"action\":\"{WebSocketGateway.EscapeJson(action)}\","
        + $"\"payload\":{payload}"
        + "}",
        cancellationToken
    );
}

private static Task SendPlanListResultAsync(
    WebSocket socket,
    SemaphoreSlim sendLock,
    PlanListResult result,
    CancellationToken cancellationToken
)
{
    var payload = PlanJson.Serialize(result);
    return WebSocketGateway.SendTextAsync(
        socket,
        sendLock,
        "{"
        + "\"type\":\"plan_list_result\","
        + $"\"payload\":{payload}"
        + "}",
        cancellationToken
    );
}

}
