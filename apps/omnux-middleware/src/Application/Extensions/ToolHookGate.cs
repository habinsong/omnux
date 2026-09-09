namespace Omnux.Middleware;

/// <summary>도구 실행 경계의 훅 호출 지점. 요청 처리기는 이 계약만 안다.</summary>
internal interface IToolHookGate
{
    Task<HookGateDecision> BeforeToolAsync(
        string toolName,
        string action,
        string rawRequestJson,
        CancellationToken cancellationToken
    );

    Task AfterToolAsync(string toolName, string action, CancellationToken cancellationToken);

    Task OnToolErrorAsync(string toolName, string action, string reason, CancellationToken cancellationToken);
}

/// <summary>훅을 쓰지 않는 실행 경로용 기본 구현.</summary>
internal sealed class NullToolHookGate : IToolHookGate
{
    public static readonly NullToolHookGate Instance = new();

    private NullToolHookGate()
    {
    }

    public Task<HookGateDecision> BeforeToolAsync(string toolName, string action, string rawRequestJson, CancellationToken cancellationToken)
        => Task.FromResult(HookGateDecision.Allow);

    public Task AfterToolAsync(string toolName, string action, CancellationToken cancellationToken)
        => Task.CompletedTask;

    public Task OnToolErrorAsync(string toolName, string action, string reason, CancellationToken cancellationToken)
        => Task.CompletedTask;
}

/// <summary>
/// 확장 계층 훅을 도구 실행에 연결하는 게이트.
/// 도구 이름은 요청 타입이고, 승인 대상은 `도구:동작` 이라 같은 도구의 다른 동작이 함께 승인되지 않는다.
/// </summary>
internal sealed class ExtensionToolHookGate : IToolHookGate
{
    private readonly HookDispatcher _dispatcher;
    private readonly HookApprovalCoordinator _approvals;

    public ExtensionToolHookGate(HookDispatcher dispatcher, HookApprovalCoordinator? approvals = null)
    {
        _dispatcher = dispatcher;
        _approvals = approvals ?? new HookApprovalCoordinator();
    }

    /// <summary>승인·매칭에 쓰는 도구 식별자. 동작이 있으면 함께 붙인다.</summary>
    public static string BuildToolName(string? toolName, string? action)
    {
        var tool = (toolName ?? string.Empty).Trim();
        var normalizedAction = (action ?? string.Empty).Trim();
        if (tool.Length == 0)
        {
            return string.Empty;
        }

        return normalizedAction.Length == 0 ? tool : $"{tool}:{normalizedAction}";
    }

    public async Task<HookGateDecision> BeforeToolAsync(
        string toolName,
        string action,
        string rawRequestJson,
        CancellationToken cancellationToken
    )
    {
        var name = BuildToolName(toolName, action);
        var input = new HookEventInput(
            HookEventCatalog.ToolPre,
            string.Empty,
            name,
            rawRequestJson,
            string.Empty,
            string.Empty,
            string.Empty,
            string.Empty
        );
        var result = await _dispatcher.DispatchAsync(input, cancellationToken).ConfigureAwait(false);
        return _approvals.Resolve(result, HookEventCatalog.ToolPre, name);
    }

    public Task AfterToolAsync(string toolName, string action, CancellationToken cancellationToken)
        => DispatchQuietlyAsync(HookEventCatalog.ToolPost, toolName, action, string.Empty, cancellationToken);

    public Task OnToolErrorAsync(string toolName, string action, string reason, CancellationToken cancellationToken)
        => DispatchQuietlyAsync(HookEventCatalog.ToolError, toolName, action, reason, cancellationToken);

    /// <summary>실행 뒤 훅은 결과를 되돌릴 수 없다. 실패해도 도구 결과를 바꾸지 않는다.</summary>
    private async Task DispatchQuietlyAsync(
        string eventId,
        string toolName,
        string action,
        string detail,
        CancellationToken cancellationToken
    )
    {
        var input = new HookEventInput(
            eventId,
            string.Empty,
            BuildToolName(toolName, action),
            string.Empty,
            string.Empty,
            string.Empty,
            detail,
            string.Empty
        );

        try
        {
            await _dispatcher.DispatchAsync(input, cancellationToken).ConfigureAwait(false);
        }
        catch (Exception)
        {
            // 훅 오류가 이미 끝난 도구 실행의 결과를 바꾸지 않는다.
        }
    }
}
