namespace Omnux.Middleware;

/// <summary>
/// 코딩 실행 경계의 훅 호출 지점. 실행기는 이 계약만 알고 훅 구현·저장소를 알지 않는다.
/// </summary>
internal interface ICodingHookGate
{
    Task<HookGateDecision> BeforeFileAsync(
        string actionType,
        string filePath,
        CancellationToken cancellationToken
    );

    Task<HookGateDecision> BeforeCommandAsync(
        string command,
        string workingDirectory,
        CancellationToken cancellationToken
    );

    /// <summary>코딩 계획이 확정된 직후. 거부되면 이번 실행을 시작하지 않는다.</summary>
    Task<HookGateDecision> BeforePlanAsync(
        string objective,
        string workingDirectory,
        CancellationToken cancellationToken
    );

    /// <summary>최종 검증 명령 실행 직전. 거부되면 검증을 실행하지 않는다.</summary>
    Task<HookGateDecision> BeforeVerifyAsync(
        string command,
        string workingDirectory,
        CancellationToken cancellationToken
    );

    Task AfterFileAsync(
        string actionType,
        string filePath,
        CancellationToken cancellationToken
    );
}

/// <summary>훅을 쓰지 않는 실행 경로용 기본 구현. 항상 허용하며 아무것도 하지 않는다.</summary>
internal sealed class NullCodingHookGate : ICodingHookGate
{
    public static readonly NullCodingHookGate Instance = new();

    private NullCodingHookGate()
    {
    }

    public Task<HookGateDecision> BeforeFileAsync(string actionType, string filePath, CancellationToken cancellationToken)
        => Task.FromResult(HookGateDecision.Allow);

    public Task<HookGateDecision> BeforeCommandAsync(string command, string workingDirectory, CancellationToken cancellationToken)
        => Task.FromResult(HookGateDecision.Allow);

    public Task<HookGateDecision> BeforePlanAsync(string objective, string workingDirectory, CancellationToken cancellationToken)
        => Task.FromResult(HookGateDecision.Allow);

    public Task<HookGateDecision> BeforeVerifyAsync(string command, string workingDirectory, CancellationToken cancellationToken)
        => Task.FromResult(HookGateDecision.Allow);

    public Task AfterFileAsync(string actionType, string filePath, CancellationToken cancellationToken)
        => Task.CompletedTask;
}

/// <summary>확장 계층 훅을 코딩 실행에 연결하는 게이트. 판정 규칙은 HookGatePolicy 가 갖는다.</summary>
internal sealed class ExtensionCodingHookGate : ICodingHookGate
{
    private readonly HookDispatcher _dispatcher;
    private readonly HookApprovalCoordinator _approvals;
    private readonly string _sessionId;

    public ExtensionCodingHookGate(
        HookDispatcher dispatcher,
        HookApprovalCoordinator? approvals = null,
        string sessionId = ""
    )
    {
        _dispatcher = dispatcher;
        _approvals = approvals ?? new HookApprovalCoordinator();
        _sessionId = sessionId;
    }

    public Task<HookGateDecision> BeforeFileAsync(
        string actionType,
        string filePath,
        CancellationToken cancellationToken
    )
    {
        var input = new HookEventInput(
            HookEventCatalog.CodingFilePre,
            _sessionId,
            actionType,
            string.Empty,
            filePath,
            string.Empty,
            string.Empty,
            string.Empty
        );
        return DecideAsync(input, filePath, cancellationToken);
    }

    public Task<HookGateDecision> BeforeCommandAsync(
        string command,
        string workingDirectory,
        CancellationToken cancellationToken
    )
    {
        var input = new HookEventInput(
            HookEventCatalog.CodingCommandPre,
            _sessionId,
            "run",
            string.Empty,
            string.Empty,
            command,
            string.Empty,
            workingDirectory
        );
        return DecideAsync(input, command, cancellationToken);
    }

    public Task<HookGateDecision> BeforePlanAsync(
        string objective,
        string workingDirectory,
        CancellationToken cancellationToken
    )
    {
        var input = new HookEventInput(
            HookEventCatalog.CodingPlan,
            _sessionId,
            string.Empty,
            string.Empty,
            string.Empty,
            string.Empty,
            objective,
            workingDirectory
        );
        return DecideAsync(input, objective, cancellationToken);
    }

    public Task<HookGateDecision> BeforeVerifyAsync(
        string command,
        string workingDirectory,
        CancellationToken cancellationToken
    )
    {
        var input = new HookEventInput(
            HookEventCatalog.CodingVerify,
            _sessionId,
            string.Empty,
            string.Empty,
            string.Empty,
            command,
            string.Empty,
            workingDirectory
        );
        return DecideAsync(input, command, cancellationToken);
    }

    public async Task AfterFileAsync(string actionType, string filePath, CancellationToken cancellationToken)
    {
        var input = new HookEventInput(
            HookEventCatalog.CodingFilePost,
            _sessionId,
            actionType,
            string.Empty,
            filePath,
            string.Empty,
            string.Empty,
            string.Empty
        );

        // 쓰기 후 훅은 결과를 되돌릴 수 없다. 실패해도 실행 결과를 바꾸지 않는다.
        await _dispatcher.DispatchAsync(input, cancellationToken).ConfigureAwait(false);
    }

    private async Task<HookGateDecision> DecideAsync(
        HookEventInput input,
        string approvalTarget,
        CancellationToken cancellationToken
    )
    {
        var result = await _dispatcher.DispatchAsync(input, cancellationToken).ConfigureAwait(false);
        return _approvals.Resolve(result, input.Event, approvalTarget);
    }
}
