namespace Omnux.Middleware;

/// <summary>
/// 훅 결과 합성(순수 함수). Deny &gt; Ask &gt; Allow 순으로 강하며 약한 판정이 강한 판정을 덮지 않는다.
/// 실행 실패는 FailureMode 가 Closed 인 정의에서만 차단으로 승격한다.
/// </summary>
internal static class HookDecisionReducer
{
    /// <param name="eventDefinition">
    /// 이벤트가 허용하는 능력. 카탈로그 조회는 호출부(dispatcher)가 이미 하므로 여기서 다시 찾지 않는다.
    /// 능력을 인자로 받으면 카탈로그 값과 무관하게 합성 규칙 자체를 검증할 수 있다.
    /// </param>
    public static HookDispatchResult Reduce(
        HookEventDefinition eventDefinition,
        IReadOnlyList<HookRunResult> runs,
        IReadOnlyDictionary<string, HookDefinition> definitionsById
    )
    {
        var normalizedEvent = HookEventCatalog.Normalize(eventDefinition.Id);
        if (runs.Count == 0)
        {
            return HookDispatchResult.Empty(normalizedEvent);
        }

        var canBlock = eventDefinition.CanBlock;
        var canRewrite = eventDefinition.CanRewriteInput;
        var canAddContext = eventDefinition.CanAddContext;

        var outcome = HookOutcome.None;
        var reason = string.Empty;
        var decidedBy = string.Empty;
        var updatedInput = string.Empty;
        var updatedInputBy = string.Empty;
        var context = new List<string>();

        foreach (var run in runs)
        {
            var effective = EffectiveOutcome(run, definitionsById);

            if (!canBlock && effective is HookOutcome.Deny or HookOutcome.Ask)
            {
                // 차단할 수 없는 이벤트의 거부는 판정이 아니라 경고로만 남긴다.
                if (canAddContext && run.Reason.Length > 0)
                {
                    context.Add(run.Reason);
                }

                continue;
            }

            if (effective > outcome)
            {
                outcome = effective;
                reason = run.Reason;
                decidedBy = run.HookId;
            }

            if (canRewrite
                && run.UpdatedInputJson.Length > 0
                && effective != HookOutcome.Deny)
            {
                updatedInput = run.UpdatedInputJson;
                updatedInputBy = run.HookId;
            }

            if (canAddContext && run.AdditionalContext.Length > 0)
            {
                context.Add(run.AdditionalContext);
            }
        }

        if (outcome == HookOutcome.Deny)
        {
            // 거부된 호출에는 재작성 입력을 전달하지 않는다.
            updatedInput = string.Empty;
            updatedInputBy = string.Empty;
        }

        return new HookDispatchResult(
            normalizedEvent,
            outcome,
            reason,
            decidedBy,
            updatedInput,
            updatedInputBy,
            context,
            runs
        );
    }

    /// <summary>실행 상태를 반영한 실제 판정. 실패·시간 초과는 정의의 FailureMode 를 따른다.</summary>
    public static HookOutcome EffectiveOutcome(
        HookRunResult run,
        IReadOnlyDictionary<string, HookDefinition> definitionsById
    )
    {
        switch (run.Status)
        {
            case HookRunStatus.Blocked:
                return HookOutcome.Deny;
            case HookRunStatus.Completed:
                return run.Outcome;
            case HookRunStatus.Failed:
            case HookRunStatus.TimedOut:
                return definitionsById.TryGetValue(run.HookId, out var definition)
                    && definition.FailureMode == HookFailureMode.Closed
                    ? HookOutcome.Deny
                    : HookOutcome.None;
            case HookRunStatus.Canceled:
            case HookRunStatus.Unsupported:
            case HookRunStatus.NotRun:
            default:
                return HookOutcome.None;
        }
    }
}
