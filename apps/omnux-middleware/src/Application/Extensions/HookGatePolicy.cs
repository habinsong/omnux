namespace Omnux.Middleware;

/// <summary>훅 게이트 판정. 차단 사유와 판정한 훅을 그대로 전달한다.</summary>
internal readonly record struct HookGateDecision(
    bool Allowed,
    string Reason,
    string DecidedByHookId
)
{
    public static readonly HookGateDecision Allow = new(true, string.Empty, string.Empty);
}

/// <summary>
/// 훅 합성 결과를 실행 허용 여부로 바꾸는 규칙(순수 함수).
/// 승인 요청(ask)은 사용자 확인 경로가 아직 없으므로 통과시키지 않는다.
/// 실행되지 않은 승인을 승인된 것처럼 처리하지 않기 위한 선택이며, 사유에 그대로 적는다.
/// </summary>
internal static class HookGatePolicy
{
    public const string PendingApprovalNote = "승인 확인 경로가 아직 없어 실행하지 않는다";

    public static HookGateDecision ToDecision(HookDispatchResult result)
    {
        return result.Outcome switch
        {
            HookOutcome.Deny => new HookGateDecision(
                false,
                result.Reason.Length > 0 ? result.Reason : "훅이 차단했다",
                result.DecidedByHookId
            ),
            HookOutcome.Ask => new HookGateDecision(
                false,
                result.Reason.Length > 0
                    ? $"{result.Reason} ({PendingApprovalNote})"
                    : $"훅이 사용자 승인을 요구했다. {PendingApprovalNote}",
                result.DecidedByHookId
            ),
            _ => HookGateDecision.Allow
        };
    }
}
