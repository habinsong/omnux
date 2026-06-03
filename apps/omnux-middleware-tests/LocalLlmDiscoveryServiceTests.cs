using Omnux.Middleware;
using System.Net;

namespace Omnux.Middleware.Tests;

public sealed class LocalLlmDiscoveryServiceTests
{
    [Fact]
    public void ParseOllamaTagsReadsModelDetails()
    {
        var models = LocalLlmDiscoveryService.ParseOllamaTags(
            """
            {
              "models": [
                {
                  "name": "qwen2.5-coder:7b",
                  "size": 4683072000,
                  "modified_at": "2026-06-04T00:00:00Z",
                  "details": {
                    "family": "qwen2",
                    "parameter_size": "7B",
                    "quantization_level": "Q4_K_M"
                  }
                }
              ]
            }
            """
        );

        var model = Assert.Single(models);
        Assert.Equal("qwen2.5-coder:7b", model.Id);
        Assert.Equal("ollama", model.OwnedBy);
        Assert.Equal("qwen2", model.Family);
        Assert.Equal("7B", model.ParameterSize);
        Assert.Equal("Q4_K_M", model.Quantization);
        Assert.Equal(4683072000, model.SizeBytes);
        Assert.Equal(DateTimeOffset.Parse("2026-06-04T00:00:00Z"), model.ModifiedAtUtc);
    }

    [Fact]
    public async Task DiscoverAsyncProbesOllamaAndOpenAiCompatibleEndpoints()
    {
        var endpoints = new[]
        {
            new LocalLlmEndpointConfig("ollama-test", "ollama", "http://local-ollama.test"),
            new LocalLlmEndpointConfig("lmstudio-test", "openai_compatible", "http://local-lmstudio.test")
        };
        var client = new HttpClient(new StubHttpMessageHandler(request =>
        {
            if (request.RequestUri?.AbsolutePath == "/api/tags")
            {
                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent("""{"models":[{"name":"gemma3:4b","details":{"family":"gemma","parameter_size":"4B"}}]}""")
                };
            }

            if (request.RequestUri?.AbsolutePath == "/v1/models")
            {
                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent("""{"data":[{"id":"local-model","owned_by":"lm-studio"}]}""")
                };
            }

            return new HttpResponseMessage(HttpStatusCode.NotFound);
        }));

        var snapshot = await new LocalLlmDiscoveryService(
                client,
                endpoints,
                () => DateTimeOffset.Parse("2026-06-04T00:00:00Z")
            )
            .DiscoverAsync(CancellationToken.None);

        Assert.True(snapshot.OfflineReady);
        Assert.Equal(2, snapshot.AvailableEndpointCount);
        Assert.Equal(2, snapshot.TotalModelCount);
        Assert.Empty(snapshot.Warnings);
        Assert.Equal(DateTimeOffset.Parse("2026-06-04T00:00:00Z"), snapshot.ScannedAtUtc);
        Assert.Contains(snapshot.Endpoints, endpoint => endpoint.Kind == "ollama" && endpoint.Models.Any(model => model.Id == "gemma3:4b"));
        Assert.Contains(snapshot.Endpoints, endpoint => endpoint.Kind == "openai_compatible" && endpoint.Models.Any(model => model.Id == "local-model"));
    }

    [Fact]
    public async Task DiscoverAsyncReturnsWarningForUnavailableEndpoint()
    {
        var endpoints = new[]
        {
            new LocalLlmEndpointConfig("down", "openai_compatible", "http://local-down.test")
        };
        var client = new HttpClient(new StubHttpMessageHandler(_ =>
            new HttpResponseMessage(HttpStatusCode.ServiceUnavailable)
        ));

        var snapshot = await new LocalLlmDiscoveryService(client, endpoints)
            .DiscoverAsync(CancellationToken.None);

        Assert.False(snapshot.OfflineReady);
        Assert.Equal(0, snapshot.AvailableEndpointCount);
        Assert.NotEmpty(snapshot.Warnings);
        var endpoint = Assert.Single(snapshot.Endpoints);
        Assert.Equal("unavailable", endpoint.Status);
        Assert.Equal("http_503", endpoint.Error);
    }

    [Fact]
    public async Task DiscoverAsyncReportsOfflineModeReadinessWhenRequested()
    {
        var endpoints = new[]
        {
            new LocalLlmEndpointConfig("ollama-test", "ollama", "http://local-ollama.test")
        };
        var client = new HttpClient(new StubHttpMessageHandler(_ =>
            new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent("""{"models":[{"name":"qwen2.5-coder:7b"}]}""")
            }
        ));

        var snapshot = await new LocalLlmDiscoveryService(
                client,
                endpoints,
                () => DateTimeOffset.Parse("2026-06-04T00:00:00Z"),
                EnvMap(
                    ("OMNUX_OFFLINE_MODE", "true"),
                    ("OMNUX_GROQ_API_KEY_FILE", "/tmp/groq-key")
                )
            )
            .DiscoverAsync(CancellationToken.None);

        Assert.True(snapshot.OfflineMode.Requested);
        Assert.Equal("ready_for_manual_routing", snapshot.OfflineMode.Status);
        Assert.Equal(new[] { "OMNUX_OFFLINE_MODE" }, snapshot.OfflineMode.RequestedBy);
        Assert.Equal(new[] { "OMNUX_GROQ_API_KEY_FILE" }, snapshot.OfflineMode.CloudProviderKeysPresent);
        Assert.DoesNotContain("/tmp/groq-key", string.Join(" ", snapshot.OfflineMode.CloudProviderKeysPresent));
        Assert.Contains(snapshot.OfflineMode.Checks, check =>
            check.Name == "local_models" && check.Status == "ok");
        Assert.Contains(snapshot.OfflineMode.Checks, check =>
            check.Name == "traffic_guard" && check.Status == "skipped");
    }

    [Fact]
    public async Task DiscoverAsyncBlocksOfflineModeWithoutLocalModels()
    {
        var endpoints = new[]
        {
            new LocalLlmEndpointConfig("down", "openai_compatible", "http://local-down.test")
        };
        var client = new HttpClient(new StubHttpMessageHandler(_ =>
            new HttpResponseMessage(HttpStatusCode.ServiceUnavailable)
        ));

        var snapshot = await new LocalLlmDiscoveryService(
                client,
                endpoints,
                () => DateTimeOffset.Parse("2026-06-04T00:00:00Z"),
                EnvMap(("OMNUX_LOCAL_LLM_ONLY", "1"))
            )
            .DiscoverAsync(CancellationToken.None);

        Assert.True(snapshot.OfflineMode.Requested);
        Assert.Equal("blocked", snapshot.OfflineMode.Status);
        Assert.Equal(new[] { "OMNUX_LOCAL_LLM_ONLY" }, snapshot.OfflineMode.RequestedBy);
        Assert.Contains(snapshot.OfflineMode.Checks, check =>
            check.Name == "local_models" && check.Status == "failed");
    }

    private static Func<string, string?> EnvMap(params (string Key, string Value)[] values)
    {
        var map = values.ToDictionary(item => item.Key, item => item.Value, StringComparer.Ordinal);
        return key => map.TryGetValue(key, out var value) ? value : null;
    }

    private sealed class StubHttpMessageHandler : HttpMessageHandler
    {
        private readonly Func<HttpRequestMessage, HttpResponseMessage> _handler;

        public StubHttpMessageHandler(Func<HttpRequestMessage, HttpResponseMessage> handler)
        {
            _handler = handler;
        }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            return Task.FromResult(_handler(request));
        }
    }
}
