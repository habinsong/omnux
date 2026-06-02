namespace Omnux.Middleware;

/// <summary>
/// 등록된 <see cref="ISlashCommandHandler"/>들을 순서대로 consult하는 얇은 라우터.
/// 첫 번째로 <see cref="ISlashCommandHandler.CanHandle"/>가 true인 핸들러의 결과를 반환하고,
/// 아무도 소유하지 않으면 null을 반환한다(unknown slash가 post routing으로 넘어가기 위한 경계).
/// AOT-safe: 리플렉션 스캔 없이 생성자에서 명시 등록된 핸들러만 사용한다.
/// </summary>
internal sealed class SlashCommandRouter
{
    private readonly IReadOnlyList<ISlashCommandHandler> _handlers;

    public SlashCommandRouter(IReadOnlyList<ISlashCommandHandler> handlers)
    {
        _handlers = handlers ?? Array.Empty<ISlashCommandHandler>();
    }

    /// <summary>
    /// 명령을 소유하는 첫 핸들러의 응답을 반환한다. 소유하는 핸들러가 없으면 null.
    /// </summary>
    public async Task<string?> TryHandleAsync(
        SlashCommandContext context,
        CancellationToken cancellationToken
    )
    {
        foreach (var handler in _handlers)
        {
            if (handler.CanHandle(context))
            {
                return await handler.HandleAsync(context, cancellationToken);
            }
        }

        return null;
    }
}
