using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class TaskAttemptRequestTests
{
    [Theory]
    [InlineData("ts")]
    [InlineData("timestamp")]
    public void AttemptTimestampSurvivesTheWireParser(string field)
    {
        var message = WebSocketGateway.ParseClientMessage($$"""{"type":"task_output_get","graphId":"graph","taskId":"task","{{field}}":1788754349123,"requestId":"output-request"}""");
        Assert.NotNull(message);
        Assert.Equal(1788754349123,message.Timestamp);
        Assert.Equal("output-request",message.RequestId);
    }
}
