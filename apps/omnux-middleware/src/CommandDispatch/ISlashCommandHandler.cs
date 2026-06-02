namespace Omnux.Middleware;

/// <summary>
/// 단일 도메인의 텍스트/슬래시 명령 핸들러. 구현체는 자기 도메인 ApplicationService와
/// 순수 정책만 의존하며 CommandService private state에 의존하지 않는다.
/// WebSocket 측 Ws*CommandDispatcher 패턴(TryHandle 게이트 + 위임)을 텍스트 명령 경로에 적용한 것.
/// </summary>
internal interface ISlashCommandHandler
{
    /// <summary>이 핸들러가 주어진 명령을 소유(처리)할 수 있으면 true.</summary>
    bool CanHandle(SlashCommandContext context);

    /// <summary>명령을 처리하고 응답 텍스트를 반환한다. CanHandle이 true일 때만 호출된다.</summary>
    Task<string> HandleAsync(SlashCommandContext context, CancellationToken cancellationToken);
}
