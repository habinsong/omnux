namespace Omnux.Middleware.Tests;

public sealed class CoreRuntimeClientTests
{
    [Fact]
    public async Task DotNetClient_ReturnsMetricsInLegacyLineFormat()
    {
        var client = new DotNetCoreRuntimeClient();

        var result = await client.GetMetricsAsync(CancellationToken.None);

        Assert.StartsWith("status=ok ", result, StringComparison.Ordinal);
        Assert.Contains("cpu_usage=", result, StringComparison.Ordinal);
        Assert.Contains("mem_free_mb=", result, StringComparison.Ordinal);
    }

    [Fact]
    public async Task DotNetClient_RejectsInvalidKillPid()
    {
        var client = new DotNetCoreRuntimeClient();

        var result = await client.KillAsync(1, CancellationToken.None);

        Assert.StartsWith("status=error", result, StringComparison.Ordinal);
        Assert.Contains("invalid pid", result, StringComparison.Ordinal);
    }
}
