namespace Omnux.Middleware;

public sealed class FileAgentCommunicationStore
{
    private const int StateVersion = 1;
    private const int StoreLeaseRetryCount = 50;
    private const int StoreLeaseRetryDelayMs = 50;
    private const int MaxMessages = 1_000;
    private const int MaxBoardEntries = 500;
    private const int MaxLifecycleEvents = 1_000;
    private const int DefaultQueryLimit = 100;
    private const int MaxQueryLimit = 500;
    private const int MaxTokenChars = 160;
    private const int MaxBodyChars = 12_000;
    private const int MaxBoardValueChars = 8_000;
    private const string StoreLeaseSuffix = ".agentcomm.lease";

    private readonly string _storePath;
    private readonly object _lock = new();
    private readonly Func<DateTimeOffset> _utcNow;

    public FileAgentCommunicationStore(IStatePathResolver pathResolver)
        : this(pathResolver.ResolveStateFilePath("agent_communication.json"))
    {
    }

    public FileAgentCommunicationStore(string storePath, Func<DateTimeOffset>? utcNow = null)
    {
        _storePath = Path.GetFullPath(storePath);
        _utcNow = utcNow ?? (() => DateTimeOffset.UtcNow);
    }

    public AgentCommunicationMessage PostMessage(AgentCommunicationPostRequest request)
    {
        using var lease = AcquireStoreLease();
        lock (_lock)
        {
            var state = LoadUnsafe();
            var now = _utcNow();
            var message = new AgentCommunicationMessage(
                $"agentmsg_{now:yyyyMMddHHmmssfff}_{Guid.NewGuid():N}",
                NormalizeRequiredToken(request.FromAgentId),
                NormalizeOptionalToken(request.ToAgentId),
                NormalizeOptionalToken(request.GroupId),
                NormalizeOptionalToken(request.RunId),
                NormalizeOptionalToken(request.ConversationId),
                NormalizeKind(request.Kind, "message"),
                TrimForStorage(request.Body, MaxBodyChars),
                NormalizeOptionalToken(request.CorrelationId),
                now
            );

            state.Messages.Add(message);
            _ = PruneUnsafe(state);
            SaveUnsafe(state);
            return message;
        }
    }

    public AgentBoardEntry UpsertBoard(AgentBoardWriteRequest request)
    {
        using var lease = AcquireStoreLease();
        lock (_lock)
        {
            var state = LoadUnsafe();
            var now = _utcNow();
            var agentId = NormalizeRequiredToken(request.AgentId);
            var key = NormalizeRequiredToken(request.Key);
            var runId = NormalizeOptionalToken(request.RunId);
            var groupId = NormalizeOptionalToken(request.GroupId);
            var existingIndex = state.Board.FindIndex(entry =>
                string.Equals(entry.AgentId, agentId, StringComparison.Ordinal)
                && string.Equals(entry.Key, key, StringComparison.Ordinal)
                && string.Equals(entry.RunId, runId, StringComparison.Ordinal)
                && string.Equals(entry.GroupId, groupId, StringComparison.Ordinal));

            AgentBoardEntry next;
            if (existingIndex >= 0)
            {
                var current = state.Board[existingIndex];
                next = current with
                {
                    Value = TrimForStorage(request.Value, MaxBoardValueChars),
                    Status = NormalizeKind(request.Status, current.Status),
                    Priority = NormalizeKind(request.Priority, current.Priority),
                    Version = Math.Max(1, current.Version) + 1,
                    UpdatedUtc = now
                };
                state.Board[existingIndex] = next;
            }
            else
            {
                next = new AgentBoardEntry(
                    $"agentboard_{now:yyyyMMddHHmmssfff}_{Guid.NewGuid():N}",
                    agentId,
                    key,
                    TrimForStorage(request.Value, MaxBoardValueChars),
                    runId,
                    groupId,
                    NormalizeKind(request.Status, "active"),
                    NormalizeKind(request.Priority, "normal"),
                    1,
                    now,
                    now
                );
                state.Board.Add(next);
            }

            _ = PruneUnsafe(state);
            SaveUnsafe(state);
            return next;
        }
    }

    public AgentLifecycleEvent AddLifecycleEvent(AgentLifecycleWriteRequest request)
    {
        using var lease = AcquireStoreLease();
        lock (_lock)
        {
            var state = LoadUnsafe();
            var now = _utcNow();
            var item = new AgentLifecycleEvent(
                $"agentlife_{now:yyyyMMddHHmmssfff}_{Guid.NewGuid():N}",
                NormalizeRequiredToken(request.AgentId),
                NormalizeOptionalToken(request.RunId),
                NormalizeOptionalToken(request.GroupId),
                NormalizeOptionalToken(request.ConversationId),
                NormalizeKind(request.State, "running"),
                TrimForStorage(request.Detail, MaxBoardValueChars),
                now
            );

            state.Lifecycle.Add(item);
            _ = PruneUnsafe(state);
            SaveUnsafe(state);
            return item;
        }
    }

    public AgentCommunicationSnapshot GetSnapshot(AgentCommunicationQuery? query = null)
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

    private AgentCommunicationSnapshot BuildSnapshotUnsafe(
        AgentCommunicationState state,
        AgentCommunicationQuery? query
    )
    {
        var normalizedAgentId = NormalizeOptionalToken(query?.AgentId);
        var normalizedGroupId = NormalizeOptionalToken(query?.GroupId);
        var normalizedRunId = NormalizeOptionalToken(query?.RunId);
        var sinceUtc = query?.SinceUtc;
        var limit = Math.Clamp(query?.Limit ?? DefaultQueryLimit, 1, MaxQueryLimit);

        var messages = state.Messages
            .Where(item => MatchesMessage(item, normalizedAgentId, normalizedGroupId, normalizedRunId, sinceUtc))
            .OrderByDescending(item => item.CreatedUtc)
            .Take(limit)
            .OrderBy(item => item.CreatedUtc)
            .ToArray();
        var board = state.Board
            .Where(item => MatchesBoard(item, normalizedAgentId, normalizedGroupId, normalizedRunId))
            .OrderByDescending(item => item.UpdatedUtc)
            .Take(limit)
            .OrderBy(item => item.Key, StringComparer.Ordinal)
            .ThenBy(item => item.AgentId, StringComparer.Ordinal)
            .ToArray();
        var lifecycle = state.Lifecycle
            .Where(item => MatchesLifecycle(item, normalizedAgentId, normalizedGroupId, normalizedRunId, sinceUtc))
            .OrderByDescending(item => item.CreatedUtc)
            .Take(limit)
            .OrderBy(item => item.CreatedUtc)
            .ToArray();

        return new AgentCommunicationSnapshot(
            messages,
            board,
            lifecycle,
            state.Messages.Count,
            state.Board.Count,
            state.Lifecycle.Count,
            _utcNow()
        );
    }

    private AgentCommunicationState LoadUnsafe()
    {
        try
        {
            if (!File.Exists(_storePath))
            {
                return new AgentCommunicationState { Version = StateVersion };
            }

            var text = AtomicFileStore.ReadAllTextWithBackup(
                _storePath,
                value => AgentCommunicationJson.DeserializeState(value) != null,
                logScope: "agent-communication"
            );
            if (string.IsNullOrWhiteSpace(text))
            {
                return new AgentCommunicationState { Version = StateVersion };
            }

            var state = AgentCommunicationJson.DeserializeState(text)
                ?? new AgentCommunicationState { Version = StateVersion };
            state.Version = StateVersion;
            state.Messages = (state.Messages ?? new List<AgentCommunicationMessage>())
                .Where(IsValidMessage)
                .Select(CloneMessage)
                .ToList();
            state.Board = (state.Board ?? new List<AgentBoardEntry>())
                .Where(IsValidBoardEntry)
                .Select(CloneBoardEntry)
                .ToList();
            state.Lifecycle = (state.Lifecycle ?? new List<AgentLifecycleEvent>())
                .Where(IsValidLifecycleEvent)
                .Select(CloneLifecycleEvent)
                .ToList();
            return state;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[agent-communication] load failed: {ex.Message}");
            return new AgentCommunicationState { Version = StateVersion };
        }
    }

    private bool SaveUnsafe(AgentCommunicationState state)
    {
        try
        {
            state.Version = StateVersion;
            var payload = AgentCommunicationJson.SerializeState(state);
            AtomicFileStore.WriteAllText(_storePath, payload, ownerOnly: true);
            return true;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[agent-communication] save failed: {ex.Message}");
            return false;
        }
    }

    private FileStream AcquireStoreLease()
    {
        var storeDir = Path.GetDirectoryName(_storePath);
        if (string.IsNullOrWhiteSpace(storeDir))
        {
            throw new InvalidOperationException("invalid agent communication path");
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
                    writer.WriteLine(Environment.ProcessId.ToString(System.Globalization.CultureInfo.InvariantCulture));
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

        throw new IOException("agent communication store lease unavailable", lastError);
    }

    private static bool MatchesMessage(
        AgentCommunicationMessage item,
        string agentId,
        string groupId,
        string runId,
        DateTimeOffset? sinceUtc
    )
    {
        if (sinceUtc.HasValue && item.CreatedUtc < sinceUtc.Value)
        {
            return false;
        }

        return (string.IsNullOrWhiteSpace(agentId)
                || string.Equals(item.FromAgentId, agentId, StringComparison.Ordinal)
                || string.Equals(item.ToAgentId, agentId, StringComparison.Ordinal))
               && (string.IsNullOrWhiteSpace(groupId)
                   || string.Equals(item.GroupId, groupId, StringComparison.Ordinal))
               && (string.IsNullOrWhiteSpace(runId)
                   || string.Equals(item.RunId, runId, StringComparison.Ordinal));
    }

    private static bool MatchesBoard(AgentBoardEntry item, string agentId, string groupId, string runId)
    {
        return (string.IsNullOrWhiteSpace(agentId)
                || string.Equals(item.AgentId, agentId, StringComparison.Ordinal))
               && (string.IsNullOrWhiteSpace(groupId)
                   || string.Equals(item.GroupId, groupId, StringComparison.Ordinal))
               && (string.IsNullOrWhiteSpace(runId)
                   || string.Equals(item.RunId, runId, StringComparison.Ordinal));
    }

    private static bool MatchesLifecycle(
        AgentLifecycleEvent item,
        string agentId,
        string groupId,
        string runId,
        DateTimeOffset? sinceUtc
    )
    {
        if (sinceUtc.HasValue && item.CreatedUtc < sinceUtc.Value)
        {
            return false;
        }

        return (string.IsNullOrWhiteSpace(agentId)
                || string.Equals(item.AgentId, agentId, StringComparison.Ordinal))
               && (string.IsNullOrWhiteSpace(groupId)
                   || string.Equals(item.GroupId, groupId, StringComparison.Ordinal))
               && (string.IsNullOrWhiteSpace(runId)
                   || string.Equals(item.RunId, runId, StringComparison.Ordinal));
    }

    private static bool IsValidMessage(AgentCommunicationMessage item)
    {
        return item != null
               && !string.IsNullOrWhiteSpace(item.Id)
               && !string.IsNullOrWhiteSpace(item.FromAgentId)
               && !string.IsNullOrWhiteSpace(item.Kind);
    }

    private static bool IsValidBoardEntry(AgentBoardEntry item)
    {
        return item != null
               && !string.IsNullOrWhiteSpace(item.Id)
               && !string.IsNullOrWhiteSpace(item.AgentId)
               && !string.IsNullOrWhiteSpace(item.Key);
    }

    private static bool IsValidLifecycleEvent(AgentLifecycleEvent item)
    {
        return item != null
               && !string.IsNullOrWhiteSpace(item.Id)
               && !string.IsNullOrWhiteSpace(item.AgentId)
               && !string.IsNullOrWhiteSpace(item.State);
    }

    private static AgentCommunicationMessage CloneMessage(AgentCommunicationMessage item)
    {
        return item with
        {
            Id = NormalizeRequiredToken(item.Id),
            FromAgentId = NormalizeRequiredToken(item.FromAgentId),
            ToAgentId = NormalizeOptionalToken(item.ToAgentId),
            GroupId = NormalizeOptionalToken(item.GroupId),
            RunId = NormalizeOptionalToken(item.RunId),
            ConversationId = NormalizeOptionalToken(item.ConversationId),
            Kind = NormalizeKind(item.Kind, "message"),
            Body = TrimForStorage(item.Body, MaxBodyChars),
            CorrelationId = NormalizeOptionalToken(item.CorrelationId),
            CreatedUtc = item.CreatedUtc == default ? DateTimeOffset.UtcNow : item.CreatedUtc
        };
    }

    private static AgentBoardEntry CloneBoardEntry(AgentBoardEntry item)
    {
        return item with
        {
            Id = NormalizeRequiredToken(item.Id),
            AgentId = NormalizeRequiredToken(item.AgentId),
            Key = NormalizeRequiredToken(item.Key),
            Value = TrimForStorage(item.Value, MaxBoardValueChars),
            RunId = NormalizeOptionalToken(item.RunId),
            GroupId = NormalizeOptionalToken(item.GroupId),
            Status = NormalizeKind(item.Status, "active"),
            Priority = NormalizeKind(item.Priority, "normal"),
            Version = Math.Max(1, item.Version),
            CreatedUtc = item.CreatedUtc == default ? DateTimeOffset.UtcNow : item.CreatedUtc,
            UpdatedUtc = item.UpdatedUtc == default ? DateTimeOffset.UtcNow : item.UpdatedUtc
        };
    }

    private static AgentLifecycleEvent CloneLifecycleEvent(AgentLifecycleEvent item)
    {
        return item with
        {
            Id = NormalizeRequiredToken(item.Id),
            AgentId = NormalizeRequiredToken(item.AgentId),
            RunId = NormalizeOptionalToken(item.RunId),
            GroupId = NormalizeOptionalToken(item.GroupId),
            ConversationId = NormalizeOptionalToken(item.ConversationId),
            State = NormalizeKind(item.State, "running"),
            Detail = TrimForStorage(item.Detail, MaxBoardValueChars),
            CreatedUtc = item.CreatedUtc == default ? DateTimeOffset.UtcNow : item.CreatedUtc
        };
    }

    private static bool PruneUnsafe(AgentCommunicationState state)
    {
        var beforeMessages = state.Messages.Count;
        var beforeBoard = state.Board.Count;
        var beforeLifecycle = state.Lifecycle.Count;
        state.Messages = state.Messages
            .OrderByDescending(item => item.CreatedUtc)
            .Take(MaxMessages)
            .OrderBy(item => item.CreatedUtc)
            .ToList();
        state.Board = state.Board
            .OrderByDescending(item => item.UpdatedUtc)
            .Take(MaxBoardEntries)
            .OrderBy(item => item.Key, StringComparer.Ordinal)
            .ThenBy(item => item.AgentId, StringComparer.Ordinal)
            .ToList();
        state.Lifecycle = state.Lifecycle
            .OrderByDescending(item => item.CreatedUtc)
            .Take(MaxLifecycleEvents)
            .OrderBy(item => item.CreatedUtc)
            .ToList();
        return state.Messages.Count != beforeMessages
               || state.Board.Count != beforeBoard
               || state.Lifecycle.Count != beforeLifecycle;
    }

    private static string NormalizeRequiredToken(string? value)
    {
        return TrimForStorage(value, MaxTokenChars);
    }

    private static string NormalizeOptionalToken(string? value)
    {
        return TrimForStorage(value, MaxTokenChars);
    }

    private static string NormalizeKind(string? value, string fallback)
    {
        var normalized = TrimForStorage(value, 48).Trim().ToLowerInvariant();
        return string.IsNullOrWhiteSpace(normalized) ? fallback : normalized;
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
