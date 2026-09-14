using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class ProviderUrlContextTimeoutTests
{
    [Fact]
    public void 짧은_프롬프트는_기본_제한_시간을_그대로_쓴다()
    {
        Assert.Equal(30_000, ProviderTimeoutPolicy.ResolveUrlContextTimeoutMs(30_000, 4_000));
    }

    [Fact]
    public void 원문을_많이_실으면_제한_시간이_늘어난다()
    {
        var baseline = ProviderTimeoutPolicy.ResolveUrlContextTimeoutMs(30_000, 4_000);
        var large = ProviderTimeoutPolicy.ResolveUrlContextTimeoutMs(30_000, 20_000);

        Assert.True(large > baseline);
    }

    [Fact]
    public void 아무리_커도_기본의_세_배를_넘지_않는다()
    {
        Assert.Equal(90_000, ProviderTimeoutPolicy.ResolveUrlContextTimeoutMs(30_000, 5_000_000));
    }
}
