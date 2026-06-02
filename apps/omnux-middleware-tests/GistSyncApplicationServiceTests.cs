using System.Net;
using System.Text;
using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class GistSyncApplicationServiceTests
{
    [Fact]
    public async Task UploadBackupToGistAsync_CreatesNewGist_WhenGistIdIsNull()
    {
        // Arrange
        var handler = new MockHttpMessageHandler(new HttpResponseMessage
        {
            StatusCode = HttpStatusCode.Created,
            Content = new StringContent("{\"id\": \"new-gist-123\"}")
        });
        var client = new HttpClient(handler);
        var service = new GistSyncApplicationService(client);
        var zipBytes = Encoding.UTF8.GetBytes("fake-zip-data");

        // Act
        var resultId = await service.UploadBackupToGistAsync(zipBytes, "fake-token", null);

        // Assert
        Assert.Equal("new-gist-123", resultId);
        Assert.Single(handler.Requests);
        Assert.Equal(HttpMethod.Post, handler.Requests[0].Method);
        Assert.Equal("https://api.github.com/gists", handler.Requests[0].RequestUri!.ToString());
    }

    [Fact]
    public async Task UploadBackupToGistAsync_UpdatesExistingGist_WhenGistIdIsProvided()
    {
        // Arrange
        var handler = new MockHttpMessageHandler(new HttpResponseMessage
        {
            StatusCode = HttpStatusCode.OK,
            Content = new StringContent("{\"id\": \"existing-gist-456\"}")
        });
        var client = new HttpClient(handler);
        var service = new GistSyncApplicationService(client);
        var zipBytes = Encoding.UTF8.GetBytes("fake-zip-data");

        // Act
        var resultId = await service.UploadBackupToGistAsync(zipBytes, "fake-token", "existing-gist-456");

        // Assert
        Assert.Equal("existing-gist-456", resultId);
        Assert.Single(handler.Requests);
        Assert.Equal(HttpMethod.Patch, handler.Requests[0].Method);
        Assert.Equal("https://api.github.com/gists/existing-gist-456", handler.Requests[0].RequestUri!.ToString());
    }

    [Fact]
    public async Task DownloadBackupFromGistAsync_ReturnsZipBytes()
    {
        // Arrange
        var handler = new MockHttpMessageHandler();
        handler.Responses.Enqueue(new HttpResponseMessage
        {
            StatusCode = HttpStatusCode.OK,
            Content = new StringContent("{\"files\": {\"omnux-portable-package.b64\": {\"content\": \"ZmFrZS16aXAtZGF0YQ==\", \"truncated\": false}}}") // "fake-zip-data" in base64
        });
        
        var client = new HttpClient(handler);
        var service = new GistSyncApplicationService(client);

        // Act
        var resultBytes = await service.DownloadBackupFromGistAsync("target-gist", "fake-token");

        // Assert
        Assert.Equal("fake-zip-data", Encoding.UTF8.GetString(resultBytes));
        Assert.Single(handler.Requests);
        Assert.Equal(HttpMethod.Get, handler.Requests[0].Method);
    }
}

public class MockHttpMessageHandler : HttpMessageHandler
{
    public Queue<HttpResponseMessage> Responses { get; } = new();
    public List<HttpRequestMessage> Requests { get; } = new();

    public MockHttpMessageHandler(HttpResponseMessage? defaultResponse = null)
    {
        if (defaultResponse != null)
        {
            Responses.Enqueue(defaultResponse);
        }
    }

    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        Requests.Add(request);
        if (Responses.TryDequeue(out var response))
        {
            return Task.FromResult(response);
        }
        return Task.FromResult(new HttpResponseMessage(HttpStatusCode.NotFound));
    }
}
