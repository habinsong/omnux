namespace Omnux.Middleware;

public sealed partial class CommandService
{
    private async Task<string?> TryHandleUnifiedSlashCommandAsync(
        string text,
        string source,
        CancellationToken cancellationToken
    )
    {
        var command = UnifiedSlashCommandPolicy.Parse(text);
        if (command == null)
        {
            return null;
        }

        return await ExecuteUnifiedSlashCommandAsync(command, source, cancellationToken);
    }
}
