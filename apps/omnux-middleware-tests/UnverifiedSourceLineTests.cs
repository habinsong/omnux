using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class UnverifiedSourceLineTests
{
    [Fact]
    public void 근거가_없으면_모델이_적은_출처_줄을_지운다()
    {
        const string answer = "**요약:** 파이썬 최신 안정 버전은 3.14입니다.\n\n출처: Python.org, 붉은 각설탕";

        var cleaned = SearchAnswerFormatterPolicy.RemoveUnverifiedSourceLine(answer);

        Assert.DoesNotContain("붉은 각설탕", cleaned);
        Assert.Contains("파이썬 최신 안정 버전은 3.14입니다.", cleaned);
        Assert.Contains("출처: 확인되지 않음", cleaned);
    }

    [Fact]
    public void 출처_줄이_없던_답은_그대로_둔다()
    {
        const string answer = "파이썬 최신 안정 버전은 3.14.7입니다.";

        var cleaned = SearchAnswerFormatterPolicy.RemoveUnverifiedSourceLine(answer);

        Assert.Equal(answer, cleaned);
    }

    [Fact]
    public void 빈_답은_그대로_돌려준다()
    {
        Assert.Equal(string.Empty, SearchAnswerFormatterPolicy.RemoveUnverifiedSourceLine(string.Empty));
    }
}
