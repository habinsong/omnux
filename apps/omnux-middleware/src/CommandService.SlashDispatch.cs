namespace Omnux.Middleware;

public sealed partial class CommandService
{
    private readonly SlashCommandRouter _slashCommandRouter;
    private readonly ILlmControlApplicationService _llmControlApplicationService;

    private Task<string?> TryHandleViaSlashRouterAsync(
        string text,
        string source,
        CancellationToken cancellationToken
    )
    {
        return _slashCommandRouter.TryHandleAsync(new SlashCommandContext(text, source), cancellationToken);
    }
}
