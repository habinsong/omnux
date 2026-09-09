namespace Omnux.Middleware;

/// <summary>
/// 승인 요청(ask) 판정을 실제 승인 상태와 연결한다.
/// 유효한 승인이 있으면 통과시키고, 없으면 승인 대기에 등록한 뒤 차단한다.
/// 승인 없이 통과시키는 경로는 만들지 않는다.
/// </summary>
internal sealed class HookApprovalCoordinator
{
    private readonly ApprovalStore _store;
    private readonly Func<DateTimeOffset> _clock;

    public HookApprovalCoordinator(ApprovalStore? store = null, Func<DateTimeOffset>? clock = null)
    {
        _store = store ?? new ApprovalStore();
        _clock = clock ?? (() => DateTimeOffset.UtcNow);
    }

    public ApprovalStore Store => _store;

    public HookGateDecision Resolve(HookDispatchResult result, string eventId, string target)
    {
        var decision = HookGatePolicy.ToDecision(result);
        if (result.Outcome != HookOutcome.Ask)
        {
            return decision;
        }

        var now = _clock();
        var state = _store.Read();
        var lookup = ApprovalPolicy.Find(state.Grants, eventId, target, now);
        if (lookup.Approved)
        {
            if (lookup.ConsumesGrant && lookup.Grant != null && !_store.TryConsumeGrant(lookup.Grant.Id, now))
            {
                // 1회용 승인을 소모하지 못하면 통과시키지 않는다. 같은 승인이 반복 사용되는 것을 막는다.
                return decision with
                {
                    Reason = $"{decision.Reason} (1회 승인을 소모하지 못해 실행하지 않는다)"
                };
            }

            return HookGateDecision.Allow;
        }

        var reason = result.Reason.Length > 0 ? result.Reason : "훅이 사용자 승인을 요구했다";
        var recorded = _store.TryRecordPending(eventId, target, reason, result.DecidedByHookId, now);
        return new HookGateDecision(
            false,
            recorded
                ? $"{reason} — 승인 대기에 등록했다. 확장 화면에서 승인한 뒤 다시 실행하라."
                : $"{reason} — 승인 대기 등록에 실패해 실행하지 않는다.",
            result.DecidedByHookId
        );
    }
}
