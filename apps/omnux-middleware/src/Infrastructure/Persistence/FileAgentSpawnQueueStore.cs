using System.Text;

namespace Omnux.Middleware;

public sealed class FileAgentSpawnQueueStore
{
    public const int MaxRetryAttempts = 8;
    private const string StoreLeaseSuffix = ".queue.lease";
    private const int StoreLeaseRetryCount = 50;
    private const int StoreLeaseRetryDelayMs = 50;
    private const int MinClaimLeaseSeconds = 300;
    private const int MaxClaimLeaseSeconds = 7_200;

    private readonly string _storePath;
    private readonly object _lock = new();

    public FileAgentSpawnQueueStore(IStatePathResolver pathResolver)
        : this(pathResolver.ResolveStateFilePath("agent_spawn_queue.json"))
    {
    }

    public FileAgentSpawnQueueStore(string storePath)
    {
        _storePath = Path.GetFullPath(storePath);
    }

    public string Enqueue(AgentSpawnQueueEntry entry)
    {
        if (entry == null || string.IsNullOrWhiteSpace(entry.Task) || string.IsNullOrWhiteSpace(entry.ChildSessionKey))
        {
            return string.Empty;
        }

        using var lease = AcquireStoreLease();
        lock (_lock)
        {
            var state = LoadUnsafe();
            var normalized = CloneEntry(entry);
            normalized.Id = string.IsNullOrWhiteSpace(normalized.Id)
                ? $"spawnq_{normalized.EnqueuedUtc:yyyyMMddHHmmssfff}_{Guid.NewGuid():N}"
                : normalized.Id.Trim();
            normalized.RunId = string.IsNullOrWhiteSpace(normalized.RunId)
                ? Guid.NewGuid().ToString("N")
                : normalized.RunId.Trim();
            normalized.Runtime = NormalizeToken(normalized.Runtime, "subagent");
            normalized.Mode = NormalizeToken(normalized.Mode, "run");
            normalized.CommandPriority = NormalizeOptional(normalized.CommandPriority);
            normalized.EnqueuedUtc = normalized.EnqueuedUtc == default ? DateTimeOffset.UtcNow : normalized.EnqueuedUtc;
            normalized.NextAttemptUtc = normalized.NextAttemptUtc == default
                ? normalized.EnqueuedUtc
                : normalized.NextAttemptUtc;
            normalized.AttemptCount = Math.Max(0, normalized.AttemptCount);
            normalized.LastError = NormalizeOptional(normalized.LastError) ?? string.Empty;

            state.Entries.RemoveAll(existing => string.Equals(existing.Id, normalized.Id, StringComparison.Ordinal));
            state.Entries.Add(normalized);
            if (!SaveUnsafe(state))
            {
                return string.Empty;
            }

            return normalized.Id;
        }
    }

    public IReadOnlyList<AgentSpawnQueueEntry> GetReadyEntries(DateTimeOffset nowUtc, int maxCount)
    {
        var safeMaxCount = Math.Max(1, maxCount);
        using var lease = AcquireStoreLease();
        lock (_lock)
        {
            var state = LoadUnsafe();
            return state.Entries
                .Where(entry => entry.NextAttemptUtc <= nowUtc
                                && IsClaimLeaseAvailable(entry, nowUtc)
                                && !string.IsNullOrWhiteSpace(entry.Task))
                .OrderBy(entry => entry.NextAttemptUtc)
                .ThenBy(entry => entry.EnqueuedUtc)
                .Take(safeMaxCount)
                .Select(CloneEntry)
                .ToArray();
        }
    }

    public IReadOnlyList<AgentSpawnQueueEntry> ClaimReadyEntries(DateTimeOffset nowUtc, int maxCount, string leaseOwner)
    {
        var safeMaxCount = Math.Max(1, maxCount);
        var safeLeaseOwner = NormalizeToken(leaseOwner, $"pid:{Environment.ProcessId}");
        using var lease = AcquireStoreLease();
        lock (_lock)
        {
            var state = LoadUnsafe();
            var ready = state.Entries
                .Where(entry => entry.NextAttemptUtc <= nowUtc
                                && IsClaimLeaseAvailable(entry, nowUtc)
                                && !string.IsNullOrWhiteSpace(entry.Task))
                .OrderBy(entry => entry.NextAttemptUtc)
                .ThenBy(entry => entry.EnqueuedUtc)
                .Take(safeMaxCount)
                .ToArray();
            if (ready.Length == 0)
            {
                return Array.Empty<AgentSpawnQueueEntry>();
            }

            var claimed = new List<AgentSpawnQueueEntry>(ready.Length);
            foreach (var entry in ready)
            {
                entry.LeaseOwner = safeLeaseOwner;
                entry.LeasedUntilUtc = nowUtc + ComputeClaimLeaseDuration(entry);
                claimed.Add(CloneEntry(entry));
            }

            return SaveUnsafe(state) ? claimed : Array.Empty<AgentSpawnQueueEntry>();
        }
    }

    public AgentSpawnQueueSnapshot GetSnapshot()
        => GetSnapshot(DateTimeOffset.UtcNow);

    public AgentSpawnQueueSnapshot GetSnapshot(DateTimeOffset nowUtc)
    {
        using var lease = AcquireStoreLease();
        lock (_lock)
        {
            var state = LoadUnsafe();
            var entries = state.Entries
                .Where(entry => entry != null && !string.IsNullOrWhiteSpace(entry.Task))
                .OrderBy(entry => entry.NextAttemptUtc)
                .ThenBy(entry => entry.EnqueuedUtc)
                .ThenBy(entry => entry.AttemptCount)
                .ToArray();
            var availableEntries = entries
                .Where(entry => IsClaimLeaseAvailable(entry, nowUtc))
                .ToArray();
            var nextEntry = availableEntries.FirstOrDefault();
            var nextAttemptUtc = nextEntry?.NextAttemptUtc
                ?? entries
                    .Where(entry => entry.LeasedUntilUtc.HasValue)
                    .Select(entry => entry.LeasedUntilUtc)
                    .Min();
            var retryWindow = entries.Count(entry => entry.AttemptCount >= MaxRetryAttempts - 2);
            return new AgentSpawnQueueSnapshot(
                entries.Length,
                availableEntries.Count(entry => entry.NextAttemptUtc <= nowUtc),
                nextAttemptUtc,
                nextEntry?.Id,
                nextEntry?.Reason,
                nextEntry?.LastError,
                nextEntry?.AttemptCount ?? 0,
                retryWindow
            );
        }
    }

    public void MarkDelivered(string id)
    {
        if (string.IsNullOrWhiteSpace(id))
        {
            return;
        }

        using var lease = AcquireStoreLease();
        lock (_lock)
        {
            var state = LoadUnsafe();
            state.Entries.RemoveAll(entry => string.Equals(entry.Id, id.Trim(), StringComparison.Ordinal));
            SaveUnsafe(state);
        }
    }

    public bool MarkFailed(string id, string error, DateTimeOffset nowUtc)
    {
        if (string.IsNullOrWhiteSpace(id))
        {
            return false;
        }

        using var lease = AcquireStoreLease();
        lock (_lock)
        {
            var state = LoadUnsafe();
            var entry = state.Entries.FirstOrDefault(candidate => string.Equals(candidate.Id, id.Trim(), StringComparison.Ordinal));
            if (entry == null)
            {
                return false;
            }

            entry.AttemptCount = Math.Max(0, entry.AttemptCount) + 1;
            entry.LastError = TrimForStorage(error, 500);
            entry.LeaseOwner = null;
            entry.LeasedUntilUtc = null;
            if (entry.AttemptCount >= MaxRetryAttempts)
            {
                state.Entries.Remove(entry);
                SaveUnsafe(state);
                return false;
            }

            entry.NextAttemptUtc = nowUtc + ComputeRetryDelay(entry.AttemptCount, entry.LastError);
            SaveUnsafe(state);
            return true;
        }
    }

    private AgentSpawnQueueState LoadUnsafe()
    {
        try
        {
            if (!File.Exists(_storePath))
            {
                return new AgentSpawnQueueState();
            }

            var text = AtomicFileStore.ReadAllTextWithBackup(
                _storePath,
                value => FileAgentSpawnQueueJson.DeserializeState(value) != null,
                logScope: "agent-spawn-queue"
            );
            if (string.IsNullOrWhiteSpace(text))
            {
                return new AgentSpawnQueueState();
            }

            var state = FileAgentSpawnQueueJson.DeserializeState(text) ?? new AgentSpawnQueueState();
            state.Entries = (state.Entries ?? new List<AgentSpawnQueueEntry>())
                .Where(entry => entry != null && !string.IsNullOrWhiteSpace(entry.Task) && !string.IsNullOrWhiteSpace(entry.ChildSessionKey))
                .Select(CloneEntry)
                .ToList();
            return state;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[agent-spawn-queue] load failed: {ex.Message}");
            return new AgentSpawnQueueState();
        }
    }

    private bool SaveUnsafe(AgentSpawnQueueState state)
    {
        try
        {
            var payload = FileAgentSpawnQueueJson.SerializeState(state ?? new AgentSpawnQueueState());
            AtomicFileStore.WriteAllText(_storePath, payload, ownerOnly: true);
            return true;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[agent-spawn-queue] save failed: {ex.Message}");
            return false;
        }
    }

    private FileStream AcquireStoreLease()
    {
        var storeDir = Path.GetDirectoryName(_storePath);
        if (string.IsNullOrWhiteSpace(storeDir))
        {
            throw new InvalidOperationException("invalid agent spawn queue path");
        }

        Directory.CreateDirectory(storeDir);
        var lockPath = _storePath + StoreLeaseSuffix;
        IOException? lastIoException = null;
        for (var attempt = 0; attempt < StoreLeaseRetryCount; attempt++)
        {
            try
            {
                var stream = new FileStream(lockPath, FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None);
                try
                {
                    var payload = Encoding.UTF8.GetBytes($"{Environment.ProcessId}\n{DateTimeOffset.UtcNow:O}\n");
                    stream.SetLength(0);
                    stream.Write(payload, 0, payload.Length);
                    stream.Flush(flushToDisk: true);
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
                lastIoException = ex;
                Thread.Sleep(StoreLeaseRetryDelayMs);
            }
        }

        throw new IOException($"agent spawn queue lease is busy: {lockPath}", lastIoException);
    }

    internal static TimeSpan ComputeInitialDelay(string reason, DateTimeOffset nowUtc)
    {
        var normalized = (reason ?? string.Empty).Trim().ToLowerInvariant();
        if (normalized.Contains("daily_cost_cap", StringComparison.Ordinal)
            || normalized.Contains("daily cost cap", StringComparison.Ordinal))
        {
            var tomorrow = new DateTimeOffset(nowUtc.UtcDateTime.Date, TimeSpan.Zero)
                .AddDays(1)
                .AddMinutes(5);
            return tomorrow > nowUtc ? tomorrow - nowUtc : TimeSpan.FromMinutes(5);
        }

        if (normalized.Contains("token_bucket", StringComparison.Ordinal)
            || normalized.Contains("rate", StringComparison.Ordinal)
            || normalized.Contains("429", StringComparison.Ordinal)
            || normalized.Contains("retry-after", StringComparison.Ordinal))
        {
            return TimeSpan.FromMinutes(1);
        }

        if (normalized.Contains("concurrency", StringComparison.Ordinal))
        {
            return TimeSpan.FromSeconds(30);
        }

        return TimeSpan.FromMinutes(2);
    }

    private static TimeSpan ComputeRetryDelay(int attemptCount, string error)
    {
        var normalized = (error ?? string.Empty).Trim().ToLowerInvariant();
        if (normalized.Contains("daily cost cap", StringComparison.Ordinal)
            || normalized.Contains("daily_cost_cap", StringComparison.Ordinal))
        {
            return TimeSpan.FromHours(6);
        }

        if (normalized.Contains("429", StringComparison.Ordinal)
            || normalized.Contains("retry-after", StringComparison.Ordinal)
            || normalized.Contains("rate limit", StringComparison.Ordinal))
        {
            return TimeSpan.FromMinutes(5);
        }

        var safeAttempt = Math.Clamp(attemptCount, 1, 8);
        var seconds = Math.Min(1_800, 10 * (1 << (safeAttempt - 1)));
        return TimeSpan.FromSeconds(seconds);
    }

    private static TimeSpan ComputeClaimLeaseDuration(AgentSpawnQueueEntry entry)
    {
        var timeoutSeconds = Math.Max(0, entry.RunTimeoutSeconds);
        var leaseSeconds = Math.Clamp(timeoutSeconds + 60, MinClaimLeaseSeconds, MaxClaimLeaseSeconds);
        return TimeSpan.FromSeconds(leaseSeconds);
    }

    private static bool IsClaimLeaseAvailable(AgentSpawnQueueEntry entry, DateTimeOffset nowUtc)
    {
        return !entry.LeasedUntilUtc.HasValue || entry.LeasedUntilUtc.Value <= nowUtc;
    }

    private static AgentSpawnQueueEntry CloneEntry(AgentSpawnQueueEntry entry)
    {
        return new AgentSpawnQueueEntry
        {
            Id = entry.Id ?? string.Empty,
            RunId = entry.RunId ?? string.Empty,
            ChildSessionKey = entry.ChildSessionKey ?? string.Empty,
            Task = entry.Task ?? string.Empty,
            Label = NormalizeOptional(entry.Label),
            Runtime = NormalizeToken(entry.Runtime, "subagent"),
            Mode = NormalizeToken(entry.Mode, "run"),
            RunTimeoutSeconds = Math.Max(0, entry.RunTimeoutSeconds),
            Thread = entry.Thread,
            TaskTruncated = entry.TaskTruncated,
            BudgetTaskLength = Math.Max(0, entry.BudgetTaskLength),
            AcpModel = NormalizeOptional(entry.AcpModel),
            AcpThinking = NormalizeOptional(entry.AcpThinking),
            AcpLightContext = entry.AcpLightContext,
            AcpToolProfile = NormalizeOptional(entry.AcpToolProfile),
            AcpOutputDirectory = NormalizeOptional(entry.AcpOutputDirectory),
            CommandPriority = NormalizeOptional(entry.CommandPriority),
            Reason = NormalizeToken(entry.Reason, "queued"),
            EnqueuedUtc = entry.EnqueuedUtc,
            NextAttemptUtc = entry.NextAttemptUtc,
            AttemptCount = Math.Max(0, entry.AttemptCount),
            LastError = entry.LastError ?? string.Empty,
            LeaseOwner = NormalizeOptional(entry.LeaseOwner),
            LeasedUntilUtc = entry.LeasedUntilUtc
        };
    }

    private static string NormalizeToken(string? value, string fallback)
    {
        var normalized = (value ?? string.Empty).Trim();
        return string.IsNullOrWhiteSpace(normalized) ? fallback : normalized;
    }

    private static string? NormalizeOptional(string? value)
    {
        var normalized = (value ?? string.Empty).Trim();
        return string.IsNullOrWhiteSpace(normalized) ? null : normalized;
    }

    private static string TrimForStorage(string text, int maxChars)
    {
        var normalized = (text ?? string.Empty).Trim();
        if (normalized.Length <= maxChars)
        {
            return normalized;
        }

        return normalized[..maxChars] + "...(truncated)";
    }
}

public sealed class AgentSpawnQueueEntry
{
    public string Id { get; set; } = string.Empty;
    public string RunId { get; set; } = string.Empty;
    public string ChildSessionKey { get; set; } = string.Empty;
    public string Task { get; set; } = string.Empty;
    public string? Label { get; set; }
    public string Runtime { get; set; } = "subagent";
    public string Mode { get; set; } = "run";
    public int RunTimeoutSeconds { get; set; }
    public bool Thread { get; set; }
    public bool TaskTruncated { get; set; }
    public int BudgetTaskLength { get; set; }
    public string? AcpModel { get; set; }
    public string? AcpThinking { get; set; }
    public bool? AcpLightContext { get; set; }
    public string? AcpToolProfile { get; set; }
    public string? AcpOutputDirectory { get; set; }
    public string? CommandPriority { get; set; }
    public string Reason { get; set; } = "queued";
    public DateTimeOffset EnqueuedUtc { get; set; }
    public DateTimeOffset NextAttemptUtc { get; set; }
    public int AttemptCount { get; set; }
    public string LastError { get; set; } = string.Empty;
    public string? LeaseOwner { get; set; }
    public DateTimeOffset? LeasedUntilUtc { get; set; }
}

public sealed record AgentSpawnQueueSnapshot(
    int Total,
    int Ready,
    DateTimeOffset? NextAttemptUtc,
    string? NextEntryId,
    string? NextReason,
    string? NextError,
    int NextAttemptCount,
    int NearDeadLetterCount
);

internal sealed class AgentSpawnQueueState
{
    public List<AgentSpawnQueueEntry> Entries { get; set; } = new();
}
