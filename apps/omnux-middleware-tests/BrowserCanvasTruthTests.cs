using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class BrowserCanvasTruthTests
{
    [Fact]
    public void BrowserOpenNeverReportsASimulatedBrowserAsSuccessful()
    {
        using var browser = new BrowserTool(new AppConfig());
        var result = browser.Execute("open", "about:blank");
        Assert.False(result.Ok && result.Adapter == "stub", "실제 브라우저가 없으면 실패를 반환해야 합니다.");
    }

    [Fact]
    public void CanvasEvalReturnsTheEvaluatedValueOrAnExplicitFailure()
    {
        using var canvas = new CanvasTool(new AppConfig());
        canvas.Execute("present", targetUrl: "about:blank");
        var result = canvas.Execute("eval", javaScript: "1 + 2");
        if (result.Ok) Assert.Equal("3", result.EvalResult);
        else Assert.False(string.IsNullOrWhiteSpace(result.Error));
    }
}
