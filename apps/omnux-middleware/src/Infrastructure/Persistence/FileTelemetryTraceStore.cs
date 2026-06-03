using System.Globalization;

namespace Omnux.Middleware;

public sealed class FileTelemetryTraceStore
{
    private const int StateVersion = 1;
    private const int StoreLeaseRetryCount = 50;
    private const int StoreLeaseRetryDelayMs = 50;
    private const int MaxEvents = 2_000;
    private const int DefaultQueryLimit = 100;
    private const int MaxQueryLimit = 500;
    private const int MaxTokenChars = 160;
    private const int MaxErrorChars = 1_000;
    private const string StoreLeaseSuffix = ".telemetry.lease";

    private readonly string _storePath;
    private readonly object _lock = new();
    private readonly Func<DateTimeOffset> _utcNow;

    public FileTelemetryTraceStore(IStatePathResolver pathResolver)
        : this(pathResolver.ResolveStateFilePath("telemetry_traces.json"))
    {
    }

    public FileTelemetryTraceStore(string storePath, Func<DateTimeOffset>? utcNow = null)
    {
        _storePath = Path.GetFullPath(storePath);
        _utcNow = utcNow ?? (() => DateTimeOffset.UtcNow);
    }

    public void Append(TelemetryTraceEvent item)
    {
        if (!IsValidEvent(item))
        {
            return;
        }

        using var lease = AcquireStoreLease();
        lock (_lock)
        {
            var state = LoadUnsafe();
            state.Events.Add(CloneEvent(item));
            _ = PruneUnsafe(state);
            SaveUnsafe(state);
        }
    }

    public TelemetrySnapshot GetSnapshot(TelemetryTraceQuery? query = null)
    {
        using var lease = AcquireStoreLease();
        lock (_lock)
        {
            var state = LoadUnsafe();
            if (PruneUnsafe(state))
            {
                SaveUnsafe(state);
            }

            return BuildSnapshotUnsafe(state, query);
        }
    }

    private TelemetrySnapshot BuildSnapshotUnsafe(TelemetryTraceState state, TelemetryTraceQuery? query)
    {
        var provider = NormalizeOptionalToken(query?.Provider);
        var model = NormalizeOptionalToken(query?.Model);
        var status = NormalizeOptionalToken(query?.Status).ToLowerInvariant();
        var source = NormalizeOptionalToken(query?.Source).ToLowerInvariant();
        var sinceUtc = query?.SinceUtc;
        var limit = Math.Clamp(query?.Limit ?? DefaultQueryLimit, 1, MaxQueryLimit);

        var filtered = state.Events
            .Where(item => Matches(item, provider, model, status, source, sinceUtc))
            .OrderBy(item => item.CompletedUtc)
            .ToArray();
        var events = filtered
            .OrderByDescending(item => item.CompletedUtc)
            .Take(limit)
            .OrderBy(item => item.CompletedUtc)
            .ToArray();
        var providers = filtered
            .GroupBy(item => item.Provider, StringComparer.OrdinalIgnoreCase)
            .OrderByDescending(group => group.Sum(item => Math.Max(0L, item.TotalTokens)))
            .ThenBy(group => group.Key, StringComparer.OrdinalIgnoreCase)
            .Select(group => BuildProviderRollup(group.Key, group))
            .ToArray();

        return new TelemetrySnapshot(
            events,
            providers,
            BuildTokenRollup(filtered),
            state.Events.Count,
            filtered.Length,
            _utcNow()
        );
    }

    private TelemetryTraceState LoadUnsafe()
    {
        try
        {
            if (!File.Exists(_storePath))
            {
                return new TelemetryTraceState { Version = StateVersion };
            }

            var text = AtomicFileStore.ReadAllTextWithBackup(
                _storePath,
                value => TelemetryTraceJson.DeserializeState(value) != null,
                logScope: "telemetry-trace"
            );
            if (string.IsNullOrWhiteSpace(text))
            {
                return new TelemetryTraceState { Version = StateVersion };
            }

            var state = TelemetryTraceJson.DeserializeState(text)
                ?? new TelemetryTraceState { Version = StateVersion };
            state.Version = StateVersion;
            state.Events = (state.Events ?? new List<TelemetryTraceEvent>())
                .Where(IsValidEvent)
                .Select(CloneEvent)
                .ToList();
            return state;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[telemetry-trace] load failed: {ex.Message}");
            return new TelemetryTraceState { Version = StateVersion };
        }
    }

    private bool SaveUnsafe(TelemetryTraceState state)
    {
        try
        {
            state.Version = StateVersion;
            var payload = TelemetryTraceJson.SerializeState(state);
            AtomicFileStore.WriteAllText(_storePath, payload, ownerOnly: true);
            return true;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[telemetry-trace] save failed: {ex.Message}");
            return false;
        }
    }

    private FileStream AcquireStoreLease()
    {
        var storeDir = Path.GetDirectoryName(_storePath);
        if (string.IsNullOrWhiteSpace(storeDir))
        {
            throw new InvalidOperationException("invalid telemetry trace path");
        }

        Directory.CreateDirectory(storeDir);
        var leasePath = _storePath + StoreLeaseSuffix;
        Exception? lastError = null;
        for (var attempt = 0; attempt < StoreLeaseRetryCount; attempt++)
        {
            try
            {
                var stream = new FileStream(leasePath, FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None);
                try
                {
                    stream.SetLength(0);
                    using var writer = new StreamWriter(stream, leaveOpen: true);
                    writer.WriteLine(Environment.ProcessId.ToString(CultureInfo.InvariantCulture));
                    writer.WriteLine(_utcNow().ToString("O"));
                    writer.Flush();
                    stream.Flush(flushToDisk: true);
                    stream.Position = 0;
                    if (!OperatingSystem.IsWindows())
                    {
                        File.SetUnixFileMode(leasePath, UnixFileMode.UserRead | UnixFileMode.UserWrite);
                    }

                    return stream;
                }
                catch
                {
                    stream.Dispose();
                    throw;
                }
            }
            catch (IOException ex)
            {
                lastError = ex;
                Thread.Sleep(StoreLeaseRetryDelayMs);
            }
            catch (UnauthorizedAccessException ex)
            {
                lastError = ex;
                Thread.Sleep(StoreLeaseRetryDelayMs);
            }
        }

        throw new IOException("telemetry trace store lease unavailable", lastError);
    }

    private static TelemetryTokenRollup BuildTokenRollup(IReadOnlyCollection<TelemetryTraceEvent> events)
    {
        if (events.Count == 0)
        {
            return new TelemetryTokenRollup(0, 0, 0, 0, 0, 0);
        }

        return new TelemetryTokenRollup(
            events.Count,
            events.Sum(item => Math.Max(0L, item.PromptTokens)),
            events.Sum(item => Math.Max(0L, item.CompletionTokens)),
            events.Sum(item => Math.Max(0L, item.TotalTokens)),
            (long)Math.Round(events.Average(item => Math.Max(0L, item.DurationMs))),
            events.Max(item => Math.Max(0L, item.DurationMs))
        );
    }

    private static TelemetryProviderRollup BuildProviderRollup(
        string provider,
        IEnumerable<TelemetryTraceEvent> events
    )
    {
        var items = events.ToArray();
        if (items.Length == 0)
        {
            return new TelemetryProviderRollup(provider, 0, 0, 0, 0, 0, 0);
        }

        return new TelemetryProviderRollup(
            provider,
            items.Length,
            items.Sum(item => Math.Max(0L, item.PromptTokens)),
            items.Sum(item => Math.Max(0L, item.CompletionTokens)),
            items.Sum(item => Math.Max(0L, item.TotalTokens)),
            (long)Math.Round(items.Average(item => Math.Max(0L, item.DurationMs))),
            items.Max(item => Math.Max(0L, item.DurationMs))
        );
    }

    private static bool Matches(
        TelemetryTraceEvent item,
        string provider,
        string model,
        string status,
        string source,
        DateTimeOffset? sinceUtc
    )
    {
        if (sinceUtc.HasValue && item.CompletedUtc < sinceUtc.Value)
        {
            return false;
        }

        return (string.IsNullOrWhiteSpace(provider)
                || string.Equals(item.Provider, provider, StringComparison.OrdinalIgnoreCase))
               && (string.IsNullOrWhiteSpace(model)
                   || string.Equals(item.Model, model, StringComparison.OrdinalIgnoreCase))
               && (string.IsNullOrWhiteSpace(status)
                   || string.Equals(item.Status, status, StringComparison.OrdinalIgnoreCase))
               && (string.IsNullOrWhiteSpace(source)
                   || string.Equals(item.Source, source, StringComparison.OrdinalIgnoreCase));
    }

    private static bool IsValidEvent(TelemetryTraceEvent item)
    {
        return item != null
               && !string.IsNullOrWhiteSpace(item.Id)
               && !string.IsNullOrWhiteSpace(item.Operation)
               && !string.IsNullOrWhiteSpace(item.Provider)
               && !string.IsNullOrWhiteSpace(item.Status);
    }

    private static TelemetryTraceEvent CloneEvent(TelemetryTraceEvent item)
    {
        var startedUtc = item.StartedUtc == default ? DateTimeOffset.UtcNow : item.StartedUtc;
        var completedUtc = item.CompletedUtc == default ? startedUtc : item.CompletedUtc;
        var promptTokens = Math.Max(0L, item.PromptTokens);
        var completionTokens = Math.Max(0L, item.CompletionTokens);
        var totalTokens = Math.Max(0L, item.TotalTokens);
        if (totalTokens == 0 && (promptTokens > 0 || completionTokens > 0))
        {
            totalTokens = promptTokens + completionTokens;
        }

        return item with
        {
            Id = NormalizeRequiredToken(item.Id),
            Operation = NormalizeRequiredToken(item.Operation),
            Provider = NormalizeRequiredToken(item.Provider).ToLowerInvariant(),
            Model = NormalizeOptionalToken(item.Model),
            Status = NormalizeRequiredToken(item.Status).ToLowerInvariant(),
            Source = NormalizeOptionalToken(item.Source).ToLowerInvariant(),
            TraceId = NormalizeOptionalToken(item.TraceId),
            SpanId = NormalizeOptionalToken(item.SpanId),
            PromptTokens = promptTokens,
            CompletionTokens = completionTokens,
            TotalTokens = totalTokens,
            TokenUsageSource = NormalizeOptionalToken(item.TokenUsageSource).ToLowerInvariant(),
            PromptChars = Math.Max(0, item.PromptChars),
            CompletionChars = Math.Max(0, item.CompletionChars),
            MaxOutputTokens = Math.Max(0, item.MaxOutputTokens),
            DurationMs = Math.Max(0L, item.DurationMs),
            Error = TrimForStorage(item.Error, MaxErrorChars),
            StartedUtc = startedUtc,
            CompletedUtc = completedUtc,
            PromptCacheEligible = item.PromptCacheEligible,
            PromptCacheKey = NormalizeOptionalToken(item.PromptCacheKey).ToLowerInvariant(),
            PromptCacheAffinityKey = NormalizeOptionalToken(item.PromptCacheAffinityKey).ToLowerInvariant(),
            PromptCacheStaticChars = Math.Max(0, item.PromptCacheStaticChars),
            PromptCacheStaticTokens = Math.Max(0L, item.PromptCacheStaticTokens),
            PromptCacheStrategy = NormalizeOptionalToken(item.PromptCacheStrategy).ToLowerInvariant(),
            PromptCacheReason = NormalizeOptionalToken(item.PromptCacheReason).ToLowerInvariant(),
            ModelRoutingComplexity = NormalizeOptionalToken(item.ModelRoutingComplexity).ToLowerInvariant(),
            ModelRoutingRecommendedTier = NormalizeOptionalToken(item.ModelRoutingRecommendedTier).ToLowerInvariant(),
            ModelRoutingCascadeEligible = item.ModelRoutingCascadeEligible,
            ModelRoutingEstimatedInputTokens = Math.Max(0L, item.ModelRoutingEstimatedInputTokens),
            ModelRoutingSignals = NormalizeOptionalToken(item.ModelRoutingSignals).ToLowerInvariant(),
            ModelRoutingReason = NormalizeOptionalToken(item.ModelRoutingReason).ToLowerInvariant()
        };
    }

    private static bool PruneUnsafe(TelemetryTraceState state)
    {
        var before = state.Events.Count;
        state.Events = state.Events
            .OrderByDescending(item => item.CompletedUtc)
            .Take(MaxEvents)
            .OrderBy(item => item.CompletedUtc)
            .ToList();
        return state.Events.Count != before;
    }

    private static string NormalizeRequiredToken(string? value)
    {
        return TrimForStorage(value, MaxTokenChars);
    }

    private static string NormalizeOptionalToken(string? value)
    {
        return TrimForStorage(value, MaxTokenChars);
    }

    private static string TrimForStorage(string? value, int maxChars)
    {
        var normalized = (value ?? string.Empty).Trim();
        if (normalized.Length <= maxChars)
        {
            return normalized;
        }

        return normalized[..maxChars];
    }
}
