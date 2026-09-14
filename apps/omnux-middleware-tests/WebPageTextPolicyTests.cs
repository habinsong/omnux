using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class WebPageTextPolicyTests
{
    [Fact]
    public void 보통_글은_읽을_수_있다고_본다()
    {
        var text = string.Concat(Enumerable.Repeat("파이썬 3.14.7 다운로드 페이지입니다. Download the latest version. ", 5));

        Assert.False(WebPageTextPolicy.LooksUnreadable(text));
    }

    [Fact]
    public void 압축_응답을_글자로_해석한_결과는_걸러낸다()
    {
        // gzip 바이트를 문자로 읽으면 제어문자와 대체문자가 잔뜩 섞인다.
        var broken = new string(
            Enumerable.Range(0, 200).Select(i => i % 3 == 0 ? '\u0001' : '\uFFFD').ToArray()
        );

        Assert.True(WebPageTextPolicy.LooksUnreadable(broken));
    }

    [Fact]
    public void 짧은_문자열은_비율을_따지지_않는다()
    {
        Assert.False(WebPageTextPolicy.LooksUnreadable(""));
    }

    [Fact]
    public void 줄바꿈과_탭은_깨진_문자가_아니다()
    {
        var text = string.Concat(Enumerable.Repeat("제목\n\t본문 줄입니다.\r\n", 10));

        Assert.False(WebPageTextPolicy.LooksUnreadable(text));
    }
}
