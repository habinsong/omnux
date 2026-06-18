using System.Diagnostics;

namespace Omnux.Middleware;

public sealed partial class CommandService
{
    internal sealed record AskAutoRetrievalOutcome(string? Block, string? RouteLabel)
    {
        public static readonly AskAutoRetrievalOutcome Empty = new(null, null);
    }

    private static readonly object ProjectOverviewCacheLock = new();
    private static (DateTimeOffset At, string? Block)? _projectOverviewCache;

    /// <summary>
    /// 프로젝트 개요 블록(5분 TTL 캐시) — context_scan 과 동일한 스냅샷을 BuildPromptContext
    /// 로 요약해 [자동 참조 자료] 엔트리 형식으로 만든다. 실패 시 null(합류 생략).
    /// </summary>
    private string? GetProjectOverviewBlockCached()
    {
        lock (ProjectOverviewCacheLock)
        {
            if (_projectOverviewCache is { } cached
                && DateTimeOffset.UtcNow - cached.At < AskAutoRetrievalPolicy.ProjectOverviewCacheTtl)
            {
                return cached.Block;
            }
        }

        string? block;
        try
        {
            var snapshot = _projectContextLoader.LoadSnapshot();
            var summary = _projectContextLoader.BuildPromptContext(
                snapshot,
                AskAutoRetrievalPolicy.ProjectOverviewMaxChars
            );
            block = string.IsNullOrWhiteSpace(summary)
                ? null
                : $"### project:overview\n{summary.Trim()}";
        }
        catch
        {
            block = null;
        }

        lock (ProjectOverviewCacheLock)
        {
            _projectOverviewCache = (DateTimeOffset.UtcNow, block);
        }

        return block;
    }

    /// <summary>단일 채팅 Route 배지 — 자동 스킬(P0-5)과 자동 회수(P0-1/8) 라벨을 결합.</summary>
    private static string BuildSingleChatRouteLabel(string? autoSelectedSkillName, string? retrievalLabel)
    {
        var parts = new List<string>(2);
        if (!string.IsNullOrWhiteSpace(autoSelectedSkillName))
        {
            parts.Add($"skill:{autoSelectedSkillName}(auto)");
        }

        if (!string.IsNullOrWhiteSpace(retrievalLabel))
        {
            parts.Add(retrievalLabel);
        }

        return parts.Count == 0 ? string.Empty : string.Join(" · ", parts);
    }

    /// <summary>
    /// 프롬프트만으로 공유 메모리를 자동 검색해 BuildContextualInput 에 합류할
    /// [자동 참조 자료] 블록을 만든다 (ASK_ORCHESTRATION_PLAN.md P0-1/P0-2).
    /// 로컬 SQLite FTS 라 보통 수십 ms 지만, 어떤 실패/지연도 답변을 막지 않도록
    /// 타임박스(1.2s) 초과·오류 시 빈 결과로 통과시킨다(현행 동작과 동일).
    /// </summary>
    private async Task<AskAutoRetrievalOutcome> TryBuildAutoRetrievalBlockAsync(
        string rawInput,
        IReadOnlyList<string>? linkedMemoryNotes,
        string source,
        string? currentConversationId,
        string? projectKey,
        AskIntentPlan plan,
        CancellationToken cancellationToken
    )
    {
        if (!plan.AttemptRetrieval)
        {
            return AskAutoRetrievalOutcome.Empty;
        }

        var query = AskAutoRetrievalPolicy.BuildQuery(rawInput);
        if (string.IsNullOrWhiteSpace(query))
        {
            return AskAutoRetrievalOutcome.Empty;
        }

        var searchConversations = plan.SearchConversations;
        var stopwatch = Stopwatch.StartNew();
        try
        {
            // 검색은 동기 SQLite/파일 호출 — 취소돼도 결과만 버리면 안전하므로 풀 스레드에서
            // 병렬로 돌리고 공용 시간 예산(1.2s)만 기다린다.
            var memoryTask = Task.Run(
                () => _memorySearchTool.Search(
                    query,
                    AskAutoRetrievalPolicy.SearchMaxResults,
                    AskAutoRetrievalPolicy.SearchMinScore
                ),
                CancellationToken.None
            );
            // P1-3 보강: 막 적재된 노트는 FTS 인덱스(부팅 풀 sync 경합)에 없을 수 있어
            // 노트 폴더를 직접 스캔해 병합한다(수십 개 수준 → 수 ms, 신선도 100%).
            var noteScanTask = Task.Run(
                () => AskAutoRetrievalPolicy.ScanMemoryNotesDirect(
                    _memoryNoteStore.List(),
                    rawInput,
                    linkedMemoryNotes
                ),
                CancellationToken.None
            );
            // P0-8: "지난번/저번에 …" 회고 어휘가 있을 때만 과거 대화도 검색.
            // 공용 conversation_search(FTS+인덱스 sync) 대신 스토어 인메모리 직접 스캔 —
            // 104KB 수준 저장소라 수 ms 로 끝나 1.2s 예산 문제를 구조적으로 없앤다.
            var conversationTask = searchConversations
                ? Task.Run(() => _conversationStore.ListAllViews(), CancellationToken.None)
                : null;

            // P0-3: "이 프로젝트 구조/등록된 스킬" 류 구조형 자기참조 질문이면 context_scan
            // 스냅샷 요약(5분 캐시)을 합류한다 — 파일 내용 키워드 검색으로는 안 잡히는 영역.
            var includeProjectOverview = plan.IncludeProjectOverview;
            var projectOverviewTask = includeProjectOverview
                ? Task.Run(() => GetProjectOverviewBlockCached(), CancellationToken.None)
                : null;
            var notebookTask = plan.IncludeNotebookContext
                ? Task.Run(
                    () =>
                    {
                        var context = _notebookService.BuildContextBlock(projectKey, 1800);
                        return string.IsNullOrWhiteSpace(context)
                            ? null
                            : $"### notebook:current\n{context.Trim()}";
                    },
                    CancellationToken.None
                )
                : null;

            var pendingTasks = new List<Task>(5) { memoryTask, noteScanTask };
            if (conversationTask != null)
            {
                pendingTasks.Add(conversationTask);
            }

            if (projectOverviewTask != null)
            {
                pendingTasks.Add(projectOverviewTask);
            }

            if (notebookTask != null)
            {
                pendingTasks.Add(notebookTask);
            }

            var pending = Task.WhenAll(pendingTasks);
            await Task.WhenAny(
                pending,
                Task.Delay(AskAutoRetrievalPolicy.TimeBudgetMs, cancellationToken)
            ).ConfigureAwait(false);

            // 부분 수확: 예산 안에 끝난 소스만 합류한다. 대화 검색(콜드 시 느릴 수 있음)이
            // 늦어도 메모리 결과는 버리지 않는다. 미완 태스크는 자연 종료되며 결과만 무시.
            var timedOutSources = new List<string>(2);
            string? memoryBlock = null;
            var memoryCount = 0;
            string? memoryRouteLabel = null;
            var directNoteHits = noteScanTask.IsCompletedSuccessfully
                ? noteScanTask.Result
                : Array.Empty<MemorySearchCitationResult>();
            if (memoryTask.IsCompletedSuccessfully)
            {
                var memoryResult = memoryTask.Result;
                var combinedHits = directNoteHits.Count == 0
                    ? memoryResult.Results
                    : directNoteHits.Concat(memoryResult.Results).ToArray();
                if (combinedHits.Count > 0
                    && (directNoteHits.Count > 0
                        || (!memoryResult.Disabled && string.IsNullOrWhiteSpace(memoryResult.Error))))
                {
                    (memoryBlock, memoryCount, memoryRouteLabel) =
                        AskAutoRetrievalPolicy.FormatBlock(combinedHits, linkedMemoryNotes);
                }
            }
            else if (directNoteHits.Count > 0)
            {
                (memoryBlock, memoryCount, memoryRouteLabel) =
                    AskAutoRetrievalPolicy.FormatBlock(directNoteHits, linkedMemoryNotes);
            }
            else if (!memoryTask.IsCompleted)
            {
                timedOutSources.Add("memory");
            }

            string? conversationBlock = null;
            var conversationCount = 0;
            if (conversationTask != null)
            {
                if (conversationTask.IsCompletedSuccessfully)
                {
                    (conversationBlock, conversationCount) = AskAutoRetrievalPolicy.SearchAndFormatConversationViews(
                        conversationTask.Result,
                        rawInput,
                        currentConversationId
                    );
                }
                else if (!conversationTask.IsCompleted)
                {
                    timedOutSources.Add("conversations");
                }
            }

            if (timedOutSources.Count > 0)
            {
                _auditLogger.Log(
                    source,
                    "ask_auto_retrieval",
                    "partial_timeout",
                    $"budgetMs={AskAutoRetrievalPolicy.TimeBudgetMs} timedOut={string.Join("+", timedOutSources)}"
                );
            }

            string? projectOverviewBlock = null;
            if (projectOverviewTask != null)
            {
                if (projectOverviewTask.IsCompletedSuccessfully)
                {
                    projectOverviewBlock = projectOverviewTask.Result;
                }
                else if (!projectOverviewTask.IsCompleted)
                {
                    timedOutSources.Add("project_overview");
                }
            }

            string? notebookBlock = null;
            if (notebookTask != null)
            {
                if (notebookTask.IsCompletedSuccessfully)
                {
                    notebookBlock = notebookTask.Result;
                }
                else if (!notebookTask.IsCompleted)
                {
                    timedOutSources.Add("notebook");
                }
            }

            var (block, routeLabel) = AskAutoRetrievalPolicy.Combine(
                memoryBlock,
                memoryCount,
                memoryRouteLabel,
                conversationBlock,
                conversationCount,
                projectOverviewBlock,
                notebookBlock
            );
            if (block == null)
            {
                _auditLogger.Log(
                    source,
                    "ask_auto_retrieval",
                    "empty",
                    $"elapsedMs={stopwatch.ElapsedMilliseconds} conversations={(searchConversations ? "searched" : "skipped")}"
                );
                return AskAutoRetrievalOutcome.Empty;
            }

            _auditLogger.Log(
                source,
                "ask_auto_retrieval",
                "ok",
                $"elapsedMs={stopwatch.ElapsedMilliseconds} memory={memoryCount} conversations={conversationCount} label={routeLabel}"
            );
            return new AskAutoRetrievalOutcome(block, routeLabel);
        }
        catch (Exception ex)
        {
            _auditLogger.Log(
                source,
                "ask_auto_retrieval",
                "exception",
                $"elapsedMs={stopwatch.ElapsedMilliseconds} message={ex.Message}"
            );
            return AskAutoRetrievalOutcome.Empty;
        }
    }
}
