namespace Omnux.Middleware;

/// <summary>
/// 잘못된 형식의 통합 슬래시 명령이 만드는 usage/static message를 소유한다.
/// 이 핸들러가 있어 레거시 unified slash executor 없이도 parser 결과를 끝까지 처리할 수 있다.
/// </summary>
internal sealed class StaticSlashCommandHandler : ISlashCommandHandler
{
    public bool CanHandle(SlashCommandContext context)
    {
        return UnifiedSlashCommandPolicy.Parse(context.Text)?.Kind == UnifiedSlashCommandKind.StaticMessage;
    }

    public Task<string> HandleAsync(SlashCommandContext context, CancellationToken cancellationToken)
    {
        return Task.FromResult(UnifiedSlashCommandPolicy.Parse(context.Text)?.Message ?? string.Empty);
    }
}
