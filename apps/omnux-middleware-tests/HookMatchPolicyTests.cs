using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class HookMatchPolicyTests
{
    [Fact]
    public void EmptyToolPatternMatchesEverything()
    {
        Assert.True(HookMatchPolicy.MatchesTool(string.Empty, "Write"));
        Assert.True(HookMatchPolicy.MatchesTool(null, string.Empty));
    }

    [Fact]
    public void ToolPatternMatchesWholeNameOnly()
    {
        Assert.True(HookMatchPolicy.MatchesTool("rag", "rag"));
        // 부분 문자열 오탐(SKL-03)을 만들지 않는다.
        Assert.False(HookMatchPolicy.MatchesTool("rag", "drag"));
        Assert.False(HookMatchPolicy.MatchesTool("rag", "ragtime"));
    }

    [Fact]
    public void ToolPatternSupportsAlternativesAndWildcard()
    {
        Assert.True(HookMatchPolicy.MatchesTool("Edit|Write|MultiEdit", "Write"));
        Assert.False(HookMatchPolicy.MatchesTool("Edit|Write", "Read"));
        Assert.True(HookMatchPolicy.MatchesTool("git_*", "git_commit"));
        Assert.False(HookMatchPolicy.MatchesTool("git_*", "gitcommit"));
    }

    [Fact]
    public void EmptyPathGlobMatchesEverythingButEmptyPathFailsRealGlob()
    {
        Assert.True(HookMatchPolicy.MatchesPath(string.Empty, "src/a.ts"));
        Assert.False(HookMatchPolicy.MatchesPath("**/*.ts", string.Empty));
    }

    [Fact]
    public void SingleStarDoesNotCrossSeparator()
    {
        Assert.True(HookMatchPolicy.MatchesPath("src/*.ts", "src/a.ts"));
        Assert.False(HookMatchPolicy.MatchesPath("src/*.ts", "src/nested/a.ts"));
    }

    [Fact]
    public void DoubleStarCrossesSeparatorAndMatchesZeroSegments()
    {
        Assert.True(HookMatchPolicy.MatchesPath("**/*.ts", "src/nested/a.ts"));
        Assert.True(HookMatchPolicy.MatchesPath("**/*.ts", "a.ts"));
        Assert.True(HookMatchPolicy.MatchesPath("src/**/a.ts", "src/a.ts"));
        Assert.True(HookMatchPolicy.MatchesPath("src/**/a.ts", "src/x/y/a.ts"));
        Assert.False(HookMatchPolicy.MatchesPath("src/**/a.ts", "lib/x/a.ts"));
    }

    [Fact]
    public void DotEnvGlobMatchesHiddenFileAtAnyDepth()
    {
        Assert.True(HookMatchPolicy.MatchesPath("**/.env", "/repo/app/.env"));
        Assert.True(HookMatchPolicy.MatchesPath("**/.env", ".env"));
        Assert.False(HookMatchPolicy.MatchesPath("**/.env", "/repo/.envrc"));
    }

    [Fact]
    public void QuestionMarkDoesNotMatchSeparator()
    {
        Assert.True(HookMatchPolicy.MatchesPath("a?c", "abc"));
        Assert.False(HookMatchPolicy.MatchesPath("a?c", "a/c"));
    }

    [Fact]
    public void WindowsSeparatorsAreNormalized()
    {
        Assert.True(HookMatchPolicy.MatchesPath("**/secrets/**", "C:\\repo\\secrets\\key.txt"));
    }

    [Fact]
    public void OversizedPatternIsRejectedInsteadOfMatching()
    {
        var oversized = new string('*', HookMatchPolicy.MaxPatternChars + 1);
        Assert.False(HookMatchPolicy.MatchesPath(oversized, "a"));
        Assert.False(HookMatchPolicy.MatchesTool(oversized, "a"));
    }

    [Fact]
    public void DisabledHookNeverMatches()
    {
        var hook = Hook(enabled: false);
        var input = HookEventInput.ForEvent(HookEventCatalog.ToolPre) with { ToolName = "Write" };
        Assert.False(HookMatchPolicy.Matches(hook, input));
        Assert.True(HookMatchPolicy.Matches(hook with { Enabled = true }, input));
    }

    [Fact]
    public void EventMustMatchExactly()
    {
        var hook = Hook(enabled: true);
        var input = HookEventInput.ForEvent(HookEventCatalog.ToolPost) with { ToolName = "Write" };
        Assert.False(HookMatchPolicy.Matches(hook, input));
    }

    private static HookDefinition Hook(bool enabled)
    {
        return new HookDefinition(
            "h1",
            HookEventCatalog.ToolPre,
            HookHandlerKind.Builtin,
            string.Empty,
            BuiltinHookHandlers.RequireApproval,
            string.Empty,
            new HookMatcher("Write", string.Empty),
            HookDefinition.DefaultTimeoutMs,
            HookFailureMode.Open,
            enabled,
            string.Empty,
            string.Empty
        );
    }
}

/// <summary>
/// 이벤트 목록과 실제 호출 지점의 일치를 강제한다.
/// 호출 지점 없이 이벤트를 추가하면 이 검사가 실패해 "지원하는 것처럼" 남는 상태를 막는다.
/// </summary>
public sealed class HookEventCatalogTests
{
    [Fact]
    public void WiredEventsMatchTheActualCallSites()
    {
        var wired = HookEventCatalog.List()
            .Where(definition => definition.Wired)
            .Select(definition => definition.Id)
            .OrderBy(id => id, StringComparer.Ordinal)
            .ToArray();

        // 현재 14종 모두 실제 호출 지점이 있다. 호출 지점 없이 이벤트를 추가하면 이 검사가 실패한다.
        Assert.Equal(
            HookEventCatalog.List().Select(definition => definition.Id).OrderBy(id => id, StringComparer.Ordinal).ToArray(),
            wired
        );
    }

    [Fact]
    public void EveryEventIdIsLowercaseAndUnique()
    {
        var ids = HookEventCatalog.List().Select(definition => definition.Id).ToArray();
        Assert.Equal(ids.Length, ids.Distinct(StringComparer.Ordinal).Count());
        Assert.All(ids, id => Assert.Equal(id.ToLowerInvariant(), id));
    }

    [Fact]
    public void OnlyPromptSubmitClaimsContextInjection()
    {
        // 지금 훅 문맥을 실제로 적용하는 곳은 PromptContextComposer 하나다.
        // 적용하는 게이트가 생기기 전에 다른 이벤트를 true 로 바꾸면 거짓 상태가 된다.
        foreach (var definition in HookEventCatalog.List())
        {
            if (definition.CanAddContext)
            {
                Assert.Equal(HookEventCatalog.PromptSubmit, definition.Id);
            }
        }
    }

    [Fact]
    public void NoEventClaimsInputRewriteUntilAGateAppliesIt()
    {
        // 어떤 게이트도 updatedInput 을 적용하지 않는다. 지원한다고 표시하면 거짓 상태가 된다.
        // 실제로 적용하는 게이트를 만들 때 이 검사를 함께 바꾼다(EXT-08).
        foreach (var definition in HookEventCatalog.List())
        {
            Assert.False(definition.CanRewriteInput, definition.Id);
        }
    }

    [Fact]
    public void RewriteWouldOnlyEverBeAllowedOnBlockingEvents()
    {
        foreach (var definition in HookEventCatalog.List())
        {
            if (definition.CanRewriteInput)
            {
                Assert.True(definition.CanBlock, definition.Id);
            }
        }
    }

    [Fact]
    public void UnknownEventIsNotFound()
    {
        Assert.Null(HookEventCatalog.Find("nope"));
        Assert.False(HookEventCatalog.IsKnown(" "));
        Assert.NotNull(HookEventCatalog.Find("  CODING.FILE.PRE  "));
    }
}
