using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class TelemetryTracerTests
{
    [Fact]
    public void Complete_PersistsTokenUsageAndDoesNotStoreResponseText()
    {
        using var temp = TestStateDirectory.Create();
        var tracer = CreateTracer(temp.Path);

        using (var scope = tracer.StartLlmCall(new TelemetryLlmCallRequest(
                   "gemini",
                   "gemini-test",
                   PromptChars: 123,
                   MaxOutputTokens: 512,
                   Streaming: false,
                   Source: "test"
               )))
        {
            scope.Complete(
                "gemini",
                "gemini-test",
                "정상 응답 본문",
                new TokenUsage(10, 5, 15, TokenUsageEstimator.SourceExact)
            );
        }

        var snapshot = tracer.GetSnapshot();

        Assert.Single(snapshot.Events);
        var item = snapshot.Events[0];
        Assert.Equal("llm.call", item.Operation);
        Assert.Equal("gemini", item.Provider);
        Assert.Equal("gemini-test", item.Model);
        Assert.Equal("ok", item.Status);
        Assert.Equal(10, item.PromptTokens);
        Assert.Equal(5, item.CompletionTokens);
        Assert.Equal(15, item.TotalTokens);
        Assert.Equal(123, item.PromptChars);
        Assert.Equal("정상 응답 본문".Length, item.CompletionChars);
        Assert.Equal(512, item.MaxOutputTokens);
        Assert.Empty(item.Error);
        Assert.Equal(15, snapshot.Total.TotalTokens);
        Assert.DoesNotContain("정상 응답 본문", TelemetryTraceJson.SerializeSnapshot(snapshot));
    }

    [Fact]
    public void GetSnapshot_FiltersByProviderAndBuildsProviderRollup()
    {
        using var temp = TestStateDirectory.Create();
        var tracer = CreateTracer(temp.Path);

        CompleteCall(tracer, "groq", "fast", new TokenUsage(20, 10, 30, TokenUsageEstimator.SourceExact));
        CompleteCall(tracer, "gemini", "flash", new TokenUsage(7, 3, 10, TokenUsageEstimator.SourceExact));

        var snapshot = tracer.GetSnapshot(new TelemetryTraceQuery(Provider: "groq"));

        Assert.Single(snapshot.Events);
        Assert.Single(snapshot.Providers);
        Assert.Equal("groq", snapshot.Providers[0].Provider);
        Assert.Equal(30, snapshot.Providers[0].TotalTokens);
        Assert.Equal(2, snapshot.TotalEvents);
        Assert.Equal(1, snapshot.FilteredEvents);
        Assert.Equal(30, snapshot.Total.TotalTokens);
    }

    [Fact]
    public void Fail_PersistsErrorStatusWithoutThrowing()
    {
        using var temp = TestStateDirectory.Create();
        var tracer = CreateTracer(temp.Path);

        using (var scope = tracer.StartLlmCall(new TelemetryLlmCallRequest(
                   "codex",
                   "gpt-test",
                   PromptChars: 40,
                   MaxOutputTokens: 256,
                   Streaming: true,
                   Source: "test"
               )))
        {
            scope.Fail("codex", "gpt-test", "error", "provider unavailable");
        }

        var snapshot = tracer.GetSnapshot(new TelemetryTraceQuery(Status: "error"));

        Assert.Single(snapshot.Events);
        Assert.Equal("codex", snapshot.Events[0].Provider);
        Assert.Equal("error", snapshot.Events[0].Status);
        Assert.Equal("provider unavailable", snapshot.Events[0].Error);
        Assert.True(snapshot.Events[0].Streaming);
    }

    private static void CompleteCall(TelemetryTracer tracer, string provider, string model, TokenUsage usage)
    {
        using var scope = tracer.StartLlmCall(new TelemetryLlmCallRequest(
            provider,
            model,
            PromptChars: 10,
            MaxOutputTokens: 256,
            Streaming: false,
            Source: "test"
        ));
        scope.Complete(provider, model, "ok", usage);
    }

    private static TelemetryTracer CreateTracer(string stateDir)
    {
        return new TelemetryTracer(
            new FileTelemetryTraceStore(Path.Combine(stateDir, "telemetry_traces.json"))
        );
    }

    private sealed class TestStateDirectory : IDisposable
    {
        private TestStateDirectory(string path)
        {
            Path = path;
        }

        public string Path { get; }

        public static TestStateDirectory Create()
        {
            var path = System.IO.Path.Combine(
                System.IO.Path.GetTempPath(),
                "omnux-telemetry-tests",
                Guid.NewGuid().ToString("N")
            );
            Directory.CreateDirectory(path);
            return new TestStateDirectory(path);
        }

        public void Dispose()
        {
            try
            {
                if (Directory.Exists(Path))
                {
                    Directory.Delete(Path, recursive: true);
                }
            }
            catch
            {
                // best effort cleanup
            }
        }
    }
}
