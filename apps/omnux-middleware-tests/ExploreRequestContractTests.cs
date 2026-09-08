using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class ExploreRequestContractTests
{
    [Theory]
    [InlineData("task")]
    [InlineData("spawnTask")]
    public void SessionTaskSurvivesDesktopAndToolRequestForms(string field)
    {
        var message = WebSocketGateway.ParseClientMessage($$"""{"type":"sessions_spawn","{{field}}":"검증할 작업","requestId":"request"}""");
        Assert.Equal("검증할 작업", message!.SpawnTask);
    }

    [Theory]
    [InlineData("browser", "url")]
    [InlineData("browser", "webFetchUrl")]
    [InlineData("canvas", "url")]
    [InlineData("canvas", "webFetchUrl")]
    [InlineData("web_fetch", "url")]
    [InlineData("web_fetch", "webFetchUrl")]
    public void UrlSurvivesDesktopAndToolRequestForms(string type, string field)
    {
        var message = WebSocketGateway.ParseClientMessage($$"""{"type":"{{type}}","action":"open","{{field}}":"https://example.com/page","requestId":"request"}""");
        Assert.NotNull(message);
        Assert.Equal("https://example.com/page", message.WebFetchUrl);
        Assert.Equal("request", message.RequestId);
    }

    [Fact]
    public void CanonicalUrlTakesPrecedenceOverLegacyAlias()
    {
        var message = WebSocketGateway.ParseClientMessage("""{"type":"web_fetch","url":"https://example.com/main","webFetchUrl":"https://example.com/other"}""");
        Assert.Equal("https://example.com/main", message!.WebFetchUrl);
    }
}
