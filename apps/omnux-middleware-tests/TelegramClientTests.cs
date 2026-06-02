using System.Net;
using System.Text;
using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class TelegramClientTests
{
    [Fact]
    public async Task SendDocumentAsyncPostsMultipartDocumentToTelegram()
    {
        HttpRequestMessage? capturedRequest = null;
        string? capturedBody = null;
        var client = new TelegramClient(
            CreateRuntimeSettings("bot-token", "chat-42"),
            new HttpClient(new StubHttpMessageHandler(async (request, cancellationToken) =>
            {
                capturedRequest = request;
                capturedBody = request.Content == null
                    ? string.Empty
                    : await request.Content.ReadAsStringAsync(cancellationToken);
                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent("""{"ok":true}""")
                };
            }))
        );

        var ok = await client.SendDocumentAsync(
            Encoding.UTF8.GetBytes("hello file"),
            "result.txt",
            "caption text",
            CancellationToken.None
        );

        Assert.True(ok);
        Assert.NotNull(capturedRequest);
        Assert.Equal(HttpMethod.Post, capturedRequest!.Method);
        Assert.Equal("https://api.telegram.org/botbot-token/sendDocument", capturedRequest.RequestUri!.ToString());
        Assert.Contains("chat_id", capturedBody);
        Assert.Contains("chat-42", capturedBody);
        Assert.Contains("caption", capturedBody);
        Assert.Contains("caption text", capturedBody);
        Assert.Contains("document", capturedBody);
        Assert.Contains("result.txt", capturedBody);
        Assert.Contains("hello file", capturedBody);
    }

    [Fact]
    public async Task SendDocumentAsyncDoesNotPostWhenTelegramRouteIsMissing()
    {
        var requestCount = 0;
        var client = new TelegramClient(
            CreateRuntimeSettings(null, null),
            new HttpClient(new StubHttpMessageHandler((_, _) =>
            {
                requestCount += 1;
                return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK));
            }))
        );

        var ok = await client.SendDocumentAsync(
            Encoding.UTF8.GetBytes("hello file"),
            "result.txt",
            "caption text",
            CancellationToken.None
        );

        Assert.False(ok);
        Assert.Equal(0, requestCount);
    }

    private static RuntimeSettings CreateRuntimeSettings(string? botToken, string? chatId)
    {
        return new RuntimeSettings(new AppConfig
        {
            TelegramBotToken = botToken,
            TelegramChatId = chatId,
            DashboardAccessStatePath = Path.Combine(Path.GetTempPath(), $"{Guid.NewGuid():N}.json")
        });
    }

    private sealed class StubHttpMessageHandler : HttpMessageHandler
    {
        private readonly Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> _handler;

        public StubHttpMessageHandler(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> handler)
        {
            _handler = handler;
        }

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken
        )
        {
            return _handler(request, cancellationToken);
        }
    }
}
