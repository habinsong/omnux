using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class HookOutputParserTests
{
    [Fact]
    public void EmptyOutputIsNotAnError()
    {
        var result = HookOutputParser.Parse("   ");
        Assert.Equal(HookOutcome.None, result.Outcome);
        Assert.False(result.HadJson);
        Assert.Equal(string.Empty, result.ParseError);
    }

    [Fact]
    public void PlainLogOutputIsNotAnError()
    {
        var result = HookOutputParser.Parse("checked 3 files");
        Assert.Equal(HookOutcome.None, result.Outcome);
        Assert.False(result.HadJson);
        Assert.Equal(string.Empty, result.ParseError);
    }

    [Fact]
    public void DecisionAndReasonAreParsed()
    {
        var result = HookOutputParser.Parse("{\"decision\":\"deny\",\"reason\":\"보호 경로\"}");
        Assert.Equal(HookOutcome.Deny, result.Outcome);
        Assert.Equal("보호 경로", result.Reason);
        Assert.True(result.HadJson);
    }

    [Fact]
    public void UpdatedInputKeepsRawObject()
    {
        var result = HookOutputParser.Parse(
            "{\"decision\":\"allow\",\"updatedInput\":{\"command\":\"ls -a\",\"tab\":\"a\\tb\"}}"
        );
        Assert.Equal(HookOutcome.Allow, result.Outcome);
        Assert.Contains("\"command\":\"ls -a\"", result.UpdatedInputJson);
        Assert.Contains("a\\tb", result.UpdatedInputJson);
    }

    [Fact]
    public void UnknownDecisionIsReportedNotGuessed()
    {
        var result = HookOutputParser.Parse("{\"decision\":\"maybe\"}");
        Assert.Equal(HookOutcome.None, result.Outcome);
        Assert.Contains("maybe", result.ParseError);
    }

    [Fact]
    public void NonStringDecisionIsReported()
    {
        var result = HookOutputParser.Parse("{\"decision\":3}");
        Assert.Equal(HookOutcome.None, result.Outcome);
        Assert.Contains("decision", result.ParseError);
    }

    [Fact]
    public void BrokenJsonIsReportedAsParseError()
    {
        var result = HookOutputParser.Parse("{\"decision\":");
        Assert.Equal(HookOutcome.None, result.Outcome);
        Assert.NotEqual(string.Empty, result.ParseError);
    }
}

public sealed class HookDecisionReducerTests
{
    [Fact]
    public void DenyBeatsAskAndAllow()
    {
        var runs = new[]
        {
            Run("a", HookOutcome.Allow),
            Run("b", HookOutcome.Deny, "차단"),
            Run("c", HookOutcome.Ask)
        };

        var result = HookDecisionReducer.Reduce(Blocking(), runs, Definitions("a", "b", "c"));
        Assert.Equal(HookOutcome.Deny, result.Outcome);
        Assert.Equal("b", result.DecidedByHookId);
        Assert.Equal("차단", result.Reason);
        Assert.True(result.IsBlocked);
    }

    [Fact]
    public void AskBeatsAllow()
    {
        var runs = new[] { Run("a", HookOutcome.Allow), Run("b", HookOutcome.Ask) };
        var result = HookDecisionReducer.Reduce(Blocking(), runs, Definitions("a", "b"));
        Assert.Equal(HookOutcome.Ask, result.Outcome);
        Assert.True(result.NeedsApproval);
    }

    [Fact]
    public void NonBlockingEventKeepsDenyAsContextOnly()
    {
        var runs = new[] { Run("a", HookOutcome.Deny, "늦은 경고") };
        var result = HookDecisionReducer.Reduce(NonBlocking(), runs, Definitions("a"));
        Assert.Equal(HookOutcome.None, result.Outcome);
        Assert.False(result.IsBlocked);
        Assert.Contains("늦은 경고", result.AdditionalContext);
    }

    [Fact]
    public void FailureIsOpenByDefault()
    {
        var runs = new[] { Failed("a") };
        var result = HookDecisionReducer.Reduce(Blocking(), runs, Definitions("a"));
        Assert.Equal(HookOutcome.None, result.Outcome);
    }

    [Fact]
    public void ClosedFailureModeBlocks()
    {
        var runs = new[] { Failed("a") };
        var definitions = Definitions("a");
        definitions["a"] = definitions["a"] with { FailureMode = HookFailureMode.Closed };
        var result = HookDecisionReducer.Reduce(Blocking(), runs, definitions);
        Assert.Equal(HookOutcome.Deny, result.Outcome);
    }

    [Fact]
    public void UpdatedInputIsDroppedWhenDenied()
    {
        var runs = new[]
        {
            Run("a", HookOutcome.Allow) with { UpdatedInputJson = "{\"command\":\"ls\"}" },
            Run("b", HookOutcome.Deny, "차단")
        };

        var result = HookDecisionReducer.Reduce(Blocking(), runs, Definitions("a", "b"));
        Assert.Equal(HookOutcome.Deny, result.Outcome);
        Assert.False(result.HasUpdatedInput);
    }

    [Fact]
    public void UpdatedInputIsIgnoredWhenEventCannotRewrite()
    {
        var runs = new[] { Run("a", HookOutcome.Allow) with { UpdatedInputJson = "{\"a\":1}" } };
        var result = HookDecisionReducer.Reduce(NonBlocking(), runs, Definitions("a"));
        Assert.False(result.HasUpdatedInput);
    }

    [Fact]
    public void LastRewriteWinsAndIsAttributed()
    {
        var runs = new[]
        {
            Run("a", HookOutcome.Allow) with { UpdatedInputJson = "{\"n\":1}" },
            Run("b", HookOutcome.Allow) with { UpdatedInputJson = "{\"n\":2}" }
        };

        var result = HookDecisionReducer.Reduce(Blocking(), runs, Definitions("a", "b"));
        Assert.Equal("{\"n\":2}", result.UpdatedInputJson);
        Assert.Equal("b", result.UpdatedInputByHookId);
    }

    [Fact]
    public void EventWithoutCapabilitiesNeverDecides()
    {
        var result = HookDecisionReducer.Reduce(NoCapabilities(), new[] { Run("a", HookOutcome.Deny) }, Definitions("a"));
        Assert.Equal(HookOutcome.None, result.Outcome);
    }

    [Fact]
    public void UnsupportedRunDoesNotDecide()
    {
        var run = Run("a", HookOutcome.Deny) with { Status = HookRunStatus.Unsupported };
        var result = HookDecisionReducer.Reduce(Blocking(), new[] { run }, Definitions("a"));
        Assert.Equal(HookOutcome.None, result.Outcome);
    }

    /// <summary>차단·재작성·문맥을 모두 허용하는 이벤트 계약. 합성 규칙 자체를 검증한다.</summary>
    private static HookEventDefinition Blocking()
    {
        return new HookEventDefinition(
            HookEventCatalog.ToolPre,
            "검사용 차단 이벤트",
            string.Empty,
            CanBlock: true,
            CanRewriteInput: true,
            CanAddContext: true,
            Wired: true
        );
    }

    /// <summary>차단할 수 없고 문맥만 붙일 수 있는 이벤트 계약.</summary>
    private static HookEventDefinition NonBlocking()
    {
        return Blocking() with
        {
            Id = HookEventCatalog.ToolPost,
            CanBlock = false,
            CanRewriteInput = false
        };
    }

    /// <summary>아무 능력도 없는 이벤트 계약.</summary>
    private static HookEventDefinition NoCapabilities()
    {
        return Blocking() with
        {
            Id = HookEventCatalog.ResponseComplete,
            CanBlock = false,
            CanRewriteInput = false,
            CanAddContext = false
        };
    }

    private static HookRunResult Run(string id, HookOutcome outcome, string reason = "")
    {
        return new HookRunResult(
            id,
            HookEventCatalog.ToolPre,
            HookRunStatus.Completed,
            outcome,
            reason,
            string.Empty,
            string.Empty,
            0,
            0,
            string.Empty
        );
    }

    private static HookRunResult Failed(string id)
    {
        return Run(id, HookOutcome.None) with { Status = HookRunStatus.Failed, ExitCode = 1 };
    }

    private static Dictionary<string, HookDefinition> Definitions(params string[] ids)
    {
        var map = new Dictionary<string, HookDefinition>(StringComparer.Ordinal);
        foreach (var id in ids)
        {
            map[id] = new HookDefinition(
                id,
                HookEventCatalog.ToolPre,
                HookHandlerKind.Command,
                "true",
                string.Empty,
                string.Empty,
                HookMatcher.Any,
                HookDefinition.DefaultTimeoutMs,
                HookFailureMode.Open,
                true,
                string.Empty,
                string.Empty
            );
        }

        return map;
    }
}
