namespace Omnux.Middleware;

public sealed partial class CommandService
{
    private readonly record struct UnifiedSlashDomainCommandRequest(
        UnifiedSlashCommandKind Kind,
        IReadOnlyList<string> Tokens,
        string Source
    );

    private static bool IsUnifiedSlashDomainCommand(UnifiedSlashCommandKind kind)
    {
        return kind is UnifiedSlashCommandKind.Plan
            or UnifiedSlashCommandKind.Task
            or UnifiedSlashCommandKind.Notebook
            or UnifiedSlashCommandKind.Handoff;
    }

    private async Task<string?> ExecuteUnifiedSlashDomainCommandBoundaryAsync(
        UnifiedSlashDomainCommandRequest request,
        CancellationToken cancellationToken
    )
    {
        return request.Kind switch
        {
            UnifiedSlashCommandKind.Plan => await ExecutePlanSlashCommandAsync(request.Tokens, request.Source, cancellationToken),
            UnifiedSlashCommandKind.Task => await ExecuteTaskSlashCommandAsync(request.Tokens, request.Source, cancellationToken),
            UnifiedSlashCommandKind.Notebook => await ExecuteNotebookSlashCommandAsync(request.Tokens, request.Source, cancellationToken),
            UnifiedSlashCommandKind.Handoff => await ExecuteHandoffSlashCommandAsync(request.Tokens, request.Source, cancellationToken),
            _ => null
        };
    }
}
