using System.Text;
using System.Text.RegularExpressions;

namespace Omnux.Middleware;

/// <summary>
/// 질문(Ask) 채팅에서 프롬프트만으로 공유 메모리를 자동 검색해 컨텍스트로 합류시키기 위한
/// 순수 정책. 게이트(시도 여부)·쿼리 정규화·결과 블록 포맷만 담당하고 I/O 는 하지 않는다.
/// 실행(검색 호출·타임박스·감사로그)은 CommandService.AskRetrieval 파셜이 담당한다.
/// (ASK_ORCHESTRATION_PLAN.md P0-1/P0-2)
/// </summary>
internal static class AskAutoRetrievalPolicy
{
    public const int SearchMaxResults = 4;
    public const double SearchMinScore = 0.45d;
    public const int TimeBudgetMs = 1200;
    public const int MaxHitsInBlock = 3;
    public const int PerSnippetMaxChars = 480;
    public const int TotalBlockMaxChars = 1600;
    public const int MinInputLength = 8;
    public const int QueryMaxChars = 240;
    public const int ConversationMaxHits = 2;
    public const int ConversationSnippetMaxChars = 360;
    public const int ProjectOverviewMaxChars = 1400;
    public static readonly TimeSpan ProjectOverviewCacheTtl = TimeSpan.FromMinutes(5);

    // "이 프로젝트 구조/등록된 스킬/지침" 류 구조형 자기참조 질문 — 파일 내용 키워드 검색(P0-1)
    // 으로는 안 잡혀서 context_scan 스냅샷 요약을 합류시킨다 (P0-3).
    private static readonly Regex ProjectOverviewRegex = new(
        @"((이|우리|현재|이번|내)\s*(프로젝트|레포|저장소|코드베이스|워크스페이스)|프로젝트\s*(구조|개요|루트|설정|셋업)|코드베이스\s*(구조|개요)?|(무슨|어떤|등록된|사용\s*가능한?|쓸\s*수\s*있는)\s*(스킬|커맨드|명령어|지침|instruction)|(스킬|커맨드|명령어)\s*(목록|리스트|뭐(가|들)?\s*있)|AGENTS\.?md)",
        RegexOptions.Compiled | RegexOptions.CultureInvariant | RegexOptions.IgnoreCase
    );

    private const string DisableEnvName = "OMNUX_ASK_AUTO_RETRIEVAL";

    // "지난번/저번/예전에 물어본 …" 류 회고 어휘 — 이때만 과거 대화를 검색한다 (P0-8).
    private static readonly Regex RetrospectiveRegex = new(
        @"(지난\s*번|저번에?|예전에|요전에|이전\s*(대화|채팅|질문|세션)|그때\s*(말한|말했|물어본|얘기한|정한)|전에\s*(말한|말했|물어봤|얘기했|정한)|아까\s*(말한|물어본|얘기한))",
        RegexOptions.Compiled | RegexOptions.CultureInvariant
    );

    private static readonly Regex UrlRegex = new(
        @"https?://[^\s<>\""]+",
        RegexOptions.Compiled | RegexOptions.CultureInvariant | RegexOptions.IgnoreCase
    );

    private static readonly Regex WhitespaceRegex = new(
        @"\s+",
        RegexOptions.Compiled | RegexOptions.CultureInvariant
    );

    public static bool IsDisabledByEnv()
    {
        return IsDisabledValue(Environment.GetEnvironmentVariable(DisableEnvName));
    }

    /// <summary>기본 on — "0"/"false"/"off"/"no" 일 때만 비활성.</summary>
    public static bool IsDisabledValue(string? raw)
    {
        var normalized = (raw ?? string.Empty).Trim();
        return normalized.Equals("0", StringComparison.Ordinal)
            || normalized.Equals("false", StringComparison.OrdinalIgnoreCase)
            || normalized.Equals("off", StringComparison.OrdinalIgnoreCase)
            || normalized.Equals("no", StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// 메모리 자동 검색을 시도할 입력인지. 짧은 후속질문("왜?")은 대화 히스토리가 담당하고,
    /// 인사·슬래시 명령·URL 단독 입력은 메모리와 무관하므로 제외한다.
    /// </summary>
    public static bool ShouldAttempt(string? input)
    {
        var normalized = (input ?? string.Empty).Trim();
        if (normalized.Length < MinInputLength)
        {
            return false;
        }

        if (normalized.StartsWith("/", StringComparison.Ordinal))
        {
            return false;
        }

        if (SearchQueryPolicy.LooksLikeStandaloneFreshGreeting(normalized))
        {
            return false;
        }

        var withoutUrls = UrlRegex.Replace(normalized, " ").Trim();
        if (withoutUrls.Length < MinInputLength)
        {
            return false;
        }

        return true;
    }

    /// <summary>검색 쿼리 정규화 — URL 제거, 공백 정리, 길이 캡.</summary>
    public static string BuildQuery(string input)
    {
        var withoutUrls = UrlRegex.Replace(input ?? string.Empty, " ");
        var collapsed = WhitespaceRegex.Replace(withoutUrls, " ").Trim();
        return collapsed.Length <= QueryMaxChars ? collapsed : collapsed[..QueryMaxChars];
    }

    /// <summary>메모리 노트 경로에서 dedupe 용 노트명(파일명, 확장자 제거)을 얻는다.</summary>
    public static string ResolveNoteNameFromPath(string? path)
    {
        var normalized = (path ?? string.Empty).Trim();
        if (normalized.Length == 0)
        {
            return string.Empty;
        }

        var fileName = normalized
            .Replace('\\', '/')
            .Split('/', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .LastOrDefault() ?? string.Empty;
        var dotIndex = fileName.LastIndexOf('.');
        return dotIndex > 0 ? fileName[..dotIndex] : fileName;
    }

    /// <summary>내부 프롬프트/마커 정의 텍스트 감지 — 비-memory 소스 회수에서 제외용.</summary>
    public static bool LooksLikeInternalPromptSnippet(string? snippet)
    {
        var normalized = snippet ?? string.Empty;
        return normalized.Contains("[컨텍스트 사용 규칙]", StringComparison.Ordinal)
            || normalized.Contains("[자동 참조 자료]", StringComparison.Ordinal)
            || normalized.Contains("[새 요청]", StringComparison.Ordinal)
            || normalized.Contains("[공유 메모리 노트]", StringComparison.Ordinal)
            || normalized.Contains("내부 마커", StringComparison.Ordinal);
    }

    /// <summary>참조 라벨용 경로 축약 — 마지막 3세그먼트만 남긴다 (코드 경로 가독성).</summary>
    public static string ShortenPathForLabel(string? path)
    {
        var normalized = (path ?? string.Empty).Trim().Replace('\\', '/');
        if (normalized.Length == 0)
        {
            return string.Empty;
        }

        var segments = normalized.Split('/', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        return segments.Length <= 3 ? string.Join('/', segments) : string.Join('/', segments[^3..]);
    }

    /// <summary>
    /// 검색 결과를 [자동 참조 자료] 본문 블록으로 포맷. 인덱스 소스는 memory(노트)·project(워크
    /// 스페이스 코드)·sessions(과거 세션) — 라벨에 소스를 그대로 표기한다. 이미 대화에 링크된
    /// 메모리 노트는 [공유 메모리 노트] 섹션이 전문을 싣고 있으므로 memory 소스만 중복 제거한다.
    /// </summary>
    public static (string? Block, int UsedCount, string? RouteLabel) FormatBlock(
        IReadOnlyList<MemorySearchCitationResult>? hits,
        IReadOnlyList<string>? linkedNoteNames
    )
    {
        if (hits == null || hits.Count == 0)
        {
            return (null, 0, null);
        }

        var linked = new HashSet<string>(
            (linkedNoteNames ?? Array.Empty<string>())
                .Where(name => !string.IsNullOrWhiteSpace(name))
                .Select(name => name.Trim()),
            StringComparer.OrdinalIgnoreCase
        );

        var seenPaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var sourceCounts = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        var builder = new StringBuilder();
        var used = 0;
        foreach (var hit in hits.OrderByDescending(item => item.Score))
        {
            if (used >= MaxHitsInBlock)
            {
                break;
            }

            var path = (hit.Path ?? string.Empty).Trim();
            var snippet = (hit.Snippet ?? string.Empty).Trim();
            if (snippet.Length == 0 || !seenPaths.Add(path))
            {
                continue;
            }

            var source = string.IsNullOrWhiteSpace(hit.Source) ? "memory" : hit.Source.Trim().ToLowerInvariant();
            if (source == "memory")
            {
                var noteName = ResolveNoteNameFromPath(path);
                if (noteName.Length > 0 && linked.Contains(noteName))
                {
                    continue;
                }
            }
            else if (LooksLikeInternalPromptSnippet(snippet))
            {
                // 우리 내부 프롬프트/마커 정의 코드가 회수되면 모델이 그것을
                // "사용자 규칙"으로 오인해 답을 오염시킨다 — 비-memory 소스에서 제외.
                continue;
            }

            if (snippet.Length > PerSnippetMaxChars)
            {
                snippet = snippet[..PerSnippetMaxChars] + "\n...(truncated)";
            }

            var label = ShortenPathForLabel(path);
            var entry = $"### {source}:{label} (score {hit.Score:0.00})\n{snippet}";
            if (builder.Length + entry.Length + 2 > TotalBlockMaxChars)
            {
                break;
            }

            if (builder.Length > 0)
            {
                builder.AppendLine();
                builder.AppendLine();
            }

            builder.Append(entry);
            sourceCounts[source] = sourceCounts.GetValueOrDefault(source) + 1;
            used += 1;
        }

        if (used == 0)
        {
            return (null, 0, null);
        }

        // 배지용 짧은 라벨: 단일 소스면 "project 2", 혼합이면 "참조 3".
        var routeLabel = sourceCounts.Count == 1
            ? $"{sourceCounts.Keys.First()} {used}"
            : $"참조 {used}";
        return (builder.ToString(), used, routeLabel);
    }

    // 대화 검색 쿼리에서 빼야 하는 회고/의문/요청 표현 — 검색 신호가 아니라 매칭만 죽인다.
    private static readonly Regex ConversationQueryNoiseRegex = new(
        @"(지난\s*번에?|저번에?|예전에|요전에|이전\s*(대화|채팅|질문|세션)(에서|의)?|그때|전에|아까|물어봤?던?|말했?던?|얘기했?던?|정했?던?|결론(이|은)?|뭐였(지|더라|어)\??|뭐(야|지)\??|어떻게|어땠(지|어)\??|알려줘|보여줘|설명해줘|다시|좀)",
        RegexOptions.Compiled | RegexOptions.CultureInvariant
    );

    /// <summary>
    /// 대화 검색용 쿼리 — 회고/의문 표현을 걷어내 핵심 키워드만 남긴다.
    /// (인메모리 대화 검색이 "쿼리 전체 부분문자열" 매칭이라 문장형 쿼리는 항상 0건이 된다.)
    /// </summary>
    public static string BuildConversationQuery(string? input)
    {
        var stripped = ConversationQueryNoiseRegex.Replace(input ?? string.Empty, " ");
        return BuildQuery(stripped);
    }

    /// <summary>
    /// 정리된 쿼리로도 0건일 때 토큰 단위로 재시도할 후보 — 길이 내림차순 상위 4개.
    /// </summary>
    public static IReadOnlyList<string> EnumerateConversationFallbackTokens(string? query)
    {
        var normalized = (query ?? string.Empty).Trim();
        if (normalized.Length == 0)
        {
            return Array.Empty<string>();
        }

        return TokenizeForFallback(normalized)
            .Where(token => token.Length >= 2)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderByDescending(token => token.Length)
            .Take(4)
            .ToArray();
    }

    private static IEnumerable<string> TokenizeForFallback(string value)
    {
        return Regex.Matches(value, @"[\p{L}\p{N}]+", RegexOptions.CultureInvariant)
            .Select(match => match.Value);
    }

    /// <summary>
    /// 대화 스토어 뷰를 직접 토큰 OR 매칭으로 검색해 블록을 만든다. 공용 conversation_search
    /// 경로(FTS+인덱스 sync)는 콜드/sync 비용이 1.2s 예산을 넘겨서, 104KB 수준의 대화 저장소엔
    /// 인메모리 직접 스캔이 압도적으로 싸고 예측 가능하다.
    /// </summary>
    public static (string? Block, int UsedCount) SearchAndFormatConversationViews(
        IReadOnlyList<ConversationThreadView>? views,
        string? input,
        string? currentConversationId
    )
    {
        if (views == null || views.Count == 0)
        {
            return (null, 0);
        }

        var tokens = EnumerateConversationFallbackTokens(BuildConversationQuery(input));
        if (tokens.Count == 0)
        {
            return (null, 0);
        }

        var current = (currentConversationId ?? string.Empty).Trim();
        var hits = new List<ConversationSearchHit>();
        foreach (var view in views)
        {
            var conversationId = (view.Id ?? string.Empty).Trim();
            if (conversationId.Length == 0
                || conversationId.Equals(current, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            foreach (var message in view.Messages.OrderByDescending(item => item.CreatedUtc))
            {
                var text = message.Text ?? string.Empty;
                if (text.Length == 0)
                {
                    continue;
                }

                var lowered = text.ToLowerInvariant();
                var matchedTokens = tokens.Count(token => lowered.Contains(token.ToLowerInvariant(), StringComparison.Ordinal));
                if (matchedTokens == 0)
                {
                    continue;
                }

                var firstToken = tokens.First(token => lowered.Contains(token.ToLowerInvariant(), StringComparison.Ordinal));
                var index = lowered.IndexOf(firstToken.ToLowerInvariant(), StringComparison.Ordinal);
                var start = Math.Max(0, index - 80);
                var length = Math.Min(text.Length - start, ConversationSnippetMaxChars);
                var snippet = text.Substring(start, length).Trim();
                hits.Add(new ConversationSearchHit(
                    conversationId,
                    view.Title,
                    view.Scope,
                    view.Mode,
                    message.Role,
                    snippet,
                    view.UpdatedUtc,
                    message.CreatedUtc,
                    matchedTokens
                ));
                break;
            }
        }

        var ordered = hits
            .OrderByDescending(hit => hit.Score)
            .ThenByDescending(hit => hit.MessageUtc)
            .ToArray();
        return FormatConversationBlock(ordered, currentConversationId);
    }

    public const int NoteDirectScanMaxHits = 2;

    /// <summary>
    /// 메모리 노트 폴더 직접 스캔 (P1-3 보강) — FTS 인덱스는 부팅 풀 sync 와의 경합으로
    /// 막 생성된 노트를 놓칠 수 있다. 노트는 수십 개 수준이라 이름+발췌 토큰 OR 매칭이
    /// 수 ms 로 끝나며 신선도 100%. 결과는 FTS 히트와 같은 형태로 변환해 병합한다.
    /// </summary>
    public static IReadOnlyList<MemorySearchCitationResult> ScanMemoryNotesDirect(
        IReadOnlyList<MemoryNoteItem>? notes,
        string? input,
        IReadOnlyList<string>? linkedNoteNames
    )
    {
        if (notes == null || notes.Count == 0)
        {
            return Array.Empty<MemorySearchCitationResult>();
        }

        // 대화 스캔과 달리 상위 4개 제한을 쓰지 않는다 — "답변/형식" 같은 핵심 2글자
        // 토큰이 잘리면 노트를 놓친다. 노트는 수십 개 수준이라 토큰 12개도 수 ms.
        var tokens = TokenizeForFallback(BuildConversationQuery(input))
            .Where(token => token.Length >= 2)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(12)
            .ToArray();
        if (tokens.Length == 0)
        {
            return Array.Empty<MemorySearchCitationResult>();
        }

        var linked = new HashSet<string>(
            (linkedNoteNames ?? Array.Empty<string>())
                .Where(name => !string.IsNullOrWhiteSpace(name))
                .Select(name => name.Trim()),
            StringComparer.OrdinalIgnoreCase
        );

        var hits = new List<(MemorySearchCitationResult Hit, int Matched)>();
        foreach (var note in notes)
        {
            var name = (note.Name ?? string.Empty).Trim();
            if (name.Length == 0 || linked.Contains(ResolveNoteNameFromPath(name)))
            {
                continue;
            }

            var haystack = $"{name}\n{note.Excerpt ?? string.Empty}".ToLowerInvariant();
            var matched = tokens.Count(token => haystack.Contains(token.ToLowerInvariant(), StringComparison.Ordinal));
            if (matched == 0)
            {
                continue;
            }

            var snippet = (note.Excerpt ?? string.Empty).Trim();
            if (snippet.Length == 0)
            {
                snippet = name;
            }

            hits.Add((
                new MemorySearchCitationResult(name, 1, 1, snippet, 0.9d + matched * 0.01d, "memory"),
                matched
            ));
        }

        return hits
            .OrderByDescending(item => item.Matched)
            .ThenByDescending(item => item.Hit.Score)
            .Take(NoteDirectScanMaxHits)
            .Select(item => item.Hit)
            .ToArray();
    }

    /// <summary>과거 대화 검색은 회고 어휘가 있을 때만 — 일반 질문에 옛 대화를 끌어오면 노이즈다.</summary>
    public static bool ShouldSearchConversations(string? input)
    {
        var normalized = (input ?? string.Empty).Trim();
        if (normalized.Length < MinInputLength || normalized.StartsWith("/", StringComparison.Ordinal))
        {
            return false;
        }

        return RetrospectiveRegex.IsMatch(normalized);
    }

    /// <summary>과거 대화 히트를 블록으로 포맷 — 현재 대화 제외, 대화당 1건, 상위 2건.</summary>
    public static (string? Block, int UsedCount) FormatConversationBlock(
        IReadOnlyList<ConversationSearchHit>? hits,
        string? currentConversationId
    )
    {
        if (hits == null || hits.Count == 0)
        {
            return (null, 0);
        }

        var current = (currentConversationId ?? string.Empty).Trim();
        var seenConversations = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var builder = new StringBuilder();
        var used = 0;
        foreach (var hit in hits.OrderByDescending(item => item.Score))
        {
            if (used >= ConversationMaxHits)
            {
                break;
            }

            var conversationId = (hit.ConversationId ?? string.Empty).Trim();
            var snippet = (hit.Snippet ?? string.Empty).Trim();
            if (conversationId.Length == 0
                || snippet.Length == 0
                || conversationId.Equals(current, StringComparison.OrdinalIgnoreCase)
                || !seenConversations.Add(conversationId))
            {
                continue;
            }

            if (snippet.Length > ConversationSnippetMaxChars)
            {
                snippet = snippet[..ConversationSnippetMaxChars] + "…";
            }

            var title = string.IsNullOrWhiteSpace(hit.Title) ? "제목 없음" : hit.Title.Trim();
            var entry = $"### conversation:{title} ({hit.MessageUtc:yyyy-MM-dd})\n{snippet}";
            if (builder.Length > 0)
            {
                builder.AppendLine();
                builder.AppendLine();
            }

            builder.Append(entry);
            used += 1;
        }

        return used == 0 ? (null, 0) : (builder.ToString(), used);
    }

    public const int WebContextHintMaxChars = 1000;

    /// <summary>
    /// 웹/URL 경로의 memoryHint 에 자동 회수 블록을 결합한다 (P1-1c).
    /// 가드/인용 파이프라인은 그대로 두고 "웹 경로의 개인 맥락 단절"만 해소 —
    /// 웹 근거가 우선이고 회수 자료는 보조 참고임을 명시한다.
    /// </summary>
    public static string CombineWebContextHint(string? memoryHint, string? retrievalBlock)
    {
        var hint = (memoryHint ?? string.Empty).Trim();
        var block = (retrievalBlock ?? string.Empty).Trim();
        if (block.Length == 0)
        {
            return hint;
        }

        if (block.Length > WebContextHintMaxChars)
        {
            block = block[..WebContextHintMaxChars] + "\n...(truncated)";
        }

        var section = "[사용자 보유 컨텍스트 — 답변에 참고하되 웹 근거를 우선하세요]\n" + block;
        return hint.Length == 0 ? section : $"{hint}\n\n{section}";
    }

    /// <summary>구조형 자기참조 질문 여부 — 프로젝트 개요 스냅샷을 합류할지 결정 (P0-3).</summary>
    public static bool ShouldIncludeProjectOverview(string? input)
    {
        var normalized = (input ?? string.Empty).Trim();
        if (normalized.Length < MinInputLength || normalized.StartsWith("/", StringComparison.Ordinal))
        {
            return false;
        }

        return ProjectOverviewRegex.IsMatch(normalized);
    }

    /// <summary>메모리/프로젝트 블록·과거 대화 블록·프로젝트 개요를 결합하고 배지 라벨을 정한다.</summary>
    public static (string? Block, string? RouteLabel) Combine(
        string? memoryBlock,
        int memoryCount,
        string? memoryRouteLabel,
        string? conversationBlock,
        int conversationCount,
        string? projectOverviewBlock = null,
        string? notebookBlock = null
    )
    {
        var hasMemory = !string.IsNullOrWhiteSpace(memoryBlock) && memoryCount > 0;
        var hasConversation = !string.IsNullOrWhiteSpace(conversationBlock) && conversationCount > 0;
        var hasOverview = !string.IsNullOrWhiteSpace(projectOverviewBlock);
        var hasNotebook = !string.IsNullOrWhiteSpace(notebookBlock);
        if (!hasMemory && !hasConversation && !hasOverview && !hasNotebook)
        {
            return (null, null);
        }

        var blocks = new List<string>(4);
        if (hasOverview)
        {
            blocks.Add(projectOverviewBlock!.Trim());
        }

        if (hasMemory)
        {
            blocks.Add(memoryBlock!.Trim());
        }

        if (hasConversation)
        {
            blocks.Add(conversationBlock!.Trim());
        }

        if (hasNotebook)
        {
            blocks.Add(notebookBlock!.Trim());
        }

        var combined = string.Join("\n\n", blocks);
        string? label;
        if (hasNotebook && !hasOverview && !hasMemory && !hasConversation)
        {
            label = "notebook 1";
        }
        else if (hasOverview && !hasMemory && !hasConversation && !hasNotebook)
        {
            label = "프로젝트 개요";
        }
        else if (!hasOverview && hasMemory && !hasConversation && !hasNotebook)
        {
            label = memoryRouteLabel;
        }
        else if (!hasOverview && !hasMemory && !hasNotebook)
        {
            label = $"대화 {conversationCount}";
        }
        else
        {
            label = $"참조 {memoryCount + conversationCount + (hasOverview ? 1 : 0) + (hasNotebook ? 1 : 0)}";
        }

        return (combined, label);
    }
}
