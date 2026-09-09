using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class ExtensionRuleResolverTests
{
    [Fact]
    public void DisabledAndEmptyRulesAreExcluded()
    {
        var rules = new[]
        {
            Rule("off", "본문", enabled: false),
            Rule("blank", "   "),
            Rule("on", "실제 본문")
        };

        var selection = ExtensionRuleResolver.Resolve(rules, ExtensionRule.ScopeGlobal, null);
        var selected = Assert.Single(selection.Selected);
        Assert.Equal("on", selected.Id);
    }

    [Fact]
    public void GlobalRulesApplyToEveryScope()
    {
        var rules = new[] { Rule("g", "전역") with { Scope = ExtensionRule.ScopeGlobal } };
        Assert.Single(ExtensionRuleResolver.Resolve(rules, ExtensionRule.ScopeProject, null).Selected);
    }

    [Fact]
    public void ProjectRulesDoNotLeakIntoGlobalScope()
    {
        var rules = new[] { Rule("p", "프로젝트") with { Scope = ExtensionRule.ScopeProject } };
        Assert.Empty(ExtensionRuleResolver.Resolve(rules, ExtensionRule.ScopeGlobal, null).Selected);
        Assert.Single(ExtensionRuleResolver.Resolve(rules, ExtensionRule.ScopeProject, null).Selected);
    }

    [Fact]
    public void PathGlobRuleNeedsMatchingTarget()
    {
        var rules = new[] { Rule("ts", "타입스크립트 규칙") with { PathGlob = "**/*.ts" } };
        Assert.Empty(ExtensionRuleResolver.Resolve(rules, ExtensionRule.ScopeGlobal, null).Selected);
        Assert.Empty(ExtensionRuleResolver.Resolve(rules, ExtensionRule.ScopeGlobal, "src/a.py").Selected);
        Assert.Single(ExtensionRuleResolver.Resolve(rules, ExtensionRule.ScopeGlobal, "src/a.ts").Selected);
    }

    [Fact]
    public void LowerPriorityNumberComesFirst()
    {
        var rules = new[]
        {
            Rule("late", "나중") with { Priority = 200 },
            Rule("early", "먼저") with { Priority = 10 }
        };

        var selection = ExtensionRuleResolver.Resolve(rules, ExtensionRule.ScopeGlobal, null);
        Assert.Equal("early", selection.Selected[0].Id);
        Assert.StartsWith("- 제목: 먼저", selection.Text);
    }

    [Fact]
    public void EqualPriorityIsOrderedByIdForDeterminism()
    {
        var rules = new[] { Rule("b", "b본문"), Rule("a", "a본문") };
        var selection = ExtensionRuleResolver.Resolve(rules, ExtensionRule.ScopeGlobal, null);
        Assert.Equal(new[] { "a", "b" }, selection.Selected.Select(rule => rule.Id).ToArray());
    }

    [Fact]
    public void BudgetSkipsWholeRulesInsteadOfTruncating()
    {
        var rules = new[]
        {
            Rule("first", new string('가', 40)) with { Priority = 1 },
            Rule("second", new string('나', 40)) with { Priority = 2 }
        };

        var selection = ExtensionRuleResolver.Resolve(rules, ExtensionRule.ScopeGlobal, null, budgetChars: 60);
        Assert.Single(selection.Selected);
        Assert.Equal("first", selection.Selected[0].Id);
        var skipped = Assert.Single(selection.Skipped);
        Assert.Equal("second", skipped.Id);
        // 예산 초과분을 잘라 넣지 않는다.
        Assert.DoesNotContain('나', selection.Text);
        Assert.True(selection.UsedChars <= selection.BudgetChars);
    }

    [Fact]
    public void EmojiRuleIsKeptWholeOrSkipped()
    {
        var body = "규칙 🚀 유지";
        var rules = new[] { Rule("emoji", body) };
        var selection = ExtensionRuleResolver.Resolve(rules, ExtensionRule.ScopeGlobal, null, budgetChars: 5);
        Assert.Empty(selection.Selected);
        Assert.Single(selection.Skipped);
        Assert.Equal(string.Empty, selection.Text);
    }

    private static ExtensionRule Rule(string id, string body, bool enabled = true)
    {
        return new ExtensionRule(
            id,
            "제목",
            body,
            ExtensionRule.ScopeGlobal,
            string.Empty,
            100,
            enabled,
            string.Empty
        );
    }
}

/// <summary>규칙 주입 본문 구성 규칙을 확인한다.</summary>
public sealed class RuleInjectionPolicyTests
{
    [Fact]
    public void EmptySourcesProduceEmptyBody()
    {
        Assert.Equal(string.Empty, RuleInjectionPolicy.BuildBody(null, null));
        Assert.Equal(string.Empty, RuleInjectionPolicy.BuildBody("   ", Selection(string.Empty)));
    }

    [Fact]
    public void LegacyOnlyIsKeptAsIs()
    {
        Assert.Equal("짧게 답한다", RuleInjectionPolicy.BuildBody(" 짧게 답한다 ", Selection(string.Empty)));
    }

    [Fact]
    public void ExtensionOnlyIsKeptAsIs()
    {
        Assert.Equal("- 말투: 짧게", RuleInjectionPolicy.BuildBody(string.Empty, Selection("- 말투: 짧게")));
    }

    [Fact]
    public void BothSourcesAreJoined()
    {
        var body = RuleInjectionPolicy.BuildBody("한국어로 답한다", Selection("- 말투: 짧게"));
        Assert.Equal("한국어로 답한다\n- 말투: 짧게", body);
    }

    [Fact]
    public void DuplicateLegacyTextIsNotRepeated()
    {
        var body = RuleInjectionPolicy.BuildBody("짧게", Selection("- 말투: 짧게"));
        Assert.Equal("- 말투: 짧게", body);
    }

    [Fact]
    public void SkippedRulesAreReportedNotSilentlyDropped()
    {
        var skipped = new[]
        {
            new ExtensionRule("a", "말투", "본문", ExtensionRule.ScopeGlobal, string.Empty, 10, true, string.Empty),
            new ExtensionRule("b", "   ", "본문", ExtensionRule.ScopeGlobal, string.Empty, 20, true, string.Empty)
        };
        var selection = new ExtensionRuleSelection(Array.Empty<ExtensionRule>(), skipped, string.Empty, 0, 100);

        var note = RuleInjectionPolicy.BuildSkippedNote(selection);
        Assert.Contains("2개", note);
        Assert.Contains("말투", note);
        // 제목이 없으면 id 로 알아볼 수 있어야 한다.
        Assert.Contains("b", note);
    }

    [Fact]
    public void NoSkippedRulesMeansNoNote()
    {
        Assert.Equal(string.Empty, RuleInjectionPolicy.BuildSkippedNote(Selection("- a")));
        Assert.Equal(string.Empty, RuleInjectionPolicy.BuildSkippedNote(null));
    }

    private static ExtensionRuleSelection Selection(string text)
    {
        return new ExtensionRuleSelection(
            Array.Empty<ExtensionRule>(),
            Array.Empty<ExtensionRule>(),
            text,
            text.Length,
            RuleInjectionPolicy.ExtensionBudgetChars
        );
    }
}
