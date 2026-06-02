namespace Omnux.Middleware;

public sealed partial class CommandService
{
    private async Task<string?> ExecuteUnifiedSlashMemoryCommandAsync(
        UnifiedSlashCommand command,
        string source,
        CancellationToken cancellationToken
    )
    {
        if (!IsUnifiedSlashMemoryCommand(command.Kind))
        {
            return null;
        }

        return await ExecuteUnifiedSlashMemoryCommandBoundaryAsync(
            new UnifiedSlashMemoryCommandRequest(command.Kind, source, command.CompactConversation),
            cancellationToken
        );
    }
}
