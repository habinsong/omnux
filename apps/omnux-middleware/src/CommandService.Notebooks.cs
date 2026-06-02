namespace Omnux.Middleware;

public sealed partial class CommandService
{
    public Task<NotebookActionResult> GetNotebookAsync(string? projectKey, CancellationToken cancellationToken)
        => _notebookAppService.GetNotebookAsync(projectKey, cancellationToken);

    public Task<NotebookActionResult> AppendLearningAsync(string? projectKey, string content, CancellationToken cancellationToken)
        => _notebookAppService.AppendLearningAsync(projectKey, content, cancellationToken);

    public Task<NotebookActionResult> AppendDecisionAsync(string? projectKey, string content, CancellationToken cancellationToken)
        => _notebookAppService.AppendDecisionAsync(projectKey, content, cancellationToken);

    public Task<NotebookActionResult> AppendVerificationAsync(string? projectKey, string content, CancellationToken cancellationToken)
        => _notebookAppService.AppendVerificationAsync(projectKey, content, cancellationToken);

    public Task<NotebookActionResult> CreateHandoffAsync(string? projectKey, CancellationToken cancellationToken)
        => _notebookAppService.CreateHandoffAsync(projectKey, cancellationToken);

    public Task<string> BuildNotebookContextBlockAsync(string? projectKey, CancellationToken cancellationToken)
        => _notebookAppService.BuildNotebookContextBlockAsync(projectKey, cancellationToken);
}
