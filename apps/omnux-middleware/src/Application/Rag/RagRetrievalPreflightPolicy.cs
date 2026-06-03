using System.Text.RegularExpressions;

namespace Omnux.Middleware;

internal sealed partial class RagRetrievalPreflightPolicy
{
    private const int QueryPreviewMaxChars = 240;
    private readonly Func<DateTimeOffset> _utcNow;

    public RagRetrievalPreflightPolicy(Func<DateTimeOffset>? utcNow = null)
    {
        _utcNow = utcNow ?? (() => DateTimeOffset.UtcNow);
    }

    public RagRetrievalPreflightSnapshot Evaluate(string? query)
    {
        var normalized = NormalizeQuery(query);
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return BuildSnapshot(
                "no_input",
                string.Empty,
                RetrievalRecommended: false,
                "none",
                Array.Empty<RagRetrievalCandidate>(),
                new[] { "empty_input" }
            );
        }

        var signals = DetectSignals(normalized);
        if (LooksLikeSmallTalkOnly(normalized))
        {
            return BuildSnapshot(
                "no_retrieval",
                normalized,
                RetrievalRecommended: false,
                "none",
                BuildCandidates(normalized, signals, forceNoRetrieval: true),
                signals
            );
        }

        var candidates = BuildCandidates(normalized, signals, forceNoRetrieval: false);
        var recommended = candidates.Where(candidate => candidate.Recommended).ToArray();
        var primary = ResolvePrimaryStrategy(recommended);
        return BuildSnapshot(
            recommended.Length == 0 ? "no_retrieval" : "retrieval_recommended",
            normalized,
            recommended.Length > 0,
            primary,
            candidates,
            signals
        );
    }

    private RagRetrievalPreflightSnapshot BuildSnapshot(
        string status,
        string query,
        bool RetrievalRecommended,
        string primaryStrategy,
        IReadOnlyList<RagRetrievalCandidate> candidates,
        IReadOnlyList<string> signals
    )
    {
        return new RagRetrievalPreflightSnapshot(
            status,
            Truncate(query, QueryPreviewMaxChars),
            ReadOnly: true,
            RetrievalRecommended,
            primaryStrategy,
            candidates,
            signals,
            new[]
            {
                "llm_self_rag_judge",
                "automatic_memory_search",
                "automatic_code_search",
                "automatic_web_search",
                "retrieved_context_prompt_injection"
            },
            _utcNow()
        );
    }

    private static IReadOnlyList<RagRetrievalCandidate> BuildCandidates(
        string query,
        IReadOnlyList<string> signals,
        bool forceNoRetrieval
    )
    {
        if (forceNoRetrieval)
        {
            return new[]
            {
                new RagRetrievalCandidate(
                    "none",
                    "high",
                    Recommended: true,
                    "입력이 짧은 인사/감사/잡담으로 보여 외부 컨텍스트를 붙이지 않는다.",
                    string.Empty
                )
            };
        }

        var candidates = new List<RagRetrievalCandidate>();
        if (signals.Contains("current_or_fresh"))
        {
            candidates.Add(new RagRetrievalCandidate(
                "web",
                "high",
                Recommended: true,
                "최신성/현재성 단서가 있어 웹 검색이나 URL context 확인이 필요할 수 있다.",
                "web_search"
            ));
        }

        if (signals.Contains("url"))
        {
            candidates.Add(new RagRetrievalCandidate(
                "web",
                "high",
                Recommended: true,
                "입력에 URL이 포함되어 URL fetch/context 경로가 우선이다.",
                "web_fetch"
            ));
        }

        if (signals.Contains("code_or_file"))
        {
            candidates.Add(new RagRetrievalCandidate(
                "code",
                "high",
                Recommended: true,
                "파일/함수/에러/구현 단서가 있어 코드 인덱스와 repomap 조회가 유효하다.",
                "memory_search"
            ));
            candidates.Add(new RagRetrievalCandidate(
                "repomap",
                "medium",
                Recommended: true,
                "코드 구조 파악이 필요하면 symbol map을 함께 조회한다.",
                "code_repomap_snapshot_get"
            ));
        }

        if (signals.Contains("memory_or_history"))
        {
            candidates.Add(new RagRetrievalCandidate(
                "memory",
                "high",
                Recommended: true,
                "과거 대화/결정/노트 단서가 있어 memory search가 필요할 수 있다.",
                "memory_search"
            ));
        }

        if (signals.Contains("session_or_agent"))
        {
            candidates.Add(new RagRetrievalCandidate(
                "session",
                "medium",
                Recommended: true,
                "세션/에이전트/실패 로그 단서가 있어 session replay나 agent trace 조회가 유효하다.",
                "session_replay_get"
            ));
        }

        if (candidates.Count == 0 && IsLongAnalyticalQuery(query))
        {
            candidates.Add(new RagRetrievalCandidate(
                "memory",
                "low",
                Recommended: true,
                "질문이 길고 맥락 의존 가능성이 있어 memory search를 약하게 권장한다.",
                "memory_search"
            ));
        }

        return candidates.Count == 0
            ? new[]
            {
                new RagRetrievalCandidate(
                    "none",
                    "medium",
                    Recommended: true,
                    "현재 입력만으로 답변 가능한 요청으로 판단된다.",
                    string.Empty
                )
            }
            : candidates;
    }

    private static IReadOnlyList<string> DetectSignals(string query)
    {
        var signals = new List<string>();
        if (UrlRegex().IsMatch(query))
        {
            signals.Add("url");
        }

        if (ContainsAny(query, CurrentKeywords))
        {
            signals.Add("current_or_fresh");
        }

        if (CodeFileRegex().IsMatch(query) || ContainsAny(query, CodeKeywords))
        {
            signals.Add("code_or_file");
        }

        if (ContainsAny(query, MemoryKeywords))
        {
            signals.Add("memory_or_history");
        }

        if (ContainsAny(query, SessionKeywords))
        {
            signals.Add("session_or_agent");
        }

        return signals.Distinct(StringComparer.Ordinal).ToArray();
    }

    private static string ResolvePrimaryStrategy(IReadOnlyList<RagRetrievalCandidate> recommended)
    {
        if (recommended.Count == 0)
        {
            return "none";
        }

        var kinds = recommended
            .Where(candidate => candidate.Kind != "none")
            .Select(candidate => candidate.Kind)
            .Distinct(StringComparer.Ordinal)
            .ToArray();
        if (kinds.Length == 0)
        {
            return "none";
        }

        if (kinds.Length > 1)
        {
            return "hybrid";
        }

        return kinds[0];
    }

    private static bool LooksLikeSmallTalkOnly(string query)
    {
        var normalized = query.Trim().ToLowerInvariant();
        if (normalized.Length > 40)
        {
            return false;
        }

        return SmallTalkKeywords.Any(keyword => normalized.Equals(keyword, StringComparison.OrdinalIgnoreCase)
            || normalized.Contains(keyword, StringComparison.OrdinalIgnoreCase));
    }

    private static bool IsLongAnalyticalQuery(string query)
    {
        return query.Length >= 180
            || query.Count(char.IsWhiteSpace) >= 24;
    }

    private static bool ContainsAny(string query, IReadOnlyList<string> keywords)
    {
        return keywords.Any(keyword => query.Contains(keyword, StringComparison.OrdinalIgnoreCase));
    }

    private static string NormalizeQuery(string? query)
    {
        return (query ?? string.Empty)
            .Replace("\r\n", "\n", StringComparison.Ordinal)
            .Replace('\r', '\n')
            .Trim();
    }

    private static string Truncate(string value, int maxChars)
    {
        return value.Length <= maxChars ? value : value[..maxChars] + "...";
    }

    private static readonly string[] CurrentKeywords =
    {
        "latest", "recent", "today", "now", "current", "news", "price", "schedule", "2026",
        "최신", "최근", "오늘", "지금", "현재", "뉴스", "가격", "일정"
    };

    private static readonly string[] CodeKeywords =
    {
        "code", "class", "function", "method", "build", "compile", "stack trace", "exception", "error",
        "구현", "코드", "함수", "클래스", "메서드", "파일", "빌드", "컴파일", "스택", "예외", "에러", "오류"
    };

    private static readonly string[] MemoryKeywords =
    {
        "remember", "previous", "earlier", "decision", "note", "handoff", "plan",
        "기억", "이전", "전에", "지난", "결정", "노트", "메모", "핸드오프", "계획"
    };

    private static readonly string[] SessionKeywords =
    {
        "session", "agent", "trace", "replay", "timeline", "log", "failed", "failure",
        "세션", "에이전트", "트레이스", "리플레이", "타임라인", "로그", "실패"
    };

    private static readonly string[] SmallTalkKeywords =
    {
        "hi", "hello", "thanks", "thank you", "ok", "okay",
        "안녕", "고마워", "감사", "오케이", "ㅇㅋ"
    };

    [GeneratedRegex(@"https?://\S+", RegexOptions.IgnoreCase)]
    private static partial Regex UrlRegex();

    [GeneratedRegex(@"\b[\w./-]+\.(cs|ts|tsx|js|mjs|py|md|json|csproj|sln)\b", RegexOptions.IgnoreCase)]
    private static partial Regex CodeFileRegex();
}
