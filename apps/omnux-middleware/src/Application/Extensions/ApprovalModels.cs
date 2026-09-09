namespace Omnux.Middleware;

/// <summary>승인 범위. Once 는 1회 소모, Session 은 만료 시각까지 반복 사용.</summary>
internal enum ApprovalScope
{
    Once = 0,
    Session = 1
}

/// <summary>
/// 승인 대기 1건. 훅이 ask 를 반환했지만 아직 사용자가 결정하지 않은 상태다.
/// 같은 이벤트·대상 조합은 하나로 합친다.
/// </summary>
internal sealed record PendingApproval(
    string Id,
    string Event,
    string Target,
    string Reason,
    string HookId,
    string RequestedUtc,
    int RequestCount
);

/// <summary>사용자가 부여한 승인. 만료 시각과 범위를 함께 저장한다.</summary>
internal sealed record ApprovalGrant(
    string Id,
    string Event,
    string Target,
    ApprovalScope Scope,
    string GrantedUtc,
    string ExpiresUtc
);

/// <summary>승인 상태 파일 1건의 내용.</summary>
internal sealed record ApprovalState(
    int Version,
    IReadOnlyList<PendingApproval> Pending,
    IReadOnlyList<ApprovalGrant> Grants,
    bool Exists,
    string LoadError
)
{
    public const int CurrentVersion = 1;
    public const int MaxPending = 64;
    public const int MaxGrants = 64;

    public static ApprovalState Empty => new(
        CurrentVersion,
        Array.Empty<PendingApproval>(),
        Array.Empty<ApprovalGrant>(),
        false,
        string.Empty
    );
}

/// <summary>승인 조회 결과. 허용 여부와 소모된 승인을 함께 돌려준다.</summary>
internal readonly record struct ApprovalLookup(
    bool Approved,
    ApprovalGrant? Grant,
    bool ConsumesGrant
)
{
    public static readonly ApprovalLookup NotApproved = new(false, null, false);
}
