namespace Omnux.Middleware;

public sealed partial class CommandService
{
    public Task<PlanActionResult> CreatePlanAsync(
        string objective,
        IReadOnlyList<string>? constraints,
        string? mode,
        string? sourceConversationId,
        CancellationToken cancellationToken
    ) => _planAppService.CreatePlanAsync(objective, constraints, mode, sourceConversationId, cancellationToken);

    public Task<PlanActionResult> ReviewPlanAsync(string planId, CancellationToken cancellationToken)
        => _planAppService.ReviewPlanAsync(planId, cancellationToken);

    public PlanActionResult ApprovePlan(string planId)
        => _planAppService.ApprovePlan(planId);

    public PlanActionResult UpdatePlan(string planId, string? rawJson)
        => _planAppService.UpdatePlan(planId, rawJson);

    public PlanListResult ListPlans()
        => _planAppService.ListPlans();

    public PlanSnapshot? GetPlan(string planId)
        => _planAppService.GetPlan(planId);

    public Task<PlanActionResult> RunPlanAsync(string planId, string source, CancellationToken cancellationToken)
        => _planAppService.RunPlanAsync(planId, source, cancellationToken);
}
