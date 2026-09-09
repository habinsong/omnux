using System.Text;
using System.Text.Json;

namespace Omnux.Middleware;

/// <summary>
/// 승인 대기·승인 저장소. 손상된 상태를 빈 상태로 덮어쓰지 않고, 쓰기 실패를 성공으로 바꾸지 않는다.
/// 훅 실행 경로에서 자주 읽으므로 파일 수정 시각으로 캐시한다.
/// </summary>
internal sealed class ApprovalStore
{
    public const string FileName = "extension-approvals.json";
    public const string PathEnvName = "OMNUX_EXTENSION_APPROVALS_PATH";

    private readonly string _path;
    private readonly object _lock = new();

    private ApprovalState? _cached;
    private string _cachedStamp = string.Empty;

    public ApprovalStore(string? path = null)
    {
        _path = path ?? ResolveDefaultPath();
    }

    public string Path => _path;

    public static string ResolveDefaultPath()
    {
        var configured = (Environment.GetEnvironmentVariable(PathEnvName) ?? string.Empty).Trim();
        if (configured.Length > 0)
        {
            return System.IO.Path.GetFullPath(configured);
        }

        return DefaultStatePathResolver.CreateDefault().ResolveStateFilePath(FileName);
    }

    public ApprovalState Read()
    {
        lock (_lock)
        {
            var stamp = ComputeStamp();
            if (_cached != null && string.Equals(stamp, _cachedStamp, StringComparison.Ordinal))
            {
                return _cached;
            }

            var state = ReadFromDisk();
            _cached = state;
            _cachedStamp = stamp;
            return state;
        }
    }

    /// <summary>승인 대기 등록. 훅 실행 중에 호출되므로 실패해도 예외를 던지지 않는다.</summary>
    public bool TryRecordPending(string eventId, string target, string reason, string hookId, DateTimeOffset now)
    {
        lock (_lock)
        {
            var current = ReadFromDisk();
            if (current.LoadError.Length > 0)
            {
                return false;
            }

            var next = current with
            {
                Pending = ApprovalPolicy.Upsert(current.Pending, eventId, target, reason, hookId, now),
                Grants = ApprovalPolicy.RemoveExpired(current.Grants, now)
            };
            return WriteUnlocked(next);
        }
    }

    /// <summary>1회용 승인 소모. 소모하지 못하면 false 를 돌려주고 상태를 바꾸지 않는다.</summary>
    public bool TryConsumeGrant(string grantId, DateTimeOffset now)
    {
        lock (_lock)
        {
            var current = ReadFromDisk();
            if (current.LoadError.Length > 0)
            {
                return false;
            }

            var remaining = ApprovalPolicy.RemoveById(current.Grants, grant => grant.Id, grantId);
            if (remaining.Count == current.Grants.Count)
            {
                return false;
            }

            return WriteUnlocked(current with
            {
                Grants = ApprovalPolicy.RemoveExpired(remaining, now)
            });
        }
    }

    public ApprovalMutationResult Approve(
        string pendingId,
        ApprovalScope scope,
        int sessionMinutes,
        DateTimeOffset now
    )
    {
        lock (_lock)
        {
            var current = ReadFromDisk();
            if (current.LoadError.Length > 0)
            {
                return new ApprovalMutationResult(false, $"승인 상태를 읽지 못했다: {current.LoadError}", current);
            }

            PendingApproval? target = null;
            foreach (var entry in current.Pending)
            {
                if (string.Equals(entry.Id, pendingId, StringComparison.Ordinal))
                {
                    target = entry;
                    break;
                }
            }

            if (target == null)
            {
                return new ApprovalMutationResult(false, $"승인 대기 항목을 찾지 못했다: {pendingId}", current);
            }

            // 대상이 없는 승인(새 대화 등)은 기간 승인으로 넓히지 않는다. 1회로 좁힌다.
            var effectiveScope = ApprovalPolicy.NarrowScope(target.Target, scope);
            var grant = ApprovalPolicy.CreateGrant(target.Event, target.Target, effectiveScope, sessionMinutes, now);
            var next = current with
            {
                Pending = ApprovalPolicy.RemoveById(current.Pending, entry => entry.Id, pendingId),
                Grants = ApprovalPolicy.Upsert(ApprovalPolicy.RemoveExpired(current.Grants, now), grant)
            };

            return WriteUnlocked(next)
                ? new ApprovalMutationResult(true, string.Empty, ReadFromDisk())
                : new ApprovalMutationResult(false, "승인을 저장하지 못했다", current);
        }
    }

    public ApprovalMutationResult Reject(string pendingId, DateTimeOffset now)
    {
        return RemoveEntry(
            pendingId,
            now,
            (state, id) => state with { Pending = ApprovalPolicy.RemoveById(state.Pending, entry => entry.Id, id) },
            state => state.Pending.Count,
            "승인 대기 항목을 찾지 못했다"
        );
    }

    public ApprovalMutationResult RevokeGrant(string grantId, DateTimeOffset now)
    {
        return RemoveEntry(
            grantId,
            now,
            (state, id) => state with { Grants = ApprovalPolicy.RemoveById(state.Grants, grant => grant.Id, id) },
            state => state.Grants.Count,
            "승인을 찾지 못했다"
        );
    }

    private ApprovalMutationResult RemoveEntry(
        string id,
        DateTimeOffset now,
        Func<ApprovalState, string, ApprovalState> remove,
        Func<ApprovalState, int> count,
        string missingMessage
    )
    {
        lock (_lock)
        {
            var current = ReadFromDisk();
            if (current.LoadError.Length > 0)
            {
                return new ApprovalMutationResult(false, $"승인 상태를 읽지 못했다: {current.LoadError}", current);
            }

            var next = remove(current, id);
            if (count(next) == count(current))
            {
                return new ApprovalMutationResult(false, $"{missingMessage}: {id}", current);
            }

            next = next with { Grants = ApprovalPolicy.RemoveExpired(next.Grants, now) };
            return WriteUnlocked(next)
                ? new ApprovalMutationResult(true, string.Empty, ReadFromDisk())
                : new ApprovalMutationResult(false, "승인 상태를 저장하지 못했다", current);
        }
    }

    private bool WriteUnlocked(ApprovalState state)
    {
        try
        {
            AtomicFileStore.WriteAllText(_path, Serialize(state) + "\n", ownerOnly: true);
        }
        catch (Exception)
        {
            return false;
        }

        _cached = null;
        _cachedStamp = string.Empty;
        return true;
    }

    private ApprovalState ReadFromDisk()
    {
        if (!File.Exists(_path))
        {
            return ApprovalState.Empty;
        }

        string text;
        try
        {
            text = File.ReadAllText(_path, Encoding.UTF8);
        }
        catch (Exception exception)
        {
            return ApprovalState.Empty with { Exists = true, LoadError = exception.Message };
        }

        return Parse(text) with { Exists = true };
    }

    internal static ApprovalState Parse(string? text)
    {
        var content = (text ?? string.Empty).Trim();
        if (content.Length == 0)
        {
            return ApprovalState.Empty;
        }

        JsonDocument document;
        try
        {
            document = JsonDocument.Parse(content);
        }
        catch (JsonException exception)
        {
            return ApprovalState.Empty with { LoadError = exception.Message };
        }

        using (document)
        {
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object)
            {
                return ApprovalState.Empty with { LoadError = "최상위가 객체가 아니다" };
            }

            var version = ExtensionConfigJson.ReadInt(root, "version", ApprovalState.CurrentVersion);
            if (version > ApprovalState.CurrentVersion)
            {
                return ApprovalState.Empty with
                {
                    Version = version,
                    LoadError = $"지원하지 않는 승인 상태 버전 {version}"
                };
            }

            return new ApprovalState(
                version,
                ReadPending(root),
                ReadGrants(root),
                Exists: false,
                LoadError: string.Empty
            );
        }
    }

    private static IReadOnlyList<PendingApproval> ReadPending(JsonElement root)
    {
        var items = new List<PendingApproval>();
        if (!root.TryGetProperty("pending", out var array) || array.ValueKind != JsonValueKind.Array)
        {
            return items;
        }

        foreach (var element in array.EnumerateArray())
        {
            if (element.ValueKind != JsonValueKind.Object)
            {
                continue;
            }

            var id = ExtensionConfigJson.ReadString(element, "id");
            var eventId = HookEventCatalog.Normalize(ExtensionConfigJson.ReadString(element, "event"));
            if (id.Length == 0 || eventId.Length == 0)
            {
                continue;
            }

            items.Add(new PendingApproval(
                id,
                eventId,
                ApprovalPolicy.NormalizeTarget(ExtensionConfigJson.ReadString(element, "target")),
                ExtensionConfigJson.ReadString(element, "reason"),
                ExtensionConfigJson.ReadString(element, "hookId"),
                ExtensionConfigJson.ReadString(element, "requestedUtc"),
                Math.Max(1, ExtensionConfigJson.ReadInt(element, "requestCount", 1))
            ));
        }

        return items;
    }

    private static IReadOnlyList<ApprovalGrant> ReadGrants(JsonElement root)
    {
        var items = new List<ApprovalGrant>();
        if (!root.TryGetProperty("grants", out var array) || array.ValueKind != JsonValueKind.Array)
        {
            return items;
        }

        foreach (var element in array.EnumerateArray())
        {
            if (element.ValueKind != JsonValueKind.Object)
            {
                continue;
            }

            var id = ExtensionConfigJson.ReadString(element, "id");
            var eventId = HookEventCatalog.Normalize(ExtensionConfigJson.ReadString(element, "event"));
            if (id.Length == 0 || eventId.Length == 0)
            {
                continue;
            }

            items.Add(new ApprovalGrant(
                id,
                eventId,
                ApprovalPolicy.NormalizeTarget(ExtensionConfigJson.ReadString(element, "target")),
                string.Equals(ExtensionConfigJson.ReadString(element, "scope"), "session", StringComparison.OrdinalIgnoreCase)
                    ? ApprovalScope.Session
                    : ApprovalScope.Once,
                ExtensionConfigJson.ReadString(element, "grantedUtc"),
                ExtensionConfigJson.ReadString(element, "expiresUtc")
            ));
        }

        return items;
    }

    internal static string Serialize(ApprovalState state)
    {
        using var buffer = new MemoryStream();
        using (var writer = new Utf8JsonWriter(buffer, new JsonWriterOptions { Indented = true }))
        {
            writer.WriteStartObject();
            writer.WriteNumber("version", ApprovalState.CurrentVersion);

            writer.WriteStartArray("pending");
            foreach (var entry in state.Pending)
            {
                writer.WriteStartObject();
                writer.WriteString("id", entry.Id);
                writer.WriteString("event", entry.Event);
                writer.WriteString("target", entry.Target);
                writer.WriteString("reason", entry.Reason);
                writer.WriteString("hookId", entry.HookId);
                writer.WriteString("requestedUtc", entry.RequestedUtc);
                writer.WriteNumber("requestCount", entry.RequestCount);
                writer.WriteEndObject();
            }

            writer.WriteEndArray();

            writer.WriteStartArray("grants");
            foreach (var grant in state.Grants)
            {
                writer.WriteStartObject();
                writer.WriteString("id", grant.Id);
                writer.WriteString("event", grant.Event);
                writer.WriteString("target", grant.Target);
                writer.WriteString("scope", grant.Scope == ApprovalScope.Session ? "session" : "once");
                writer.WriteString("grantedUtc", grant.GrantedUtc);
                writer.WriteString("expiresUtc", grant.ExpiresUtc);
                writer.WriteEndObject();
            }

            writer.WriteEndArray();
            writer.WriteEndObject();
        }

        return Encoding.UTF8.GetString(buffer.ToArray());
    }

    private string ComputeStamp()
    {
        try
        {
            return File.Exists(_path)
                ? File.GetLastWriteTimeUtc(_path).Ticks.ToString()
                : "missing";
        }
        catch (Exception)
        {
            return Guid.NewGuid().ToString("N");
        }
    }
}

/// <summary>승인 상태 변경 결과.</summary>
internal sealed record ApprovalMutationResult(bool Ok, string Error, ApprovalState State);
