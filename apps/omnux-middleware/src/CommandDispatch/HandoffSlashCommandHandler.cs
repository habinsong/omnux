namespace Omnux.Middleware;

/// <summary>
/// <c>/handoff</c> 텍스트 명령 핸들러. <see cref="INotebookApplicationService"/>와
/// presentation policy만 의존하며 CommandService private state에 의존하지 않는다(결함 4번 M5).
/// </summary>
internal sealed class HandoffSlashCommandHandler : ISlashCommandHandler
{
    private readonly INotebookApplicationService _notebookService;

    public HandoffSlashCommandHandler(INotebookApplicationService notebookService)
    {
        _notebookService = notebookService;
    }

    public bool CanHandle(SlashCommandContext context)
    {
        return UnifiedSlashCommandPolicy.Parse(context.Text)?.Kind == UnifiedSlashCommandKind.Handoff;
    }

    public async Task<string> HandleAsync(SlashCommandContext context, CancellationToken cancellationToken)
    {
        var tokens = (context.Text ?? string.Empty)
            .Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        if (tokens.Length >= 2 && tokens[1].Equals("help", StringComparison.OrdinalIgnoreCase))
        {
            return """
                   [인수인계 명령]
                   /handoff [project-key]
                   """;
        }

        var projectKey = tokens.Length >= 2 ? tokens[1] : null;
        var result = await _notebookService.CreateHandoffAsync(projectKey, cancellationToken);
        return string.Equals(context.Source, "telegram", StringComparison.OrdinalIgnoreCase)
            ? TelegramHandoffPresentationPolicy.BuildTelegramHandoffResult(result)
            : NotebookSlashCommandHandler.FormatNotebookActionResult(result);
    }
}
