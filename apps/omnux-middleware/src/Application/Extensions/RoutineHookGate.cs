namespace Omnux.Middleware;

/// <summary>자동화 실행 경계의 훅 호출 지점. 실행 서비스는 이 계약만 안다.</summary>
internal interface IRoutineHookGate
{
    Task<HookGateDecision> BeforeRunAsync(
        string routineId,
        string title,
        CancellationToken cancellationToken
    );

    Task AfterRunAsync(
        string routineId,
        string status,
        CancellationToken cancellationToken
    );
}

/// <summary>훅을 쓰지 않는 실행 경로용 기본 구현.</summary>
internal sealed class NullRoutineHookGate : IRoutineHookGate
{
    public static readonly NullRoutineHookGate Instance = new();

    private NullRoutineHookGate()
    {
    }

    public Task<HookGateDecision> BeforeRunAsync(string routineId, string title, CancellationToken cancellationToken)
        => Task.FromResult(HookGateDecision.Allow);

    public Task AfterRunAsync(string routineId, string status, CancellationToken cancellationToken)
        => Task.CompletedTask;
}

/// <summary>확장 계층 훅을 자동화 실행에 연결하는 게이트. 판정 규칙은 HookGatePolicy 가 갖는다.</summary>
internal sealed class ExtensionRoutineHookGate : IRoutineHookGate
{
    private readonly HookDispatcher _dispatcher;
    private readonly HookApprovalCoordinator _approvals;

    public ExtensionRoutineHookGate(HookDispatcher dispatcher, HookApprovalCoordinator? approvals = null)
    {
        _dispatcher = dispatcher;
        _approvals = approvals ?? new HookApprovalCoordinator();
    }

    public async Task<HookGateDecision> BeforeRunAsync(
        string routineId,
        string title,
        CancellationToken cancellationToken
    )
    {
        var result = await _dispatcher
            .DispatchAsync(BuildInput(HookEventCatalog.RoutinePre, routineId, title), cancellationToken)
            .ConfigureAwait(false);
        return _approvals.Resolve(result, HookEventCatalog.RoutinePre, routineId);
    }

    public async Task AfterRunAsync(string routineId, string status, CancellationToken cancellationToken)
    {
        // 실행 뒤 훅은 결과를 되돌릴 수 없다. 판정을 실행 결과로 바꾸지 않는다.
        await _dispatcher
            .DispatchAsync(BuildInput(HookEventCatalog.RoutinePost, routineId, status), cancellationToken)
            .ConfigureAwait(false);
    }

    private static HookEventInput BuildInput(string eventId, string routineId, string detail)
    {
        return new HookEventInput(
            eventId,
            routineId,
            routineId,
            string.Empty,
            string.Empty,
            string.Empty,
            detail,
            string.Empty
        );
    }
}
