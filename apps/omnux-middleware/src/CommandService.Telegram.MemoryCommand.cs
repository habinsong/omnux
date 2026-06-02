namespace Omnux.Middleware;

public sealed partial class CommandService
{
    private async Task<string?> TryHandleTelegramMemoryCommandAsync(string text, CancellationToken cancellationToken)
    {
        if (!text.StartsWith("/memory", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        return await TryHandleViaSlashRouterAsync(text, "telegram", cancellationToken);
    }
}
