namespace Omnux.Middleware;

/// <summary>
/// 차단할 수 없는 수명 이벤트 알림. 세션 시작·종료와 응답 완료처럼
/// 실행 결과를 바꿀 수 없는 지점에서 쓴다. 판정을 돌려주지 않는다.
/// </summary>
internal interface ILifecycleHookNotifier
{
    Task NotifyAsync(string eventId, string sessionId, string detail, CancellationToken cancellationToken);
}

/// <summary>훅을 쓰지 않는 경로용 기본 구현.</summary>
internal sealed class NullLifecycleHookNotifier : ILifecycleHookNotifier
{
    public static readonly NullLifecycleHookNotifier Instance = new();

    private NullLifecycleHookNotifier()
    {
    }

    public Task NotifyAsync(string eventId, string sessionId, string detail, CancellationToken cancellationToken)
        => Task.CompletedTask;
}

/// <summary>
/// 확장 계층 훅에 수명 이벤트를 알린다.
/// 이 이벤트들은 차단할 수 없으므로 판정을 읽지 않고, 훅 실패가 앱 동작을 바꾸지 않는다.
/// </summary>
internal sealed class ExtensionLifecycleHookNotifier : ILifecycleHookNotifier
{
    private readonly HookDispatcher _dispatcher;

    public ExtensionLifecycleHookNotifier(HookDispatcher dispatcher)
    {
        _dispatcher = dispatcher;
    }

    /// <summary>확장 계층을 읽지 못하면 알림 없이 진행한다.</summary>
    public static ILifecycleHookNotifier Resolve()
    {
        try
        {
            return new ExtensionLifecycleHookNotifier(new HookDispatcher(SharedExtensionServices.Service));
        }
        catch (Exception)
        {
            return NullLifecycleHookNotifier.Instance;
        }
    }

    public async Task NotifyAsync(
        string eventId,
        string sessionId,
        string detail,
        CancellationToken cancellationToken
    )
    {
        var definition = HookEventCatalog.Find(eventId);
        if (definition == null || definition.CanBlock)
        {
            // 차단 가능한 이벤트는 이 경로로 보내지 않는다. 판정을 버리게 되기 때문이다.
            return;
        }

        var input = new HookEventInput(
            definition.Id,
            sessionId,
            string.Empty,
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
            // 알림 훅 실패가 세션·응답 처리를 바꾸지 않는다.
        }
    }
}
