namespace Omnux.Middleware;

public sealed partial class CommandService
{
    private async Task<string?> ExecuteUnifiedSlashCommandDomainAsync(
        UnifiedSlashCommand command,
        string source,
        CancellationToken cancellationToken
    )
    {
        if (!IsUnifiedSlashDomainCommand(command.Kind))
        {
            return null;
        }

        return await ExecuteUnifiedSlashDomainCommandBoundaryAsync(
            new UnifiedSlashDomainCommandRequest(command.Kind, command.Tokens, source),
            cancellationToken
        );
    }
}
