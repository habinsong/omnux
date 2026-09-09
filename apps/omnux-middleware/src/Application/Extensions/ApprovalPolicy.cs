using System.Globalization;

namespace Omnux.Middleware;

/// <summary>
/// 승인 판정 규칙(순수 함수). 저장·전송과 분리한다.
/// 승인은 이벤트와 대상이 모두 같아야 적용된다. 넓은 승인을 만들지 않기 위한 기준이다.
/// </summary>
internal static class ApprovalPolicy
{
    public const int DefaultSessionMinutes = 60;
    public const int MaxSessionMinutes = 24 * 60;

    /// <summary>승인 대기·승인 식별 키. 이벤트와 대상 문자열을 그대로 쓴다.</summary>
    public static string BuildId(string eventId, string target)
    {
        var normalizedEvent = HookEventCatalog.Normalize(eventId);
        var normalizedTarget = NormalizeTarget(target);
        return $"{normalizedEvent}|{normalizedTarget}";
    }

    /// <summary>대상이 비었을 때 쓰는 표식. 특정 대상이 없다는 뜻이다.</summary>
    public const string UnscopedTarget = "-";

    public static string NormalizeTarget(string? target)
    {
        var value = (target ?? string.Empty).Trim();
        return value.Length == 0 ? UnscopedTarget : value;
    }

    /// <summary>
    /// 대상을 특정하지 못한 요청인지. 새 대화처럼 아직 식별자가 없는 경우다.
    /// 이런 승인은 다음 요청 전부에 적용되므로 1회 범위로만 허용한다.
    /// </summary>
    public static bool IsUnscopedTarget(string? target)
    {
        return string.Equals(NormalizeTarget(target), UnscopedTarget, StringComparison.Ordinal);
    }

    /// <summary>대상을 특정하지 못하면 요청한 범위와 무관하게 1회로 좁힌다.</summary>
    public static ApprovalScope NarrowScope(string? target, ApprovalScope requested)
    {
        return IsUnscopedTarget(target) ? ApprovalScope.Once : requested;
    }

    /// <summary>유효한 승인을 찾는다. 만료된 승인은 없는 것으로 본다.</summary>
    public static ApprovalLookup Find(
        IReadOnlyList<ApprovalGrant> grants,
        string eventId,
        string target,
        DateTimeOffset now
    )
    {
        var id = BuildId(eventId, target);
        foreach (var grant in grants)
        {
            if (!string.Equals(grant.Id, id, StringComparison.Ordinal))
            {
                continue;
            }

            if (IsExpired(grant, now))
            {
                continue;
            }

            return new ApprovalLookup(true, grant, grant.Scope == ApprovalScope.Once);
        }

        return ApprovalLookup.NotApproved;
    }

    public static bool IsExpired(ApprovalGrant grant, DateTimeOffset now)
    {
        if (grant.ExpiresUtc.Length == 0)
        {
            return false;
        }

        return TryParse(grant.ExpiresUtc, out var expires) && expires <= now;
    }

    /// <summary>만료된 승인을 제거한 목록. 저장 시점마다 정리해 상태가 무한히 늘지 않게 한다.</summary>
    public static IReadOnlyList<ApprovalGrant> RemoveExpired(
        IReadOnlyList<ApprovalGrant> grants,
        DateTimeOffset now
    )
    {
        var kept = new List<ApprovalGrant>();
        foreach (var grant in grants)
        {
            if (!IsExpired(grant, now))
            {
                kept.Add(grant);
            }
        }

        return kept;
    }

    /// <summary>승인 대기 등록. 같은 대상이 이미 있으면 요청 횟수만 올린다.</summary>
    public static IReadOnlyList<PendingApproval> Upsert(
        IReadOnlyList<PendingApproval> pending,
        string eventId,
        string target,
        string reason,
        string hookId,
        DateTimeOffset now
    )
    {
        var id = BuildId(eventId, target);
        var next = new List<PendingApproval>(pending.Count + 1);
        var replaced = false;
        foreach (var entry in pending)
        {
            if (string.Equals(entry.Id, id, StringComparison.Ordinal))
            {
                next.Add(entry with
                {
                    Reason = reason,
                    HookId = hookId,
                    RequestedUtc = now.ToString("O", CultureInfo.InvariantCulture),
                    RequestCount = entry.RequestCount + 1
                });
                replaced = true;
                continue;
            }

            next.Add(entry);
        }

        if (!replaced)
        {
            if (next.Count >= ApprovalState.MaxPending)
            {
                // 가장 오래된 항목을 버린다. 새 요청을 조용히 잃지 않기 위한 선택이다.
                next.RemoveAt(0);
            }

            next.Add(new PendingApproval(
                id,
                HookEventCatalog.Normalize(eventId),
                NormalizeTarget(target),
                reason,
                hookId,
                now.ToString("O", CultureInfo.InvariantCulture),
                1
            ));
        }

        return next;
    }

    /// <summary>승인 부여. 같은 id 의 기존 승인은 새 승인으로 대체한다.</summary>
    public static ApprovalGrant CreateGrant(
        string eventId,
        string target,
        ApprovalScope scope,
        int sessionMinutes,
        DateTimeOffset now
    )
    {
        // 두 범위 모두 만료 시각을 둔다. 승인이 무기한 남아 나중 실행을 조용히 통과시키지 않게 한다.
        // Once 는 여기에 더해 1회 사용 시 소모된다.
        var minutes = Math.Clamp(
            sessionMinutes <= 0 ? DefaultSessionMinutes : sessionMinutes,
            1,
            MaxSessionMinutes
        );

        return new ApprovalGrant(
            BuildId(eventId, target),
            HookEventCatalog.Normalize(eventId),
            NormalizeTarget(target),
            scope,
            now.ToString("O", CultureInfo.InvariantCulture),
            now.AddMinutes(minutes).ToString("O", CultureInfo.InvariantCulture)
        );
    }

    public static IReadOnlyList<ApprovalGrant> Upsert(IReadOnlyList<ApprovalGrant> grants, ApprovalGrant grant)
    {
        var next = new List<ApprovalGrant>(grants.Count + 1);
        foreach (var existing in grants)
        {
            if (!string.Equals(existing.Id, grant.Id, StringComparison.Ordinal))
            {
                next.Add(existing);
            }
        }

        if (next.Count >= ApprovalState.MaxGrants)
        {
            next.RemoveAt(0);
        }

        next.Add(grant);
        return next;
    }

    public static IReadOnlyList<T> RemoveById<T>(IReadOnlyList<T> items, Func<T, string> idSelector, string id)
    {
        var next = new List<T>(items.Count);
        foreach (var item in items)
        {
            if (!string.Equals(idSelector(item), id, StringComparison.Ordinal))
            {
                next.Add(item);
            }
        }

        return next;
    }

    public static bool TryParse(string value, out DateTimeOffset parsed)
    {
        return DateTimeOffset.TryParse(
            value,
            CultureInfo.InvariantCulture,
            DateTimeStyles.RoundtripKind,
            out parsed
        );
    }
}
