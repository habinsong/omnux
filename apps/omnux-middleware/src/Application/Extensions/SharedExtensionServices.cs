namespace Omnux.Middleware;

/// <summary>
/// 확장 계층의 공유 인스턴스. 코딩·자동화·채팅이 같은 설정 파일과 승인 상태를 봐야 한다.
/// 여기에는 지연 생성과 실패 시 기본값만 둔다. 판정·저장·실행 로직은 각 타입이 갖는다.
/// </summary>
internal static class SharedExtensionServices
{
    private static readonly object Lock = new();

    private static ExtensionApplicationService? _service;
    private static HookApprovalCoordinator? _approvals;

    public static ExtensionApplicationService Service
    {
        get
        {
            lock (Lock)
            {
                return _service ??= new ExtensionApplicationService();
            }
        }
    }

    public static HookApprovalCoordinator Approvals
    {
        get
        {
            lock (Lock)
            {
                return _approvals ??= new HookApprovalCoordinator();
            }
        }
    }

    /// <summary>
    /// 채팅 입력에 붙일 규칙 본문. 확장 계층을 읽지 못하면 빈 문자열을 돌려주고
    /// 채팅 자체를 막지 않는다.
    /// </summary>
    public static ExtensionRuleSelection ResolveChatRules(int budgetChars)
    {
        try
        {
            return Service.ResolveRules(ExtensionRule.ScopeGlobal, targetPath: null, budgetChars);
        }
        catch (Exception)
        {
            return new ExtensionRuleSelection(
                Array.Empty<ExtensionRule>(),
                Array.Empty<ExtensionRule>(),
                string.Empty,
                0,
                budgetChars
            );
        }
    }
}
