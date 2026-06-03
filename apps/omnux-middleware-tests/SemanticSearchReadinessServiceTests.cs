using Omnux.Middleware;
using System.Net;

namespace Omnux.Middleware.Tests;

public sealed class SemanticSearchReadinessServiceTests
{
    [Fact]
    public async Task GetSnapshotAsyncBlocksWhenMemoryIndexDatabaseIsMissing()
    {
        var snapshot = await new SemanticSearchReadinessService(
                repositoryRoot: "/repo",
                conversationStatePath: "/state/conversations.json",
                localLlmDiscoveryService: EmptyLocalLlmDiscovery(),
                utcNow: () => DateTimeOffset.Parse("2026-06-04T00:00:00Z"),
                fileExists: _ => false,
                commandAvailable: command => command == "sqlite3",
                sqliteRunner: (_, _) => throw new InvalidOperationException("sqlite should not be queried")
            )
            .GetSnapshotAsync(CancellationToken.None);

        Assert.Equal("blocked", snapshot.Status);
        Assert.True(snapshot.ReadOnly);
        Assert.False(snapshot.VectorSearchEnabled);
        Assert.False(snapshot.EmbeddingGenerationEnabled);
        Assert.True(snapshot.CodeSearchRecommended);
        Assert.False(snapshot.Index.DbExists);
        Assert.False(snapshot.Index.FtsAvailable);
        Assert.Contains(snapshot.Checks, check =>
            check.Name == "memory_index_db" && check.Status == "failed");
        Assert.Contains(snapshot.Skipped, item => item == "bulk_reindex");
        Assert.Equal(DateTimeOffset.Parse("2026-06-04T00:00:00Z"), snapshot.ScannedAtUtc);
    }

    [Fact]
    public async Task GetSnapshotAsyncKeepsFtsAstPrimaryWhenSqliteVecIsUnavailable()
    {
        var snapshot = await new SemanticSearchReadinessService(
                repositoryRoot: "/repo",
                conversationStatePath: "/state/conversations.json",
                localLlmDiscoveryService: OllamaDiscovery("""{"models":[{"name":"nomic-embed-text:latest"},{"name":"qwen2.5-coder:7b"}]}"""),
                utcNow: () => DateTimeOffset.Parse("2026-06-04T00:00:00Z"),
                fileExists: path => path.EndsWith("main.sqlite", StringComparison.Ordinal),
                commandAvailable: command => command == "sqlite3",
                sqliteRunner: StubSqliteRunner(sql =>
                {
                    if (sql.Contains("chunks_fts", StringComparison.Ordinal)) return "1\n";
                    if (sql.Contains("pragma_function_list", StringComparison.Ordinal)) return "0\n";
                    if (sql.Contains("COUNT(*) FROM files", StringComparison.Ordinal)) return "3\n";
                    if (sql.Contains("GROUP BY source", StringComparison.Ordinal)) return "project|9\nsessions|3\n";
                    if (sql.Contains("COUNT(*) FROM chunks", StringComparison.Ordinal)) return "12\n";
                    if (sql.Contains("COUNT(*) FROM embedding_cache", StringComparison.Ordinal)) return "5\n";
                    return "0\n";
                })
            )
            .GetSnapshotAsync(CancellationToken.None);

        Assert.Equal("fts_ast_primary", snapshot.Status);
        Assert.Equal("fts_ast_primary", snapshot.Mode);
        Assert.True(snapshot.Index.FtsAvailable);
        Assert.False(snapshot.Index.SqliteVecAvailable);
        Assert.Equal(3, snapshot.Index.FileCount);
        Assert.Equal(12, snapshot.Index.ChunkCount);
        Assert.Equal(5, snapshot.Index.EmbeddingCacheEntryCount);
        Assert.Contains(snapshot.Index.ChunkSources, source => source.Source == "project" && source.Count == 9);
        Assert.True(snapshot.Embedding.LocalEndpointAvailable);
        Assert.True(snapshot.Embedding.CandidateModelAvailable);
        Assert.Contains(snapshot.Embedding.CandidateModels, model => model.ModelId == "nomic-embed-text:latest");
        Assert.Contains(snapshot.Recommendations, item => item.Kind == "natural_language_search");
        Assert.Contains(snapshot.Checks, check => check.Name == "sqlite_vec" && check.Status == "skipped");
    }

    [Fact]
    public async Task GetSnapshotAsyncReportsSemanticPrerequisitesWithoutEnablingVectorSearch()
    {
        var snapshot = await new SemanticSearchReadinessService(
                repositoryRoot: "/repo",
                conversationStatePath: "/state/conversations.json",
                localLlmDiscoveryService: OllamaDiscovery("""{"models":[{"name":"mxbai-embed-large:latest"}]}"""),
                fileExists: _ => true,
                commandAvailable: command => command == "sqlite3",
                sqliteRunner: StubSqliteRunner(sql =>
                {
                    if (sql.Contains("chunks_fts", StringComparison.Ordinal)) return "1\n";
                    if (sql.Contains("pragma_function_list", StringComparison.Ordinal)) return "2\n";
                    return "0\n";
                })
            )
            .GetSnapshotAsync(CancellationToken.None);

        Assert.Equal("semantic_prerequisites_ready", snapshot.Status);
        Assert.Equal("natural_language_semantic_optional", snapshot.Mode);
        Assert.True(snapshot.Index.SqliteVecAvailable);
        Assert.True(snapshot.Embedding.CandidateModelAvailable);
        Assert.False(snapshot.VectorSearchEnabled);
        Assert.False(snapshot.EmbeddingGenerationEnabled);
        Assert.Contains(snapshot.Checks, check => check.Name == "vector_indexing" && check.Status == "skipped");
    }

    private static LocalLlmDiscoveryService EmptyLocalLlmDiscovery()
    {
        return new LocalLlmDiscoveryService(
            httpClient: new HttpClient(new StubHttpMessageHandler(_ =>
                new HttpResponseMessage(HttpStatusCode.NotFound))),
            endpoints: Array.Empty<LocalLlmEndpointConfig>()
        );
    }

    private static LocalLlmDiscoveryService OllamaDiscovery(string body)
    {
        return new LocalLlmDiscoveryService(
            httpClient: new HttpClient(new StubHttpMessageHandler(_ =>
                new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent(body)
                })),
            endpoints: new[]
            {
                new LocalLlmEndpointConfig("ollama-test", "ollama", "http://local-ollama.test")
            }
        );
    }

    private static Func<string, string, SemanticSearchSqliteResult> StubSqliteRunner(Func<string, string> handler)
    {
        return (_, sql) => new SemanticSearchSqliteResult(0, handler(sql), string.Empty);
    }

    private sealed class StubHttpMessageHandler : HttpMessageHandler
    {
        private readonly Func<HttpRequestMessage, HttpResponseMessage> _handler;

        public StubHttpMessageHandler(Func<HttpRequestMessage, HttpResponseMessage> handler)
        {
            _handler = handler;
        }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            return Task.FromResult(_handler(request));
        }
    }
}
