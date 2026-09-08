namespace Omnux.Middleware;

internal sealed class CodingProjectRunCoordinator
{
    private readonly IConversationStore _conversations;
    private readonly ProjectWorkspaceBindingService _bindings;

    public CodingProjectRunCoordinator(IConversationStore conversations, ProjectWorkspaceBindingService bindings)
    {
        _conversations = conversations;
        _bindings = bindings;
    }

    public async Task<CodingRunResult> RunAsync(
        CodingRunRequest request,
        Func<CodingRunRequest, CancellationToken, Action<CodingProgressUpdate>?, Task<CodingRunResult>> run,
        Func<CodingRunResult, CodingRunResult> persist,
        CancellationToken cancellationToken,
        Action<CodingProgressUpdate>? progressCallback)
    {
        var existing = string.IsNullOrWhiteSpace(request.ConversationId) ? null : _conversations.Get(request.ConversationId);
        var binding = _bindings.Resolve(request.ProjectKey, existing?.CodingProject);
        using var lease = _bindings.Acquire(binding, request.ConversationId);
        request = request with { BoundProject = binding };
        var before = binding == null || request.Mode == "multi" ? null : await ProjectWorkspaceFiles.FingerprintsAsync(binding.Path, cancellationToken, sourceProject: true);
        var result = await run(request, cancellationToken, progressCallback);
        if (before == null) return result;
        var after = await ProjectWorkspaceFiles.FingerprintsAsync(binding!.Path, cancellationToken, sourceProject: true);
        var changed = after.Where(pair => !before.TryGetValue(pair.Key, out var hash) || hash != pair.Value)
            .Select(pair => Path.Combine(binding.Path, pair.Key)).ToArray();
        return persist(result with { ChangedFiles = changed });
    }
}
