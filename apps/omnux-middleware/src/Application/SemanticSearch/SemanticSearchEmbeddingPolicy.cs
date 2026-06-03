namespace Omnux.Middleware;

internal static class SemanticSearchEmbeddingPolicy
{
    public static async Task<SemanticSearchEmbeddingSnapshot> BuildSnapshotAsync(
        LocalLlmDiscoveryService localLlmDiscoveryService,
        ICollection<string> warnings,
        CancellationToken cancellationToken
    )
    {
        LocalLlmDiscoverySnapshot localSnapshot;
        try
        {
            localSnapshot = await localLlmDiscoveryService.DiscoverAsync(cancellationToken).ConfigureAwait(false);
        }
        catch (Exception ex) when (ex is HttpRequestException or InvalidOperationException or TaskCanceledException)
        {
            warnings.Add($"local_llm_discovery_failed:{TrimForError(ex.Message)}");
            return new SemanticSearchEmbeddingSnapshot(
                LocalEndpointAvailable: false,
                CandidateModelAvailable: false,
                AvailableEndpointCount: 0,
                TotalModelCount: 0,
                CandidateModels: Array.Empty<SemanticSearchEmbeddingCandidate>()
            );
        }

        var candidates = localSnapshot.Endpoints
            .Where(endpoint => endpoint.Status == "available")
            .SelectMany(endpoint => endpoint.Models
                .Where(model => LooksLikeEmbeddingModel(model.Id))
                .Select(model => new SemanticSearchEmbeddingCandidate(endpoint.Name, endpoint.Kind, model.Id)))
            .Take(20)
            .ToArray();

        return new SemanticSearchEmbeddingSnapshot(
            localSnapshot.AvailableEndpointCount > 0,
            candidates.Length > 0,
            localSnapshot.AvailableEndpointCount,
            localSnapshot.TotalModelCount,
            candidates
        );
    }

    public static void AddChecks(
        ICollection<SemanticSearchReadinessCheck> checks,
        SemanticSearchEmbeddingSnapshot embedding
    )
    {
        checks.Add(new SemanticSearchReadinessCheck(
            "local_llm_endpoint",
            embedding.LocalEndpointAvailable ? "ok" : "skipped",
            embedding.LocalEndpointAvailable ? "at least one local LLM endpoint is available" : "no local LLM endpoint is available"
        ));
        checks.Add(new SemanticSearchReadinessCheck(
            "embedding_model",
            embedding.CandidateModelAvailable ? "ok" : "skipped",
            embedding.CandidateModelAvailable ? "local embedding model candidate was discovered" : "no local embedding model candidate was discovered"
        ));
    }

    private static bool LooksLikeEmbeddingModel(string modelId)
    {
        var value = (modelId ?? string.Empty).Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        return value.Contains("embed", StringComparison.Ordinal)
            || value.Contains("embedding", StringComparison.Ordinal)
            || value.Contains("bge", StringComparison.Ordinal)
            || value.Contains("all-minilm", StringComparison.Ordinal)
            || value.Contains("mxbai", StringComparison.Ordinal)
            || value.Contains("jina", StringComparison.Ordinal)
            || value.Contains("snowflake-arctic", StringComparison.Ordinal)
            || value.StartsWith("e5-", StringComparison.Ordinal)
            || value.StartsWith("e5_", StringComparison.Ordinal)
            || value.Contains("/e5-", StringComparison.Ordinal)
            || value.Contains(":e5-", StringComparison.Ordinal);
    }

    private static string TrimForError(string value)
    {
        var text = (value ?? string.Empty).Trim();
        return text.Length <= 240 ? text : text[..240] + "...";
    }
}
