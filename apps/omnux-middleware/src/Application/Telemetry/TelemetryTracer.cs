using System.Diagnostics;

namespace Omnux.Middleware;

public sealed class TelemetryTracer
{
    internal const string ActivitySourceName = "Omnux.Middleware.Telemetry";

    private static readonly ActivitySource ActivitySource = new(ActivitySourceName);
    private readonly FileTelemetryTraceStore _store;

    public TelemetryTracer(FileTelemetryTraceStore store)
    {
        _store = store;
    }

    internal TelemetryLlmCallScope StartLlmCall(TelemetryLlmCallRequest request)
    {
        return new TelemetryLlmCallScope(_store, ActivitySource, request);
    }

    public TelemetrySnapshot GetSnapshot(TelemetryTraceQuery? query = null)
    {
        return _store.GetSnapshot(query);
    }
}

internal sealed class TelemetryLlmCallScope : IDisposable
{
    private const string OperationName = "llm.call";

    private readonly FileTelemetryTraceStore _store;
    private readonly TelemetryLlmCallRequest _request;
    private readonly Activity? _activity;
    private readonly Stopwatch _stopwatch;
    private readonly DateTimeOffset _startedUtc;
    private bool _completed;

    public TelemetryLlmCallScope(
        FileTelemetryTraceStore store,
        ActivitySource activitySource,
        TelemetryLlmCallRequest request
    )
    {
        _store = store;
        _request = request;
        _startedUtc = DateTimeOffset.UtcNow;
        _stopwatch = Stopwatch.StartNew();
        _activity = activitySource.StartActivity(OperationName, ActivityKind.Internal);
        _activity?.SetTag("gen_ai.operation.name", "chat");
        _activity?.SetTag("gen_ai.system", NormalizeProvider(request.Provider));
        _activity?.SetTag("gen_ai.request.model", NormalizeToken(request.Model));
        _activity?.SetTag("gen_ai.request.max_tokens", Math.Max(0, request.MaxOutputTokens));
        _activity?.SetTag("omnux.source", NormalizeToken(request.Source));
        _activity?.SetTag("omnux.streaming", request.Streaming);
    }

    public void Complete(string provider, string model, string responseText, TokenUsage? usage)
    {
        if (_completed)
        {
            return;
        }

        var status = ResolveStatus(responseText);
        var error = status == "ok" ? string.Empty : Trim(responseText, 1_000);
        Record(provider, model, status, responseText?.Length ?? 0, usage, error);
    }

    public void Fail(string provider, string model, string status, string error)
    {
        if (_completed)
        {
            return;
        }

        Record(provider, model, status, 0, null, error);
    }

    public void Dispose()
    {
        if (!_completed)
        {
            _activity?.Stop();
            _completed = true;
        }
    }

    private void Record(
        string provider,
        string model,
        string status,
        int completionChars,
        TokenUsage? usage,
        string error
    )
    {
        _stopwatch.Stop();
        _completed = true;

        var normalizedUsage = usage == null
            ? new TokenUsage(0, 0, 0, TokenUsageEstimator.SourceUnavailable)
            : TokenUsageEstimator.Normalize(usage);
        var normalizedProvider = NormalizeProvider(provider);
        var normalizedModel = NormalizeToken(model);
        var normalizedStatus = NormalizeStatus(status);
        var completedUtc = DateTimeOffset.UtcNow;

        _activity?.SetTag("gen_ai.system", normalizedProvider);
        _activity?.SetTag("gen_ai.response.model", normalizedModel);
        _activity?.SetTag("gen_ai.usage.input_tokens", normalizedUsage.PromptTokens);
        _activity?.SetTag("gen_ai.usage.output_tokens", normalizedUsage.CompletionTokens);
        _activity?.SetTag("omnux.usage.total_tokens", normalizedUsage.TotalTokens);
        _activity?.SetTag("omnux.usage.source", normalizedUsage.Source);
        _activity?.SetTag("omnux.status", normalizedStatus);
        _activity?.SetTag("omnux.duration_ms", Math.Max(0L, _stopwatch.ElapsedMilliseconds));
        if (normalizedStatus == "ok")
        {
            _activity?.SetStatus(ActivityStatusCode.Ok);
        }
        else
        {
            _activity?.SetStatus(ActivityStatusCode.Error, Trim(error, 240));
        }

        var item = new TelemetryTraceEvent(
            $"telemetry_{completedUtc:yyyyMMddHHmmssfff}_{Guid.NewGuid():N}",
            OperationName,
            normalizedProvider,
            normalizedModel,
            normalizedStatus,
            NormalizeToken(_request.Source).ToLowerInvariant(),
            _activity?.TraceId.ToString() ?? string.Empty,
            _activity?.SpanId.ToString() ?? string.Empty,
            normalizedUsage.PromptTokens,
            normalizedUsage.CompletionTokens,
            normalizedUsage.TotalTokens,
            normalizedUsage.Source,
            Math.Max(0, _request.PromptChars),
            Math.Max(0, completionChars),
            Math.Max(0, _request.MaxOutputTokens),
            _request.Streaming,
            Math.Max(0L, _stopwatch.ElapsedMilliseconds),
            normalizedStatus == "ok" ? string.Empty : Trim(error, 1_000),
            _startedUtc,
            completedUtc
        );

        try
        {
            _store.Append(item);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[telemetry-trace] record failed: {ex.Message}");
        }
        finally
        {
            _activity?.Stop();
        }
    }

    private static string ResolveStatus(string? responseText)
    {
        var normalized = (responseText ?? string.Empty).Trim().ToLowerInvariant();
        if (normalized.Length == 0)
        {
            return "empty";
        }

        if (normalized.Contains("응답 시간이 초과", StringComparison.Ordinal)
            || normalized.Contains("timeout", StringComparison.Ordinal)
            || normalized.Contains("timed out", StringComparison.Ordinal))
        {
            return "timeout";
        }

        if (normalized.Contains("호출 오류", StringComparison.Ordinal)
            || normalized.Contains("error:", StringComparison.Ordinal)
            || normalized.Contains("exception", StringComparison.Ordinal))
        {
            return "error";
        }

        return "ok";
    }

    private static string NormalizeStatus(string? status)
    {
        var normalized = NormalizeToken(status).ToLowerInvariant();
        return string.IsNullOrWhiteSpace(normalized) ? "unknown" : normalized;
    }

    private static string NormalizeProvider(string? provider)
    {
        var normalized = NormalizeToken(provider).ToLowerInvariant();
        return string.IsNullOrWhiteSpace(normalized) ? "unknown" : normalized;
    }

    private static string NormalizeToken(string? value)
    {
        var normalized = (value ?? string.Empty).Trim();
        return normalized.Length <= 160 ? normalized : normalized[..160];
    }

    private static string Trim(string? value, int maxChars)
    {
        var normalized = (value ?? string.Empty).Trim();
        return normalized.Length <= maxChars ? normalized : normalized[..maxChars];
    }
}
