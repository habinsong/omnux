namespace Omnux.Middleware;

public sealed partial class CommandService
{
    private async Task<string?> ExecuteUnifiedSlashCommandDomainAsync(
        UnifiedSlashCommand command,
        string source,
        CancellationToken cancellationToken
    )
    {
        return command.Kind switch
        {
            UnifiedSlashCommandKind.Plan => await ExecutePlanSlashCommandAsync(command.Tokens, source, cancellationToken),
            UnifiedSlashCommandKind.Task => await ExecuteTaskSlashCommandAsync(command.Tokens, source, cancellationToken),
            UnifiedSlashCommandKind.Notebook => await ExecuteNotebookSlashCommandAsync(command.Tokens, source, cancellationToken),
            UnifiedSlashCommandKind.Handoff => await ExecuteHandoffSlashCommandAsync(command.Tokens, source, cancellationToken),
            _ => null
        };
    }
}
