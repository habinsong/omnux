using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class CodingLoopPlanParserTests
{
    [Fact]
    public void ParseAcceptsJsonInsideCodeFence()
    {
        var plan = CodingLoopPlanParser.Parse(
            """
            ```json
            {
              "analysis": "파일을 작성합니다.",
              "done": "false",
              "final_message": "",
              "actions": [
                {"type": "write_file", "path": "app.py", "content": "print('ok')"}
              ]
            }
            ```
            """
        );

        Assert.NotNull(plan);
        Assert.Equal("파일을 작성합니다.", plan!.Analysis);
        Assert.False(plan.Done);
        Assert.Single(plan.Actions);
        Assert.Equal("write_file", plan.Actions[0].Type);
        Assert.Equal("app.py", plan.Actions[0].Path);
    }

    [Fact]
    public void ParseNormalizesCombinedActionType()
    {
        var plan = CodingLoopPlanParser.Parse(
            """
            {"analysis":"a","done":false,"actions":[{"type":"mkdir|write_file","path":"src","content":""}]}
            """
        );

        Assert.NotNull(plan);
        Assert.Equal("mkdir", plan!.Actions[0].Type);
    }

    [Fact]
    public void ParseInfersMkdirForPathWithoutContentAndExtension()
    {
        var plan = CodingLoopPlanParser.Parse(
            """
            {"analysis":"a","done":false,"actions":[{"op":"unknown","path":"src/features","content":""}]}
            """
        );

        Assert.NotNull(plan);
        Assert.Equal("mkdir", plan!.Actions[0].Type);
    }

    [Fact]
    public void ParseInfersRunWhenCommandExists()
    {
        var plan = CodingLoopPlanParser.Parse(
            """
            {"analysis":"a","done":false,"actions":[{"type":"","command":"python3 app.py"}]}
            """
        );

        Assert.NotNull(plan);
        Assert.Equal("run", plan!.Actions[0].Type);
    }

    [Fact]
    public void ParseReadsEditFileFindAndReplace()
    {
        var plan = CodingLoopPlanParser.Parse(
            """
            {"analysis":"fix bug","done":false,"actions":[{"type":"edit_file","path":"app.py","find":"a - b","replace":"a + b"}]}
            """
        );

        Assert.NotNull(plan);
        Assert.Single(plan!.Actions);
        Assert.Equal("edit_file", plan.Actions[0].Type);
        Assert.Equal("app.py", plan.Actions[0].Path);
        Assert.Equal("a - b", plan.Actions[0].Find);
        Assert.Equal("a + b", plan.Actions[0].Replace);
    }

    [Fact]
    public void ParseReadsEditFileFromOldNewStringAliases()
    {
        var plan = CodingLoopPlanParser.Parse(
            """
            {"analysis":"a","done":false,"actions":[{"type":"replace_in_file","path":"app.py","old_string":"x","new_string":"y"}]}
            """
        );

        Assert.NotNull(plan);
        Assert.Equal("edit_file", plan!.Actions[0].Type);
        Assert.Equal("x", plan.Actions[0].Find);
        Assert.Equal("y", plan.Actions[0].Replace);
    }

    [Fact]
    public void ParseInfersEditFileWhenFindPresentWithoutType()
    {
        var plan = CodingLoopPlanParser.Parse(
            """
            {"analysis":"a","done":false,"actions":[{"type":"","path":"app.py","find":"old","replace":"new"}]}
            """
        );

        Assert.NotNull(plan);
        Assert.Equal("edit_file", plan!.Actions[0].Type);
    }

    [Fact]
    public void NormalizeJsonCandidateEscapesRawNewlinesInsideStringAndRemovesTrailingComma()
    {
        var normalized = CodingLoopPlanParser.NormalizeJsonCandidate(
            """
            {"analysis":"line1
            line2","done":false,}
            """
        );

        Assert.Contains(@"line1\nline2", normalized);
        Assert.DoesNotContain(",}", normalized);
    }

    [Fact]
    public void BuildTextVariantsIncludesHtmlUnwrappedVariant()
    {
        var variants = CodingLoopPlanParser.BuildTextVariants("<pre>{&quot;done&quot;:true}</pre>");

        Assert.Contains("{\"done\":true}", variants);
    }
}
