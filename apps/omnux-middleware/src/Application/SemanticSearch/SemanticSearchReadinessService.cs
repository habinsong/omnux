namespace Omnux.Middleware;

internal sealed class SemanticSearchReadinessService
{
    private readonly string _repositoryRoot;
    private readonly SemanticSearchIndexProbe _indexProbe;
    private readonly LocalLlmDiscoveryService _localLlmDiscoveryService;
    private readonly Func<DateTimeOffset> _utcNow;

    public SemanticSearchReadinessService(
        string repositoryRoot,
        PathOptions paths,
        LocalLlmDiscoveryService? localLlmDiscoveryService = null,
        Func<DateTimeOffset>? utcNow = null,
        Func<string, bool>? fileExists = null,
        Func<string, bool>? commandAvailable = null,
        Func<string, string, SemanticSearchSqliteResult>? sqliteRunner = null
    )
        : this(
            repositoryRoot,
            paths.ConversationStatePath,
            localLlmDiscoveryService,
            utcNow,
            fileExists,
            commandAvailable,
            sqliteRunner
        )
    {
    }

    internal SemanticSearchReadinessService(
        string repositoryRoot,
        string conversationStatePath,
        LocalLlmDiscoveryService? localLlmDiscoveryService = null,
        Func<DateTimeOffset>? utcNow = null,
        Func<string, bool>? fileExists = null,
        Func<string, bool>? commandAvailable = null,
        Func<string, string, SemanticSearchSqliteResult>? sqliteRunner = null
    )
    {
        _repositoryRoot = Path.GetFullPath(string.IsNullOrWhiteSpace(repositoryRoot) ? "." : repositoryRoot);
        _indexProbe = new SemanticSearchIndexProbe(
            conversationStatePath,
            fileExists,
            commandAvailable,
            sqliteRunner
        );
        _localLlmDiscoveryService = localLlmDiscoveryService ?? new LocalLlmDiscoveryService();
        _utcNow = utcNow ?? (() => DateTimeOffset.UtcNow);
    }

    public async Task<SemanticSearchReadinessSnapshot> GetSnapshotAsync(CancellationToken cancellationToken)
    {
        var warnings = new List<string>();
        var checks = new List<SemanticSearchReadinessCheck>();
        var index = _indexProbe.GetSnapshot(checks, warnings);
        var embedding = await SemanticSearchEmbeddingPolicy
            .BuildSnapshotAsync(_localLlmDiscoveryService, warnings, cancellationToken)
            .ConfigureAwait(false);

        SemanticSearchEmbeddingPolicy.AddChecks(checks, embedding);
        checks.Add(new SemanticSearchReadinessCheck(
            "code_search_strategy",
            "ok",
            "code search remains FTS5(BM25) plus structure-aware chunking/repomap"
        ));
        checks.Add(new SemanticSearchReadinessCheck(
            "vector_indexing",
            "skipped",
            "embedding generation and vector indexing are not enabled by this endpoint"
        ));

        var prerequisitesReady = index.FtsAvailable
            && index.SqliteVecAvailable
            && embedding.CandidateModelAvailable;
        var status = index.FtsAvailable
            ? prerequisitesReady ? "semantic_prerequisites_ready" : "fts_ast_primary"
            : "blocked";

        return new SemanticSearchReadinessSnapshot(
            status,
            Mode: prerequisitesReady ? "natural_language_semantic_optional" : "fts_ast_primary",
            ReadOnly: true,
            VectorSearchEnabled: false,
            EmbeddingGenerationEnabled: false,
            CodeSearchRecommended: true,
            _repositoryRoot,
            _indexProbe.DbPath,
            index,
            embedding,
            checks,
            BuildRecommendations(index, embedding),
            BuildSkippedOperations(),
            warnings.Distinct(StringComparer.Ordinal).ToArray(),
            _utcNow()
        );
    }

    private static IReadOnlyList<SemanticSearchRecommendation> BuildRecommendations(
        SemanticSearchIndexSnapshot index,
        SemanticSearchEmbeddingSnapshot embedding
    )
    {
        var recommendations = new List<SemanticSearchRecommendation>
        {
            new(
                "code_search",
                "high",
                "코드 검색은 기존 FTS5(BM25)와 구조 인식 청킹/Repomap 경로를 기본값으로 유지한다."
            )
        };

        if (!index.FtsAvailable)
        {
            recommendations.Add(new SemanticSearchRecommendation(
                "memory_index",
                "high",
                "메모리 인덱스 rebuild 또는 sqlite3/FTS 상태 확인이 먼저 필요하다."
            ));
        }

        if (embedding.CandidateModelAvailable && !index.SqliteVecAvailable)
        {
            recommendations.Add(new SemanticSearchRecommendation(
                "natural_language_search",
                "medium",
                "로컬 임베딩 모델 후보는 있지만 sqlite-vec이 없어 벡터 검색을 켜지 않는다."
            ));
        }

        if (!embedding.CandidateModelAvailable)
        {
            recommendations.Add(new SemanticSearchRecommendation(
                "local_embedding_model",
                "low",
                "자연어 대화/기획 문서 검색이 필요해질 때만 nomic-embed-text, mxbai-embed-large 같은 로컬 embedding 모델을 준비한다."
            ));
        }

        if (index.SqliteVecAvailable && embedding.CandidateModelAvailable)
        {
            recommendations.Add(new SemanticSearchRecommendation(
                "natural_language_search",
                "medium",
                "시맨틱 검색 선행 조건은 보이지만, 대량 임베딩 생성과 DB schema 변경은 별도 승인 플로우에서만 진행한다."
            ));
        }

        return recommendations;
    }

    private static IReadOnlyList<string> BuildSkippedOperations()
    {
        return new[]
        {
            "embedding_generation",
            "bulk_reindex",
            "sqlite_vec_schema_migration",
            "vector_similarity_query",
            "code_search_semantic_rerank"
        };
    }
}
