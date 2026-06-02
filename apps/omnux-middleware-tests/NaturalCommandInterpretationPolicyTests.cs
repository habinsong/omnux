namespace Omnux.Middleware.Tests;

public sealed class NaturalCommandInterpretationPolicyTests
{
    [Fact]
    public void TryParseNaturalCommandInterpretation_ParsesCodeFenceAndNormalizedJson()
    {
        var raw = """
                  ```json
                  {
                    "kind": "command",
                    "command": "skill.quick.add",
                    "confidence": 0.91,
                    "args": {
                      "alias": "c",
                      "name": "casual-chat",
                    }
                  }
                  ```
                  """;

        var ok = NaturalCommandInterpretationPolicy.TryParseNaturalCommandInterpretation(raw, out var interpretation);

        Assert.True(ok);
        Assert.Equal("command", interpretation.Kind);
        Assert.Equal("skill.quick.add", interpretation.Command);
        Assert.Equal(0.91d, interpretation.Confidence, 3);
        Assert.Equal("c", interpretation.Args["alias"]);
        Assert.Equal("casual-chat", interpretation.Args["name"]);
    }

    [Fact]
    public void TryParseNaturalCommandInterpretation_ConvertsBooleanAndNumericArgs()
    {
        var raw = """
                  {
                    "kind": "command",
                    "command": "memory.create",
                    "confidence": "0.77",
                    "args": {
                      "compact": true,
                      "count": 7
                    }
                  }
                  """;

        var ok = NaturalCommandInterpretationPolicy.TryParseNaturalCommandInterpretation(raw, out var interpretation);

        Assert.True(ok);
        Assert.Equal("true", interpretation.Args["compact"]);
        Assert.Equal("7", interpretation.Args["count"]);
        Assert.Equal(0.77d, interpretation.Confidence, 3);
    }
}
