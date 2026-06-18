using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class AskNotebookResponseContractTests
{
    [Fact]
    public void ConversationChatResultExposesNotebookAction()
    {
        var property = typeof(ConversationChatResult).GetProperty("NotebookAction");

        Assert.NotNull(property);
        Assert.Equal(typeof(AskNotebookAction), property!.PropertyType);
    }

    [Fact]
    public void ChatResultWsResponseExposesNotebookAction()
    {
        var responseType = typeof(ConversationChatResult).Assembly.GetType(
            "Omnux.Middleware.ChatResultWsResponse"
        );

        Assert.NotNull(responseType);
        var property = responseType!.GetProperty("NotebookAction");
        Assert.NotNull(property);
        Assert.Equal(typeof(AskNotebookAction), property!.PropertyType);
    }
}
