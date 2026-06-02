namespace Omnux.Middleware;

public sealed partial class CommandService
{
    private async Task<string?> TryHandleTelegramTaskCommandAsync(
        string text,
        CancellationToken cancellationToken
    )
    {
        if (!text.StartsWith("/task", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        return await TryHandleViaSlashRouterAsync(text, "telegram", cancellationToken);
    }
}
