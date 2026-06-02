namespace Omnux.Middleware;

public sealed partial class CommandService
{
    private async Task<string?> TryHandleTelegramNotebookCommandAsync(
        string text,
        CancellationToken cancellationToken
    )
    {
        if (text.StartsWith("/notebook", StringComparison.OrdinalIgnoreCase))
        {
            return await TryHandleViaSlashRouterAsync(text, "telegram", cancellationToken);
        }

        if (text.StartsWith("/handoff", StringComparison.OrdinalIgnoreCase))
        {
            return await TryHandleViaSlashRouterAsync(text, "telegram", cancellationToken);
        }

        return null;
    }
}
