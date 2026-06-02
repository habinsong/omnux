namespace Omnux.Middleware;

public sealed partial class CommandService
{
    private async Task<string?> TryHandleTelegramPlanCommandAsync(
        string text,
        CancellationToken cancellationToken
    )
    {
        if (!text.StartsWith("/plan", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        return await TryHandleViaSlashRouterAsync(text, "telegram", cancellationToken);
    }
}
