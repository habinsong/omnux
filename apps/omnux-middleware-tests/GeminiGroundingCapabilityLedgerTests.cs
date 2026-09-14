using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class GeminiGroundingCapabilityLedgerTests
{
    private static readonly string[] Fallbacks = { "gemini-3.8-flash", "gemini-3.6-flash" };

    [Fact]
    public void 아무것도_모르면_설정한_모델을_그대로_쓴다()
    {
        var ledger = new GeminiGroundingCapabilityLedger();

        Assert.Equal("gemini-3.1-flash-lite", ledger.ResolveGroundingModel("gemini-3.1-flash-lite", Fallbacks));
    }

    [Fact]
    public void 한_번_빠진_것으로는_모델을_바꾸지_않는다()
    {
        var ledger = new GeminiGroundingCapabilityLedger();
        ledger.Record("gemini-3.1-flash-lite", grounded: false);

        Assert.Equal("gemini-3.1-flash-lite", ledger.ResolveGroundingModel("gemini-3.1-flash-lite", Fallbacks));
    }

    [Fact]
    public void 계속_근거가_없으면_다른_모델로_넘긴다()
    {
        var ledger = new GeminiGroundingCapabilityLedger();
        ledger.Record("gemini-3.1-flash-lite", grounded: false);
        ledger.Record("gemini-3.1-flash-lite", grounded: false);

        Assert.Equal("gemini-3.8-flash", ledger.ResolveGroundingModel("gemini-3.1-flash-lite", Fallbacks));
    }

    [Fact]
    public void 근거가_한_번_붙으면_다시_그_모델을_쓴다()
    {
        var ledger = new GeminiGroundingCapabilityLedger();
        ledger.Record("gemini-3.1-flash-lite", grounded: false);
        ledger.Record("gemini-3.1-flash-lite", grounded: false);
        ledger.Record("gemini-3.1-flash-lite", grounded: true);

        Assert.False(ledger.IsKnownNotGrounding("gemini-3.1-flash-lite"));
        Assert.Equal("gemini-3.1-flash-lite", ledger.ResolveGroundingModel("gemini-3.1-flash-lite", Fallbacks));
    }

    [Fact]
    public void 후보가_전부_안_되면_원래_모델을_쓴다()
    {
        var ledger = new GeminiGroundingCapabilityLedger();
        foreach (var model in new[] { "gemini-3.1-flash-lite", "gemini-3.8-flash", "gemini-3.6-flash" })
        {
            ledger.Record(model, grounded: false);
            ledger.Record(model, grounded: false);
        }

        Assert.Equal("gemini-3.1-flash-lite", ledger.ResolveGroundingModel("gemini-3.1-flash-lite", Fallbacks));
    }
}
