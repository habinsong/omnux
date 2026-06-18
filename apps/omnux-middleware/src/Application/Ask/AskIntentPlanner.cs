namespace Omnux.Middleware;

/// <summary>fast-web 휴리스틱 결정 — Undecided 면 호출측이 LLM 자가판단으로 이어간다.</summary>
internal enum AskWebIntent
{
    Web,
    NoWeb,
    Undecided
}

/// <summary>
/// 질문(Ask) 입력에 대한 의도 결정 묶음 — 흩어져 있던 자동화 게이트들의 단일 스냅샷.
/// </summary>
internal sealed record AskIntentPlan(
    bool AttemptRetrieval,
    bool SearchConversations,
    bool IncludeProjectOverview,
    bool IncludeNotebookContext,
    AskNotebookAppendRequest? NotebookAppendRequest,
    IReadOnlyList<AskActionSuggestion> ActionSuggestions
)
{
    public static readonly AskIntentPlan Empty = new(
        false,
        false,
        false,
        false,
        null,
        Array.Empty<AskActionSuggestion>()
    );

    public bool HasAnyIntent =>
        AttemptRetrieval
        || SearchConversations
        || IncludeProjectOverview
        || IncludeNotebookContext
        || NotebookAppendRequest != null
        || ActionSuggestions.Count > 0;

    /// <summary>감사로그용 한 줄 요약 — 예: "retrieval+conversations | sugg:routine".</summary>
    public string Summary
    {
        get
        {
            var sources = new List<string>(3);
            if (AttemptRetrieval)
            {
                sources.Add("retrieval");
            }

            if (SearchConversations)
            {
                sources.Add("conversations");
            }

            if (IncludeProjectOverview)
            {
                sources.Add("overview");
            }

            if (IncludeNotebookContext)
            {
                sources.Add("notebook");
            }

            if (NotebookAppendRequest != null)
            {
                sources.Add("notebook_append");
            }

            var left = sources.Count == 0 ? "none" : string.Join("+", sources);
            if (ActionSuggestions.Count == 0)
            {
                return left;
            }

            var kinds = string.Join(",", ActionSuggestions.Select(item => item.Kind));
            return $"{left} | sugg:{kinds}";
        }
    }
}

/// <summary>
/// 질문(Ask) 의도 결정의 단일 지점 (ASK_ORCHESTRATION_PLAN.md P1-1a).
/// v1 은 기존 순수 정책들의 휴리스틱 결합 — 호출측 동작은 바뀌지 않고 결정 위치만 모인다.
/// P1-1b 에서 미결정 영역의 경량 LLM 의도벡터(800ms 타임박스)가 이 안에 추가되고,
/// fast-web 자가판단(DecideNeedWebBySelectedProviderAsync)도 여기로 흡수된다.
/// </summary>
internal static class AskIntentPlanner
{
    /// <summary>
    /// fast-web 휴리스틱 3종 결정 (P1-1b — Chat 경로에서 이동). webLookupInput 은
    /// 후속질문 맥락이 확장된 입력이어야 한다. Undecided 면 호출측이 선택 provider
    /// 의 LLM 자가판단(DecideNeedWebBySelectedProviderAsync)으로 이어간다.
    /// </summary>
    public static (AskWebIntent Intent, string DecisionPath) ResolveWebIntentHeuristic(string? webLookupInput)
    {
        var normalized = (webLookupInput ?? string.Empty).Trim();
        if (normalized.Length == 0)
        {
            return (AskWebIntent.NoWeb, "heuristic_no_web");
        }

        if (SearchQueryPolicy.LooksLikeExplicitWebLookupQuestion(normalized))
        {
            return (AskWebIntent.Web, "heuristic_explicit_web");
        }

        if (SearchQueryPolicy.LooksLikeRealtimeQuestion(normalized))
        {
            return (AskWebIntent.Web, "heuristic_web");
        }

        if (SearchQueryPolicy.LooksLikeClearlyNonWebQuestion(normalized))
        {
            return (AskWebIntent.NoWeb, "heuristic_no_web");
        }

        return (AskWebIntent.Undecided, "llm");
    }

    public static AskIntentPlan Plan(string? rawInput)
    {
        var normalized = (rawInput ?? string.Empty).Trim();
        if (normalized.Length == 0)
        {
            return AskIntentPlan.Empty;
        }

        AskNotebookPolicy.TryBuildAppendRequest(normalized, out var notebookAppendRequest);
        var includeNotebookContext =
            notebookAppendRequest == null
            && !AskAutoRetrievalPolicy.IsDisabledByEnv()
            && AskNotebookPolicy.ShouldRetrieve(normalized);
        var attemptRetrieval =
            !AskAutoRetrievalPolicy.IsDisabledByEnv()
            && (AskAutoRetrievalPolicy.ShouldAttempt(normalized) || includeNotebookContext);
        return new AskIntentPlan(
            attemptRetrieval,
            attemptRetrieval && AskAutoRetrievalPolicy.ShouldSearchConversations(normalized),
            attemptRetrieval && AskAutoRetrievalPolicy.ShouldIncludeProjectOverview(normalized),
            includeNotebookContext,
            notebookAppendRequest,
            AskActionSuggestionPolicy.Detect(normalized)
        );
    }
}
