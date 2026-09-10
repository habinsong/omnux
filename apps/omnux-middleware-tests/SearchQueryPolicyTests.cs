using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class SearchQueryPolicyTests
{
    [Theory]
    [InlineData("NVIDIA news 5 items", true, "fast:true:heuristic")]
    [InlineData("web search React 20 release", true, "fast:true:explicit_web")]
    [InlineData("what time is it?", false, "heuristic:false:non_web")]
    [InlineData("hi", false, "heuristic:false:non_web")]
    public void BuildFastRequirementDecisionUsesHeuristics(string input, bool required, string label)
    {
        var decision = SearchQueryPolicy.BuildFastRequirementDecision(input);

        Assert.Equal(required, decision.Required);
        Assert.Equal(label, decision.DecisionLabel);
    }

    [Fact]
    public void BuildFastRequirementDecisionExtractsSourceHints()
    {
        var decision = SearchQueryPolicy.BuildFastRequirementDecision("CNN news site:cnn.com 3 items");

        Assert.True(decision.Required);
        Assert.Equal("CNN", decision.SourceFocus);
        Assert.Equal("cnn.com", decision.SourceDomain);
    }

    [Fact]
    public void KoreanOnlyPhrasesWithoutStructureDoNotForceWebSearch()
    {
        var searchPlease = SearchQueryPolicy.BuildFastRequirementDecision("검색해줘");
        Assert.False(searchPlease.Required);
        Assert.NotEqual("fast:true:explicit_web", searchPlease.DecisionLabel);

        var newsPlease = SearchQueryPolicy.BuildFastRequirementDecision("오늘 뉴스 알려줘");
        Assert.False(newsPlease.Required);
        Assert.NotEqual("fast:true:heuristic", newsPlease.DecisionLabel);
    }

    [Fact]
    public void HangulCountUnitStillParsesAsCount()
    {
        Assert.Equal(5, SearchQueryPolicy.ResolveRequestedResultCountFromQuery("headlines 5건"));
        Assert.True(SearchQueryPolicy.HasExplicitRequestedCountInQuery("headlines 5건"));
    }

    [Theory]
    [InlineData("{\"needWeb\":\"YES\",\"sourceFocus\":\"BBC\",\"sourceDomain\":\"https://www.bbc.com/\"}", true, "BBC", "bbc.com")]
    [InlineData("{\"needWeb\":true,\"sourceFocus\":\"Reuters\",\"sourceDomain\":\"reuters.com\"}", true, "Reuters", "reuters.com")]
    [InlineData("prefix {\"needWeb\":\"NO\"} suffix", false, "", "")]
    public void TryParseSearchRequirementDecisionJsonParsesSupportedShapes(
        string raw,
        bool expectedNeedWeb,
        string expectedFocus,
        string expectedDomain
    )
    {
        var parsed = SearchQueryPolicy.TryParseSearchRequirementDecisionJson(
            raw,
            out var needWeb,
            out var sourceFocus,
            out var sourceDomain
        );

        Assert.True(parsed);
        Assert.Equal(expectedNeedWeb, needWeb);
        Assert.Equal(expectedFocus, sourceFocus);
        Assert.Equal(expectedDomain, sourceDomain);
    }

    [Theory]
    [InlineData("not json")]
    [InlineData("{\"needWeb\":\"maybe\"}")]
    [InlineData("{\"sourceFocus\":\"CNN\"}")]
    public void TryParseSearchRequirementDecisionJsonRejectsInvalidInput(string raw)
    {
        Assert.False(SearchQueryPolicy.TryParseSearchRequirementDecisionJson(raw, out _, out _, out _));
    }

    [Theory]
    [InlineData("YES", "yes")]
    [InlineData("NO", "no")]
    [InlineData("maybe", "")]
    [InlineData("필요합니다", "")]
    [InlineData("불필요", "")]
    public void NormalizeWebSearchDecisionTokenNormalizesLlmOutput(string raw, string expected)
    {
        Assert.Equal(expected, SearchQueryPolicy.NormalizeWebSearchDecisionToken(raw));
    }

    [Theory]
    [InlineData("today news 7 items", 7)]
    [InlineData("top 3 ai news", 3)]
    [InlineData("latest headlines", 10)]
    [InlineData("general lookup", 5)]
    public void ResolveRequestedResultCountFromQueryUsesCountSignals(string input, int expected)
    {
        Assert.Equal(expected, SearchQueryPolicy.ResolveRequestedResultCountFromQuery(input));
    }

    [Theory]
    [InlineData("today breaking", "day")]
    [InlineData("monthly trend", "month")]
    [InlineData("yearly recap", "year")]
    [InlineData("recent notes", "week")]
    public void ResolveSearchFreshnessForQueryMapsTimeWindows(string input, string expected)
    {
        Assert.Equal(expected, SearchQueryPolicy.ResolveSearchFreshnessForQuery(input));
    }

    [Fact]
    public void BuildEffectiveSearchQueryAddsHeadlineTermsForNewsList()
    {
        var decision = new SearchRequirementDecision(true, "fast:true:heuristic", "", "");

        var query = SearchQueryPolicy.BuildEffectiveSearchQuery(
            "today news",
            decision,
            (_, _) => string.Empty
        );

        Assert.Equal("today news latest breaking headlines", query);
    }

    [Fact]
    public void BuildEffectiveSearchQueryAddsSourceFocusAndResolvedDomain()
    {
        var decision = new SearchRequirementDecision(true, "llm:true", "CNN", "");

        var query = SearchQueryPolicy.BuildEffectiveSearchQuery(
            "today news",
            decision,
            (_, _) => "cnn.com"
        );

        Assert.Equal("today news CNN cnn.com CNN official top headlines", query);
    }

    [Theory]
    [InlineData("what time is it?", true)]
    [InlineData("runtime complexity please", false)]
    public void LooksLikeLocalDateTimeQuestionAvoidsRuntimeComplexityFalsePositive(string input, bool expected)
    {
        Assert.Equal(expected, SearchQueryPolicy.LooksLikeLocalDateTimeQuestion(input));
    }

    [Fact]
    public void ExtractWebPreferenceHintsClassifiesConversationSourcePreference()
    {
        var hints = SearchQueryPolicy.ExtractWebPreferenceHints("prefer CNN as source", fromMemoryNote: false);

        var hint = Assert.Single(hints);
        Assert.Equal("source", hint.Category);
        Assert.Equal("prefer CNN as source", hint.Text);
    }

    [Fact]
    public void ExtractWebPreferenceHintsSkipsMemoryMetadata()
    {
        var hints = SearchQueryPolicy.ExtractWebPreferenceHints(
            """
            created_utc: 2026-05-18T00:00:00Z
            provider: gemini
            prefer Reuters as source
            """,
            fromMemoryNote: true
        );

        var hint = Assert.Single(hints);
        Assert.Equal("source", hint.Category);
        Assert.Equal("prefer Reuters as source", hint.Text);
    }

    [Theory]
    [InlineData("this time CNN not BBC", true)]
    [InlineData("today news 5 items", false)]
    public void ShouldBlockWebMemoryHintByOverrideDetectsOneShotOverrides(string input, bool expected)
    {
        Assert.Equal(expected, SearchQueryPolicy.ShouldBlockWebMemoryHintByOverride(input));
    }

    [Theory]
    [InlineData("table format please", true, false, false)]
    [InlineData("concise summary please", false, true, false)]
    [InlineData("reply in english", false, false, true)]
    [InlineData("today news please", false, false, false)]
    public void WebDirectiveDetectorsClassifyFormatToneAndLanguage(
        string input,
        bool expectedFormat,
        bool expectedTone,
        bool expectedLanguage
    )
    {
        Assert.Equal(expectedFormat, SearchQueryPolicy.LooksLikeWebFormatDirective(input));
        Assert.Equal(expectedTone, SearchQueryPolicy.LooksLikeWebToneDirective(input));
        Assert.Equal(expectedLanguage, SearchQueryPolicy.LooksLikeWebLanguageDirective(input));
    }

    [Fact]
    public void KoreanOnlyPhrasesAreNotFormatOrToneDirectives()
    {
        Assert.False(SearchQueryPolicy.LooksLikeWebFormatDirective("표로 정리해줘"));
        Assert.False(SearchQueryPolicy.LooksLikeWebToneDirective("짧게 요약해줘"));
    }

    [Theory]
    [InlineData("latest news please", 12, 4, 12)]
    [InlineData("general search results", 12, 4, 4)]
    [InlineData("breaking recap", 99, 0, 20)]
    [InlineData("document list", 99, 0, 1)]
    public void ResolveWebDefaultCountUsesNewsOrListDefaultsWithClamp(
        string input,
        int newsDefault,
        int listDefault,
        int expected
    )
    {
        Assert.Equal(expected, SearchQueryPolicy.ResolveWebDefaultCount(input, newsDefault, listDefault));
    }

    [Fact]
    public void ShortGreetingWithoutStructureIsLanguageAgnostic()
    {
        Assert.True(SearchQueryPolicy.LooksLikeStandaloneFreshGreeting("hi"));
        Assert.True(SearchQueryPolicy.LooksLikeStandaloneFreshGreeting("ㅎㅇ"));
        Assert.True(SearchQueryPolicy.LooksLikeStandaloneFreshGreeting("bonjour"));
        Assert.False(SearchQueryPolicy.LooksLikeStandaloneFreshGreeting("NVIDIA news"));
        Assert.False(SearchQueryPolicy.LooksLikeStandaloneFreshGreeting("site:cnn.com"));
    }

    [Fact]
    public void IntentSourceDoesNotEmbedHangulSynonymLists()
    {
        var path = FindMiddlewareSource("Infrastructure/Search/SearchQueryPolicy.cs");
        var source = File.ReadAllText(path);
        Assert.DoesNotContain("검색해서", source);
        Assert.DoesNotContain("ㅎㅇ", source);
        Assert.DoesNotContain("뉴스", source);
        Assert.DoesNotContain("표로", source);
        Assert.DoesNotContain("필요합니다", source);
    }

    private static string FindMiddlewareSource(string relative)
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir != null)
        {
            var candidate = Path.Combine(dir.FullName, "apps", "omnux-middleware", "src", relative);
            if (File.Exists(candidate))
            {
                return candidate;
            }

            candidate = Path.Combine(dir.FullName, "src", relative);
            if (File.Exists(candidate))
            {
                return candidate;
            }

            dir = dir.Parent;
        }

        throw new FileNotFoundException(relative);
    }
}
