using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

/// <summary>
/// 실행 명령 정규화가 "따옴표 안 줄바꿈"을 데이터로 지키는지 고정한다.
/// 여기가 무너지면 `python3 -c '<여러 줄 스크립트>'` 가 한 줄로 뭉개져 SyntaxError 로 죽고,
/// 파이썬 게임 빌드가 최종 검증에서 항상 실패한다(리눅스 실측으로 확인한 회귀).
/// </summary>
public sealed class CodingRunCommandNormalizationTests
{
    [Fact]
    public void KeepsNewlinesInsideSingleQuotedPythonScript()
    {
        var command = "cd '/tmp/run' && python3 -c 'import sys\nif len(sys.argv) > 1:\n    print(\"ok\")\n' arg";

        var normalized = CodingFallbackPolicy.NormalizeGeneratedRunCommand(command);

        Assert.Contains("import sys\nif len(sys.argv)", normalized);
        Assert.DoesNotContain("import sys if len", normalized);
    }

    [Fact]
    public void KeepsNewlinesInsideDoubleQuotedScript()
    {
        var command = "node -e \"const a = 1;\nconsole.log(a);\"";

        var normalized = CodingFallbackPolicy.NormalizeGeneratedRunCommand(command);

        Assert.Contains("const a = 1;\nconsole.log(a);", normalized);
    }

    [Fact]
    public void StillFlattensPlainMultiLineCommandList()
    {
        var command = "cd /tmp/run\npython3 main.py\n";

        var normalized = CodingFallbackPolicy.NormalizeGeneratedRunCommand(command);

        Assert.Equal("cd /tmp/run python3 main.py", normalized);
    }

    [Fact]
    public void KeepsSingleLineCommandUnchanged()
    {
        var normalized = CodingFallbackPolicy.NormalizeGeneratedRunCommand("python3 main.py");

        Assert.Equal("python3 main.py", normalized);
    }

    [Fact]
    public void TreatsEscapedQuoteInsideDoubleQuotesAsLiteral()
    {
        // \" 는 따옴표를 닫지 않는다. 닫힌 것으로 착각하면 뒤쪽 줄바꿈 판정이 뒤집힌다.
        var command = "printf \"a\\\"b\"\necho done";

        var normalized = CodingFallbackPolicy.NormalizeGeneratedRunCommand(command);

        Assert.Equal("printf \"a\\\"b\" echo done", normalized);
    }
}
