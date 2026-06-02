using System.Text;

namespace Omnux.Middleware;

public sealed class FileAgentSpawnActiveRunStore
{
    private const string StoreLeaseSuffix = ".active.lease";
    private const int StoreLeaseRetryCount = 50;
    private const int StoreLeaseRetryDelayMs = 50;
    private const int MaxCompletedHistory = 64;
    private static readonly TimeSpan StaleActiveWindow = TimeSpan.FromHours(12);

    private readonly string _storePath;
    private readonly object _lock = new();

    public FileAgentSpawnActiveRunStore(IStatePathResolver pathResolver)
        : this(pathResolver.ResolveStateFilePath("agent_spawn_active.json"))
    {
    }

    public FileAgentSpawnActiveRunStore(string storePath)
    {
        _storePath = Path.GetFullPath(storePath);
    }

    public string Start(AgentSpawnActiveRunEntry entry)
    {
        if (entry == null || string.IsNullOrWhiteSpace(entry.RunId))
        {
            return string.Empty;
        }

        using var lease = AcquireStoreLease();
        lock (_lock)
        {
            var state = LoadUnsafe();
            var normalized = CloneEntry(entry);
            normalized.Id = string.IsNullOrWhiteSpace(normalized.Id)
                ? $"active_{normalized.StartedUtc:yyyyMMddHHmmssfff}_{Guid.NewGuid():N}"
                : normalized.Id.Trim();
            normalized.RunId = normalized.RunId.Trim();
            normalized.StartedUtc = normalized.StartedUtc == default ? DateTimeOffset.UtcNow : normalized.StartedUtc;
            normalized.LastHeartbeatUtc = normalized.LastHeartbeatUtc == default
                ? normalized.StartedUtc
                : normalized.LastHeartbeatUtc;
            normalized.State = NormalizeToken(normalized.State, "active");

            state.Runs.RemoveAll(existing =>
                string.Equals(existing.Id, normalized.Id, StringComparison.Ordinal)
                || string.Equals(existing.RunId, normalized.RunId, StringComparison.Ordinal));
            state.Runs.Add(normalized);
            PruneCompletedUnsafe(state);
            SaveUnsafe(state);
            return normalized.Id;
        }
    }

    public bool MarkBackend(string? id, string? backend, string? backendSessionId, DateTimeOffset nowUtc)
    {
        return MutateActive(id, nowUtc, entry =>
        {
            entry.Backend = NormalizeOptional(backend) ?? entry.Backend;
            entry.BackendSessionId = NormalizeOptional(backendSessionId);
            entry.State = NormalizeToken(entry.State, "active");
        });
    }

    public bool MarkState(string? id, string state, DateTimeOffset nowUtc)
    {
        return MutateActive(id, nowUtc, entry => entry.State = NormalizeToken(state, "active"));
    }

    public bool Complete(string? id, string state, DateTimeOffset nowUtc)
    {
        return Mutate(id, nowUtc, entry =>
        {
            entry.State = NormalizeToken(state, "completed");
            entry.CompletedUtc = nowUtc;
            entry.LastError = null;
        });
    }

    public bool Fail(string? id, string error, DateTimeOffset nowUtc)
    {
        return Mutate(id, nowUtc, entry =>
        {
            entry.State = "failed";
            entry.CompletedUtc = nowUtc;
            entry.LastError = TrimForStorage(error, 500);
        });
    }

    public IReadOnlyList<AgentSpawnBlockedActiveRun> MarkActiveBlockedByBreaker(string? reason, string? message, DateTimeOffset nowUtc)
    {
        using var lease = AcquireStoreLease();
        lock (_lock)
        {
            var state = LoadUnsafe();
            var active = state.Runs.Where(IsActive).ToArray();
            if (active.Length == 0)
            {
                return Array.Empty<AgentSpawnBlockedActiveRun>();
            }

            var normalizedReason = NormalizeToken(reason, "manual_breaker");
            var normalizedMessage = NormalizeOptional(message)
                ?? $"sessions_spawn run breaker active: {normalizedReason}.";
            var blocked = active
                .Select(entry => new AgentSpawnBlockedActiveRun(
                    entry.RunId,
                    entry.ChildSessionKey,
                    entry.Runtime,
                    entry.Mode,
                    entry.Backend,
                    normalizedReason,
                    normalizedMessage
                ))
                .ToArray();
            foreach (var entry in active)
            {
                entry.State = "blocked_by_breaker";
                entry.CompletedUtc = nowUtc;
                entry.LastHeartbeatUtc = nowUtc;
                entry.LastError = TrimForStorage(normalizedMessage, 500);
            }

            PruneCompletedUnsafe(state);
            SaveUnsafe(state);
            return blocked;
        }
    }

    public AgentSpawnActiveSnapshot GetSnapshot(DateTimeOffset nowUtc)
    {
        using var lease = AcquireStoreLease();
        lock (_lock)
        {
            var state = LoadUnsafe();
            PruneStaleUnsafe(state, nowUtc);
            PruneCompletedUnsafe(state);
            SaveUnsafe(state);
            var active = state.Runs
                .Where(IsActive)
                .OrderBy(entry => entry.StartedUtc)
                .ThenBy(entry => entry.RunId)
                .ToArray();
            var oldest = active.FirstOrDefault();
            return new AgentSpawnActiveSnapshot(
                active.Length,
                oldest?.RunId,
                oldest?.Runtime,
                oldest?.Mode,
                oldest?.Backend,
                oldest?.StartedUtc,
                oldest == null ? null : Math.Max(0, (int)(nowUtc - oldest.StartedUtc).TotalSeconds),
                state.Runs.Count(entry => !IsActive(entry))
            );
        }
    }

    private bool MutateActive(string? id, DateTimeOffset nowUtc, Action<AgentSpawnActiveRunEntry> apply)
    {
        return Mutate(id, nowUtc, entry =>
        {
            apply(entry);
            entry.CompletedUtc = null;
        });
    }

    private bool Mutate(string? id, DateTimeOffset nowUtc, Action<AgentSpawnActiveRunEntry> apply)
    {
        if (string.IsNullOrWhiteSpace(id))
        {
            return false;
        }

        using var lease = AcquireStoreLease();
        lock (_lock)
        {
            var state = LoadUnsafe();
            var entry = state.Runs.FirstOrDefault(candidate => string.Equals(candidate.Id, id.Trim(), StringComparison.Ordinal));
            if (entry == null)
            {
                return false;
            }

            entry.LastHeartbeatUtc = nowUtc;
            apply(entry);
            PruneCompletedUnsafe(state);
            SaveUnsafe(state);
            return true;
        }
    }

    private AgentSpawnActiveRunState LoadUnsafe()
    {
        try
        {
            if (!File.Exists(_storePath))
            {
                return new AgentSpawnActiveRunState();
            }

            var text = AtomicFileStore.ReadAllTextWithBackup(
                _storePath,
                value => FileAgentSpawnActiveRunJson.DeserializeState(value) != null,
                logScope: "agent-spawn-active"
            );
            if (string.IsNullOrWhiteSpace(text))
            {
                return new AgentSpawnActiveRunState();
            }

            var state = FileAgentSpawnActiveRunJson.DeserializeState(text) ?? new AgentSpawnActiveRunState();
            state.Runs = (state.Runs ?? new List<AgentSpawnActiveRunEntry>())
                .Where(entry => entry != null && !string.IsNullOrWhiteSpace(entry.RunId))
                .Select(CloneEntry)
                .ToList();
            return state;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[agent-spawn-active] load failed: {ex.Message}");
            return new AgentSpawnActiveRunState();
        }
    }

    private bool SaveUnsafe(AgentSpawnActiveRunState state)
    {
        try
        {
            var payload = FileAgentSpawnActiveRunJson.SerializeState(state ?? new AgentSpawnActiveRunState());
            AtomicFileStore.WriteAllText(_storePath, payload, ownerOnly: true);
            return true;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[agent-spawn-active] save failed: {ex.Message}");
            return false;
        }
    }

    private FileStream AcquireStoreLease()
    {
        var storeDir = Path.GetDirectoryName(_storePath);
        if (string.IsNullOrWhiteSpace(storeDir))
        {
            throw new InvalidOperationException("invalid agent spawn active run path");
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

        throw new IOException($"agent spawn active run lease is busy: {lockPath}", lastIoException);
    }

    private static AgentSpawnActiveRunEntry CloneEntry(AgentSpawnActiveRunEntry entry)
    {
        return new AgentSpawnActiveRunEntry
        {
            Id = entry.Id ?? string.Empty,
            RunId = entry.RunId ?? string.Empty,
            ChildSessionKey = entry.ChildSessionKey ?? string.Empty,
            Runtime = NormalizeToken(entry.Runtime, "subagent"),
            Mode = NormalizeToken(entry.Mode, "run"),
            Backend = NormalizeToken(entry.Backend, "unknown"),
            BackendSessionId = NormalizeOptional(entry.BackendSessionId),
            RunTimeoutSeconds = Math.Max(0, entry.RunTimeoutSeconds),
            StartedUtc = entry.StartedUtc,
            LastHeartbeatUtc = entry.LastHeartbeatUtc,
            CompletedUtc = entry.CompletedUtc,
            State = NormalizeToken(entry.State, "active"),
            LastError = NormalizeOptional(entry.LastError)
        };
    }

    private static void PruneStaleUnsafe(AgentSpawnActiveRunState state, DateTimeOffset nowUtc)
    {
        foreach (var entry in state.Runs.Where(IsActive))
        {
            if (entry.LastHeartbeatUtc != default && nowUtc - entry.LastHeartbeatUtc > StaleActiveWindow)
            {
                entry.State = "stale";
                entry.CompletedUtc = nowUtc;
                entry.LastError = "active run heartbeat expired";
            }
        }
    }

    private static void PruneCompletedUnsafe(AgentSpawnActiveRunState state)
    {
        var active = state.Runs.Where(IsActive).ToList();
        var completed = state.Runs
            .Where(entry => !IsActive(entry))
            .OrderByDescending(entry => entry.CompletedUtc ?? entry.LastHeartbeatUtc)
            .Take(MaxCompletedHistory)
            .ToList();
        state.Runs = active.Concat(completed).ToList();
    }

    private static bool IsActive(AgentSpawnActiveRunEntry entry)
    {
        return !entry.CompletedUtc.HasValue
            && !string.Equals(entry.State, "completed", StringComparison.OrdinalIgnoreCase)
            && !string.Equals(entry.State, "failed", StringComparison.OrdinalIgnoreCase)
            && !string.Equals(entry.State, "stale", StringComparison.OrdinalIgnoreCase)
            && !string.Equals(entry.State, "blocked_by_breaker", StringComparison.OrdinalIgnoreCase);
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

public sealed class AgentSpawnActiveRunEntry
{
    public string Id { get; set; } = string.Empty;
    public string RunId { get; set; } = string.Empty;
    public string ChildSessionKey { get; set; } = string.Empty;
    public string Runtime { get; set; } = "subagent";
    public string Mode { get; set; } = "run";
    public string Backend { get; set; } = "unknown";
    public string? BackendSessionId { get; set; }
    public int RunTimeoutSeconds { get; set; }
    public DateTimeOffset StartedUtc { get; set; }
    public DateTimeOffset LastHeartbeatUtc { get; set; }
    public DateTimeOffset? CompletedUtc { get; set; }
    public string State { get; set; } = "active";
    public string? LastError { get; set; }
}

public sealed record AgentSpawnActiveSnapshot(
    int ActiveCount,
    string? OldestRunId,
    string? OldestRuntime,
    string? OldestMode,
    string? OldestBackend,
    DateTimeOffset? OldestStartedUtc,
    int? OldestAgeSeconds,
    int CompletedHistoryCount
);

public sealed record AgentSpawnBlockedActiveRun(
    string RunId,
    string ChildSessionKey,
    string Runtime,
    string Mode,
    string Backend,
    string Reason,
    string Message
);

internal sealed class AgentSpawnActiveRunState
{
    public List<AgentSpawnActiveRunEntry> Runs { get; set; } = new();
}
