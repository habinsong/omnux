using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class AskAutoRetrievalPolicyTests
{
    private static MemorySearchCitationResult Hit(string path, double score, string snippet, string source = "memory")
    {
        return new MemorySearchCitationResult(path, 1, 3, snippet, score, source);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("왜?")]
    [InlineData("ㅋㅋㅋ")]
    public void ShouldAttemptRejectsEmptyOrTooShortInput(string? input)
    {
        Assert.False(AskAutoRetrievalPolicy.ShouldAttempt(input));
    }

    [Theory]
    [InlineData("/help")]
    [InlineData("/skill review 이 코드 봐줘")]
    public void ShouldAttemptRejectsSlashCommands(string input)
    {
        Assert.False(AskAutoRetrievalPolicy.ShouldAttempt(input));
    }

    [Fact]
    public void ShouldAttemptRejectsStandaloneGreeting()
    {
        Assert.False(AskAutoRetrievalPolicy.ShouldAttempt("안녕하세요"));
    }

    [Fact]
    public void ShouldAttemptRejectsUrlOnlyInput()
    {
        Assert.False(AskAutoRetrievalPolicy.ShouldAttempt("https://example.com/some/long/path?q=1"));
    }

    [Theory]
    [InlineData("내가 저번에 정한 라우팅 정책 뭐였지?")]
    [InlineData("omnux 미디어 위젯 버그 원인 정리해줘")]
    public void ShouldAttemptAcceptsNormalQuestions(string input)
    {
        Assert.True(AskAutoRetrievalPolicy.ShouldAttempt(input));
    }

    [Fact]
    public void BuildQueryStripsUrlsAndCollapsesWhitespace()
    {
        var query = AskAutoRetrievalPolicy.BuildQuery("이 글  요약해줘   https://news.example.com/a/b 그리고 결론도");
        Assert.Equal("이 글 요약해줘 그리고 결론도", query);
    }

    [Fact]
    public void BuildQueryCapsLength()
    {
        var longInput = new string('가', AskAutoRetrievalPolicy.QueryMaxChars + 100);
        var query = AskAutoRetrievalPolicy.BuildQuery(longInput);
        Assert.Equal(AskAutoRetrievalPolicy.QueryMaxChars, query.Length);
    }

    [Theory]
    [InlineData("/Users/me/.omnux/memory-notes/routing-policy.md", "routing-policy")]
    [InlineData("memory\\notes\\telegram-fix.md", "telegram-fix")]
    [InlineData("plain-name", "plain-name")]
    [InlineData("", "")]
    public void ResolveNoteNameFromPathExtractsFileNameWithoutExtension(string path, string expected)
    {
        Assert.Equal(expected, AskAutoRetrievalPolicy.ResolveNoteNameFromPath(path));
    }

    [Theory]
    [InlineData("apps/desktop/src/features/shell/MediaWidget.tsx", "features/shell/MediaWidget.tsx")]
    [InlineData("a/b.md", "a/b.md")]
    [InlineData("", "")]
    public void ShortenPathForLabelKeepsLastThreeSegments(string path, string expected)
    {
        Assert.Equal(expected, AskAutoRetrievalPolicy.ShortenPathForLabel(path));
    }

    [Fact]
    public void FormatBlockReturnsNullForEmptyHits()
    {
        var (block, used, label) = AskAutoRetrievalPolicy.FormatBlock(Array.Empty<MemorySearchCitationResult>(), null);
        Assert.Null(block);
        Assert.Equal(0, used);
        Assert.Null(label);
    }

    [Fact]
    public void FormatBlockSkipsMemoryNotesAlreadyLinkedToConversation()
    {
        var hits = new[]
        {
            Hit("/m/routing-policy.md", 0.9, "라우팅 정책 본문"),
            Hit("/m/media-widget.md", 0.8, "미디어 위젯 메모")
        };
        var (block, used, label) = AskAutoRetrievalPolicy.FormatBlock(hits, new[] { "routing-policy" });
        Assert.NotNull(block);
        Assert.Equal(1, used);
        Assert.Contains("media-widget", block);
        Assert.DoesNotContain("routing-policy", block);
        Assert.Equal("memory 1", label);
    }

    [Fact]
    public void FormatBlockDoesNotApplyLinkedNoteDedupeToProjectHits()
    {
        var hits = new[]
        {
            Hit("apps/desktop/src/routing-policy.ts", 0.9, "코드 본문", source: "project")
        };
        var (block, used, _) = AskAutoRetrievalPolicy.FormatBlock(hits, new[] { "routing-policy" });
        Assert.NotNull(block);
        Assert.Equal(1, used);
        Assert.Contains("project:", block);
    }

    [Fact]
    public void FormatBlockDeduplicatesSamePathAndOrdersByScore()
    {
        var hits = new[]
        {
            Hit("/m/low.md", 0.5, "낮은 점수"),
            Hit("/m/high.md", 0.95, "높은 점수"),
            Hit("/m/high.md", 0.91, "중복 경로")
        };
        var (block, used, _) = AskAutoRetrievalPolicy.FormatBlock(hits, null);
        Assert.NotNull(block);
        Assert.Equal(2, used);
        var highIndex = block!.IndexOf("high.md", StringComparison.Ordinal);
        var lowIndex = block.IndexOf("low.md", StringComparison.Ordinal);
        Assert.True(highIndex >= 0 && lowIndex > highIndex);
        Assert.Single(System.Text.RegularExpressions.Regex.Matches(block, "high\\.md"));
    }

    [Fact]
    public void FormatBlockCapsHitCountAndSnippetLength()
    {
        var longSnippet = new string('a', AskAutoRetrievalPolicy.PerSnippetMaxChars + 200);
        var hits = new[]
        {
            Hit("/m/a.md", 0.9, longSnippet),
            Hit("/m/b.md", 0.8, "b"),
            Hit("/m/c.md", 0.7, "c"),
            Hit("/m/d.md", 0.6, "d")
        };
        var (block, used, _) = AskAutoRetrievalPolicy.FormatBlock(hits, null);
        Assert.NotNull(block);
        Assert.Equal(AskAutoRetrievalPolicy.MaxHitsInBlock, used);
        Assert.Contains("...(truncated)", block);
        Assert.DoesNotContain("d.md", block);
    }

    [Fact]
    public void FormatBlockBuildsSourceAwareLabels()
    {
        var hits = new[]
        {
            Hit("apps/desktop/src/App.tsx", 0.9, "코드", source: "project"),
            Hit("apps/shared/model-registry.json", 0.8, "설정", source: "project")
        };
        var (block, used, label) = AskAutoRetrievalPolicy.FormatBlock(hits, null);
        Assert.NotNull(block);
        Assert.Equal(2, used);
        Assert.Contains("project:desktop/src/App.tsx", block);
        Assert.Equal("project 2", label);
    }

    [Fact]
    public void FormatBlockUsesGenericLabelForMixedSources()
    {
        var hits = new[]
        {
            Hit("apps/a.ts", 0.9, "코드", source: "project"),
            Hit("/m/note.md", 0.8, "노트", source: "memory")
        };
        var (_, used, label) = AskAutoRetrievalPolicy.FormatBlock(hits, null);
        Assert.Equal(2, used);
        Assert.Equal("참조 2", label);
    }

    [Theory]
    [InlineData(null, false)]
    [InlineData("", false)]
    [InlineData("1", false)]
    [InlineData("true", false)]
    [InlineData("0", true)]
    [InlineData("false", true)]
    [InlineData("OFF", true)]
    [InlineData("no", true)]
    public void IsDisabledValueParsesEnvSemantics(string? raw, bool expected)
    {
        Assert.Equal(expected, AskAutoRetrievalPolicy.IsDisabledValue(raw));
    }

    /* ---------------- P0-8 크로스 대화 참조 ---------------- */

    private static ConversationSearchHit ConvHit(string id, string title, double score, string snippet = "본문")
    {
        var now = DateTimeOffset.Parse("2026-06-10T00:00:00Z");
        return new ConversationSearchHit(id, title, "chat", "single", "assistant", snippet, now, now, score);
    }

    [Theory]
    [InlineData("저번에 물어본 텔레그램 문제 결론 뭐였지?")]
    [InlineData("지난번 대화에서 정한 라우팅 정책 알려줘")]
    [InlineData("전에 말했던 모델 설정 다시 보여줘")]
    public void ShouldSearchConversationsMatchesRetrospectiveWording(string input)
    {
        Assert.True(AskAutoRetrievalPolicy.ShouldSearchConversations(input));
    }

    [Theory]
    [InlineData("오늘 비트코인 시세 알려줘")]
    [InlineData("이 코드 버그 원인 설명해줘")]
    [InlineData("/help")]
    [InlineData("")]
    public void ShouldSearchConversationsStaysQuietOtherwise(string input)
    {
        Assert.False(AskAutoRetrievalPolicy.ShouldSearchConversations(input));
    }

    [Fact]
    public void FormatConversationBlockExcludesCurrentAndDeduplicates()
    {
        var hits = new[]
        {
            ConvHit("conv-current", "현재 대화", 0.99),
            ConvHit("conv-a", "텔레그램 답장 버그", 0.9),
            ConvHit("conv-a", "텔레그램 답장 버그(중복)", 0.85),
            ConvHit("conv-b", "미디어 위젯", 0.8),
            ConvHit("conv-c", "초과분", 0.7)
        };
        var (block, used) = AskAutoRetrievalPolicy.FormatConversationBlock(hits, "conv-current");
        Assert.NotNull(block);
        Assert.Equal(AskAutoRetrievalPolicy.ConversationMaxHits, used);
        Assert.Contains("conversation:텔레그램 답장 버그", block);
        Assert.Contains("conversation:미디어 위젯", block);
        Assert.DoesNotContain("현재 대화", block);
        Assert.DoesNotContain("초과분", block);
    }

    [Fact]
    public void FormatConversationBlockCapsSnippetLength()
    {
        var longSnippet = new string('x', AskAutoRetrievalPolicy.ConversationSnippetMaxChars + 50);
        var (block, used) = AskAutoRetrievalPolicy.FormatConversationBlock(
            new[] { ConvHit("conv-a", "제목", 0.9, longSnippet) },
            null
        );
        Assert.Equal(1, used);
        Assert.Contains("…", block);
    }

    [Fact]
    public void CombineKeepsMemoryLabelWhenOnlyMemory()
    {
        var (block, label) = AskAutoRetrievalPolicy.Combine("M", 2, "project 2", null, 0);
        Assert.Equal("M", block);
        Assert.Equal("project 2", label);
    }

    [Fact]
    public void CombineUsesConversationLabelWhenOnlyConversations()
    {
        var (block, label) = AskAutoRetrievalPolicy.Combine(null, 0, null, "C", 2);
        Assert.Equal("C", block);
        Assert.Equal("대화 2", label);
    }

    [Fact]
    public void CombineMergesBlocksAndUsesGenericLabel()
    {
        var (block, label) = AskAutoRetrievalPolicy.Combine("M", 2, "project 2", "C", 1);
        Assert.Equal("M\n\nC", block);
        Assert.Equal("참조 3", label);
    }

    [Fact]
    public void CombineReturnsNullWhenBothEmpty()
    {
        var (block, label) = AskAutoRetrievalPolicy.Combine(null, 0, null, null, 0);
        Assert.Null(block);
        Assert.Null(label);
    }

    [Fact]
    public void CombineIncludesNotebookContext()
    {
        var (block, label) = InvokeCombineWithNotebook(
            null,
            0,
            null,
            null,
            0,
            null,
            "N"
        );

        Assert.Equal("N", block);
        Assert.Equal("notebook 1", label);
    }

    [Fact]
    public void CombineCountsNotebookWithExistingSources()
    {
        var (block, label) = InvokeCombineWithNotebook(
            "M",
            2,
            "project 2",
            "C",
            1,
            null,
            "N"
        );

        Assert.Contains("M", block);
        Assert.Contains("C", block);
        Assert.Contains("N", block);
        Assert.Equal("참조 4", label);
    }

    [Fact]
    public void BuildConversationQueryStripsRetrospectiveNoise()
    {
        var query = AskAutoRetrievalPolicy.BuildConversationQuery("지난번 대화에서 텔레그램 폴링 어떻게 고쳤었지?");
        Assert.DoesNotContain("지난번", query);
        Assert.DoesNotContain("어떻게", query);
        Assert.Contains("텔레그램 폴링", query);
    }

    [Fact]
    public void EnumerateConversationFallbackTokensOrdersByLength()
    {
        var tokens = AskAutoRetrievalPolicy.EnumerateConversationFallbackTokens("텔레그램 폴링 고침");
        Assert.Equal("텔레그램", tokens[0]);
        Assert.Contains("폴링", tokens);
        Assert.True(tokens.Count <= 4);
    }

    /* ---------------- P0-3 프로젝트 개요 ---------------- */

    [Theory]
    [InlineData("이 프로젝트 구조 설명해줘")]
    [InlineData("등록된 스킬 뭐 있어?")]
    [InlineData("우리 코드베이스에 사용 가능한 커맨드 목록 보여줘")]
    [InlineData("프로젝트 루트가 어디야")]
    public void ShouldIncludeProjectOverviewMatchesStructuralQuestions(string input)
    {
        Assert.True(AskAutoRetrievalPolicy.ShouldIncludeProjectOverview(input));
    }

    [Theory]
    [InlineData("오늘 비트코인 시세 알려줘")]
    [InlineData("이 함수 버그 고쳐줘")]
    [InlineData("/help")]
    public void ShouldIncludeProjectOverviewStaysQuietOtherwise(string input)
    {
        Assert.False(AskAutoRetrievalPolicy.ShouldIncludeProjectOverview(input));
    }

    [Fact]
    public void CombineUsesOverviewLabelWhenOnlyOverview()
    {
        var (block, label) = AskAutoRetrievalPolicy.Combine(null, 0, null, null, 0, "### project:overview\nX");
        Assert.Contains("project:overview", block);
        Assert.Equal("프로젝트 개요", label);
    }

    [Fact]
    public void CombineWebContextHintReturnsHintWhenNoBlock()
    {
        Assert.Equal("기존 힌트", AskAutoRetrievalPolicy.CombineWebContextHint("기존 힌트", null));
        Assert.Equal(string.Empty, AskAutoRetrievalPolicy.CombineWebContextHint(null, "  "));
    }

    [Fact]
    public void CombineWebContextHintAppendsLabeledSection()
    {
        var combined = AskAutoRetrievalPolicy.CombineWebContextHint("힌트", "### memory:a\n본문");
        Assert.StartsWith("힌트\n\n[사용자 보유 컨텍스트", combined);
        Assert.Contains("memory:a", combined);
        Assert.Contains("웹 근거를 우선", combined);
    }

    [Fact]
    public void CombineWebContextHintCapsBlockLength()
    {
        var longBlock = new string('x', AskAutoRetrievalPolicy.WebContextHintMaxChars + 200);
        var combined = AskAutoRetrievalPolicy.CombineWebContextHint(null, longBlock);
        Assert.Contains("...(truncated)", combined);
        Assert.True(combined.Length < AskAutoRetrievalPolicy.WebContextHintMaxChars + 120);
    }

    [Fact]
    public void CombinePutsOverviewFirstAndCountsIt()
    {
        var (block, label) = AskAutoRetrievalPolicy.Combine("M", 2, "project 2", "C", 1, "O");
        Assert.Equal("O\n\nM\n\nC", block);
        Assert.Equal("참조 4", label);
    }

    private static (string? Block, string? RouteLabel) InvokeCombineWithNotebook(
        string? memoryBlock,
        int memoryCount,
        string? memoryRouteLabel,
        string? conversationBlock,
        int conversationCount,
        string? projectOverviewBlock,
        string? notebookBlock
    )
    {
        var method = typeof(AskAutoRetrievalPolicy).GetMethod(
            "Combine",
            System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Static
        );
        Assert.NotNull(method);
        Assert.Contains(method!.GetParameters(), parameter => parameter.Name == "notebookBlock");

        var result = method.Invoke(
            null,
            new object?[]
            {
                memoryBlock,
                memoryCount,
                memoryRouteLabel,
                conversationBlock,
                conversationCount,
                projectOverviewBlock,
                notebookBlock
            }
        );
        Assert.NotNull(result);

        var tuple = ((string? Block, string? RouteLabel))result;
        return tuple;
    }
}
