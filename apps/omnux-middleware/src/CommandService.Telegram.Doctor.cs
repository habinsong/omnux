namespace Omnux.Middleware;

public sealed partial class CommandService
{
    private async Task<string?> TryHandleTelegramDoctorCommandAsync(
        string text,
        CancellationToken cancellationToken
    )
    {
        if (!text.StartsWith("/doctor", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        return await TryHandleViaSlashRouterAsync(text, "telegram", cancellationToken);
    }
}
