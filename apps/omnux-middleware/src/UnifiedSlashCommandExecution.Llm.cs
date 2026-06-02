namespace Omnux.Middleware;

public sealed partial class CommandService
{
    private async Task<string?> ExecuteUnifiedSlashCommandLlmAsync(
        UnifiedSlashCommand command,
        string source,
        CancellationToken cancellationToken
    )
    {
        if (!IsUnifiedSlashLlmCommand(command.Kind))
        {
            return null;
        }

        return await ExecuteUnifiedSlashLlmCommandBoundaryAsync(
            new UnifiedSlashLlmCommandRequest(command.Kind, source, command.Primary, command.Secondary),
            cancellationToken
        );
    }
}
