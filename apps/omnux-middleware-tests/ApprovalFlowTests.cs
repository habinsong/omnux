using System.Text;
using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class ApprovalPolicyTests
{
    private static readonly DateTimeOffset Now = new(2026, 9, 9, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public void IdCombinesEventAndTarget()
    {
        Assert.Equal("coding.file.pre|/repo/.env", ApprovalPolicy.BuildId("Coding.File.Pre", " /repo/.env "));
        Assert.Equal("routine.pre|-", ApprovalPolicy.BuildId("routine.pre", "   "));
    }

    [Fact]
    public void GrantOnlyMatchesTheSameEventAndTarget()
    {
        var grants = new[] { Grant("coding.file.pre", "/repo/.env", ApprovalScope.Session) };

        Assert.True(ApprovalPolicy.Find(grants, "coding.file.pre", "/repo/.env", Now).Approved);
        Assert.False(ApprovalPolicy.Find(grants, "coding.file.pre", "/repo/other.env", Now).Approved);
        Assert.False(ApprovalPolicy.Find(grants, "coding.command.pre", "/repo/.env", Now).Approved);
    }

    [Fact]
    public void OnceGrantIsMarkedForConsumption()
    {
        var once = ApprovalPolicy.Find(
            new[] { Grant("routine.pre", "daily", ApprovalScope.Once) },
            "routine.pre",
            "daily",
            Now
        );
        Assert.True(once.Approved);
        Assert.True(once.ConsumesGrant);

        var session = ApprovalPolicy.Find(
            new[] { Grant("routine.pre", "daily", ApprovalScope.Session) },
            "routine.pre",
            "daily",
            Now
        );
        Assert.True(session.Approved);
        Assert.False(session.ConsumesGrant);
    }

    [Fact]
    public void ExpiredGrantDoesNotApprove()
    {
        var expired = ApprovalPolicy.CreateGrant("routine.pre", "daily", ApprovalScope.Session, 10, Now);
        var later = Now.AddMinutes(11);

        Assert.False(ApprovalPolicy.Find(new[] { expired }, "routine.pre", "daily", later).Approved);
        Assert.True(ApprovalPolicy.Find(new[] { expired }, "routine.pre", "daily", Now.AddMinutes(9)).Approved);
        Assert.Empty(ApprovalPolicy.RemoveExpired(new[] { expired }, later));
    }

    [Fact]
    public void SessionMinutesAreClamped()
    {
        var tooLong = ApprovalPolicy.CreateGrant("routine.pre", "daily", ApprovalScope.Session, 999_999, Now);
        Assert.True(ApprovalPolicy.TryParse(tooLong.ExpiresUtc, out var expires));
        Assert.Equal(Now.AddMinutes(ApprovalPolicy.MaxSessionMinutes), expires);

        var zero = ApprovalPolicy.CreateGrant("routine.pre", "daily", ApprovalScope.Session, 0, Now);
        Assert.True(ApprovalPolicy.TryParse(zero.ExpiresUtc, out var defaulted));
        Assert.Equal(Now.AddMinutes(ApprovalPolicy.DefaultSessionMinutes), defaulted);
    }

    [Fact]
    public void RepeatedRequestsIncrementCountInsteadOfPilingUp()
    {
        var first = ApprovalPolicy.Upsert(
            Array.Empty<PendingApproval>(),
            "coding.command.pre",
            "npm publish",
            "확인 필요",
            "guard",
            Now
        );
        var second = ApprovalPolicy.Upsert(first, "coding.command.pre", "npm publish", "확인 필요", "guard", Now);

        var entry = Assert.Single(second);
        Assert.Equal(2, entry.RequestCount);
        Assert.Equal("guard", entry.HookId);
    }

    [Fact]
    public void DifferentTargetsAreSeparateRequests()
    {
        var one = ApprovalPolicy.Upsert(Array.Empty<PendingApproval>(), "coding.file.pre", "a.ts", "r", "h", Now);
        var two = ApprovalPolicy.Upsert(one, "coding.file.pre", "b.ts", "r", "h", Now);
        Assert.Equal(2, two.Count);
    }

    private static ApprovalGrant Grant(string eventId, string target, ApprovalScope scope)
    {
        return ApprovalPolicy.CreateGrant(eventId, target, scope, 60, Now);
    }
}

/// <summary>실제 파일로 승인 저장·소모·손상 보호를 확인한다.</summary>
public sealed class ApprovalStoreTests : IDisposable
{
    private readonly string _dir = Path.Combine(
        Path.GetTempPath(),
        $"omnux-approval-store-{Guid.NewGuid():N}"
    );

    private string StatePath => Path.Combine(_dir, "extension-approvals.json");
    private static readonly DateTimeOffset Now = new(2026, 9, 9, 12, 0, 0, TimeSpan.Zero);

    public ApprovalStoreTests()
    {
        Directory.CreateDirectory(_dir);
    }

    public void Dispose()
    {
        try { Directory.Delete(_dir, recursive: true); } catch { }
    }

    [Fact]
    public void MissingFileReadsEmptyWithoutCreatingIt()
    {
        var store = new ApprovalStore(StatePath);
        var state = store.Read();
        Assert.False(state.Exists);
        Assert.Empty(state.Pending);
        Assert.False(File.Exists(StatePath));
    }

    [Fact]
    public void PendingSurvivesRoundTrip()
    {
        var store = new ApprovalStore(StatePath);
        Assert.True(store.TryRecordPending("coding.file.pre", "/repo/.env", "비밀 파일", "guard", Now));

        var reloaded = new ApprovalStore(StatePath).Read();
        var entry = Assert.Single(reloaded.Pending);
        Assert.Equal("coding.file.pre", entry.Event);
        Assert.Equal("/repo/.env", entry.Target);
        Assert.Equal("비밀 파일", entry.Reason);
        Assert.Equal("guard", entry.HookId);
        Assert.Equal(1, entry.RequestCount);
    }

    [Fact]
    public void ApproveMovesPendingIntoGrant()
    {
        var store = new ApprovalStore(StatePath);
        store.TryRecordPending("routine.pre", "daily", "확인", "guard", Now);
        var pendingId = ApprovalPolicy.BuildId("routine.pre", "daily");

        var result = store.Approve(pendingId, ApprovalScope.Once, 30, Now);
        Assert.True(result.Ok, result.Error);
        Assert.Empty(result.State.Pending);
        var grant = Assert.Single(result.State.Grants);
        Assert.Equal(ApprovalScope.Once, grant.Scope);
        Assert.Equal("daily", grant.Target);
    }

    [Fact]
    public void ApprovingMissingRequestFails()
    {
        var result = new ApprovalStore(StatePath).Approve("nope", ApprovalScope.Once, 30, Now);
        Assert.False(result.Ok);
        Assert.Contains("찾지 못했다", result.Error);
    }

    [Fact]
    public void OnceGrantIsConsumedExactlyOnce()
    {
        var store = new ApprovalStore(StatePath);
        store.TryRecordPending("routine.pre", "daily", "확인", "guard", Now);
        var id = ApprovalPolicy.BuildId("routine.pre", "daily");
        store.Approve(id, ApprovalScope.Once, 30, Now);

        Assert.True(store.TryConsumeGrant(id, Now));
        Assert.False(store.TryConsumeGrant(id, Now));
        Assert.Empty(store.Read().Grants);
    }

    [Fact]
    public void RejectRemovesPendingWithoutGranting()
    {
        var store = new ApprovalStore(StatePath);
        store.TryRecordPending("routine.pre", "daily", "확인", "guard", Now);

        var result = store.Reject(ApprovalPolicy.BuildId("routine.pre", "daily"), Now);
        Assert.True(result.Ok, result.Error);
        Assert.Empty(result.State.Pending);
        Assert.Empty(result.State.Grants);
    }

    [Fact]
    public void RevokeRemovesGrant()
    {
        var store = new ApprovalStore(StatePath);
        store.TryRecordPending("routine.pre", "daily", "확인", "guard", Now);
        var id = ApprovalPolicy.BuildId("routine.pre", "daily");
        store.Approve(id, ApprovalScope.Session, 30, Now);

        Assert.True(store.RevokeGrant(id, Now).Ok);
        Assert.Empty(store.Read().Grants);
        Assert.False(store.RevokeGrant(id, Now).Ok);
    }

    [Fact]
    public void DamagedStateIsReportedAndNotOverwritten()
    {
        File.WriteAllText(StatePath, "{ broken", Encoding.UTF8);
        var original = File.ReadAllText(StatePath);
        var store = new ApprovalStore(StatePath);

        Assert.NotEqual(string.Empty, store.Read().LoadError);
        Assert.False(store.TryRecordPending("routine.pre", "daily", "r", "h", Now));
        Assert.False(store.Approve("x", ApprovalScope.Once, 30, Now).Ok);
        Assert.Equal(original, File.ReadAllText(StatePath));
    }

    [Fact]
    public void FutureVersionIsRejectedAndPreserved()
    {
        var payload = "{\"version\":999,\"pending\":[],\"grants\":[]}";
        File.WriteAllText(StatePath, payload, Encoding.UTF8);
        var store = new ApprovalStore(StatePath);

        Assert.Contains("지원하지 않는", store.Read().LoadError);
        Assert.False(store.TryRecordPending("routine.pre", "daily", "r", "h", Now));
        Assert.Equal(payload, File.ReadAllText(StatePath));
    }
}

/// <summary>ask 판정이 실제 승인 상태와 어떻게 연결되는지 확인한다.</summary>
public sealed class HookApprovalCoordinatorTests : IDisposable
{
    private readonly string _dir = Path.Combine(
        Path.GetTempPath(),
        $"omnux-approval-coordinator-{Guid.NewGuid():N}"
    );

    private DateTimeOffset _now = new(2026, 9, 9, 12, 0, 0, TimeSpan.Zero);

    public HookApprovalCoordinatorTests()
    {
        Directory.CreateDirectory(_dir);
    }

    public void Dispose()
    {
        try { Directory.Delete(_dir, recursive: true); } catch { }
    }

    [Fact]
    public void NonAskOutcomesAreUntouched()
    {
        var coordinator = Create(out _);
        Assert.True(coordinator.Resolve(Result(HookOutcome.None), "routine.pre", "daily").Allowed);
        Assert.True(coordinator.Resolve(Result(HookOutcome.Allow), "routine.pre", "daily").Allowed);
        Assert.False(coordinator.Resolve(Result(HookOutcome.Deny), "routine.pre", "daily").Allowed);
        Assert.Empty(coordinator.Store.Read().Pending);
    }

    [Fact]
    public void FirstAskBlocksAndRegistersPending()
    {
        var coordinator = Create(out var store);

        var decision = coordinator.Resolve(Result(HookOutcome.Ask, "배포 확인"), "routine.pre", "daily");
        Assert.False(decision.Allowed);
        Assert.Contains("승인 대기에 등록", decision.Reason);

        var pending = Assert.Single(store.Read().Pending);
        Assert.Equal("routine.pre", pending.Event);
        Assert.Equal("daily", pending.Target);
        Assert.Equal("배포 확인", pending.Reason);
    }

    [Fact]
    public void AfterApprovalTheSameRequestPasses()
    {
        var coordinator = Create(out var store);
        coordinator.Resolve(Result(HookOutcome.Ask), "routine.pre", "daily");

        var id = ApprovalPolicy.BuildId("routine.pre", "daily");
        Assert.True(store.Approve(id, ApprovalScope.Session, 60, _now).Ok);

        Assert.True(coordinator.Resolve(Result(HookOutcome.Ask), "routine.pre", "daily").Allowed);
        // 세션 승인은 만료 전까지 반복 사용된다.
        Assert.True(coordinator.Resolve(Result(HookOutcome.Ask), "routine.pre", "daily").Allowed);
    }

    [Fact]
    public void OnceApprovalPassesOnlyOnce()
    {
        var coordinator = Create(out var store);
        coordinator.Resolve(Result(HookOutcome.Ask), "coding.command.pre", "npm publish");

        var id = ApprovalPolicy.BuildId("coding.command.pre", "npm publish");
        Assert.True(store.Approve(id, ApprovalScope.Once, 60, _now).Ok);

        Assert.True(coordinator.Resolve(Result(HookOutcome.Ask), "coding.command.pre", "npm publish").Allowed);
        var second = coordinator.Resolve(Result(HookOutcome.Ask), "coding.command.pre", "npm publish");
        Assert.False(second.Allowed);
        Assert.Contains("승인 대기에 등록", second.Reason);
    }

    [Fact]
    public void ApprovalDoesNotLeakToAnotherTarget()
    {
        var coordinator = Create(out var store);
        coordinator.Resolve(Result(HookOutcome.Ask), "coding.file.pre", "/repo/a.env");
        Assert.True(store.Approve(ApprovalPolicy.BuildId("coding.file.pre", "/repo/a.env"), ApprovalScope.Session, 60, _now).Ok);

        Assert.True(coordinator.Resolve(Result(HookOutcome.Ask), "coding.file.pre", "/repo/a.env").Allowed);
        Assert.False(coordinator.Resolve(Result(HookOutcome.Ask), "coding.file.pre", "/repo/b.env").Allowed);
    }

    [Fact]
    public void ExpiredApprovalStopsPassing()
    {
        var coordinator = Create(out var store);
        coordinator.Resolve(Result(HookOutcome.Ask), "routine.pre", "daily");
        Assert.True(store.Approve(ApprovalPolicy.BuildId("routine.pre", "daily"), ApprovalScope.Session, 5, _now).Ok);

        Assert.True(coordinator.Resolve(Result(HookOutcome.Ask), "routine.pre", "daily").Allowed);

        _now = _now.AddMinutes(6);
        Assert.False(coordinator.Resolve(Result(HookOutcome.Ask), "routine.pre", "daily").Allowed);
    }

    [Fact]
    public void RepeatedBlockedRequestsCountUp()
    {
        var coordinator = Create(out var store);
        coordinator.Resolve(Result(HookOutcome.Ask), "routine.pre", "daily");
        coordinator.Resolve(Result(HookOutcome.Ask), "routine.pre", "daily");
        coordinator.Resolve(Result(HookOutcome.Ask), "routine.pre", "daily");

        Assert.Equal(3, Assert.Single(store.Read().Pending).RequestCount);
    }

    private HookApprovalCoordinator Create(out ApprovalStore store)
    {
        store = new ApprovalStore(Path.Combine(_dir, "extension-approvals.json"));
        return new HookApprovalCoordinator(store, () => _now);
    }

    private static HookDispatchResult Result(HookOutcome outcome, string reason = "확인 필요")
    {
        return new HookDispatchResult(
            HookEventCatalog.RoutinePre,
            outcome,
            outcome == HookOutcome.None ? string.Empty : reason,
            outcome == HookOutcome.None ? string.Empty : "guard",
            string.Empty,
            string.Empty,
            Array.Empty<string>(),
            Array.Empty<HookRunResult>()
        );
    }
}

/// <summary>대상을 특정하지 못한 승인이 넓어지지 않는지 확인한다(EXT-09).</summary>
public sealed class UnscopedApprovalTests : IDisposable
{
    private readonly string _dir = Path.Combine(
        Path.GetTempPath(),
        $"omnux-unscoped-approval-{Guid.NewGuid():N}"
    );

    private static readonly DateTimeOffset Now = new(2026, 9, 9, 12, 0, 0, TimeSpan.Zero);

    public UnscopedApprovalTests()
    {
        Directory.CreateDirectory(_dir);
    }

    public void Dispose()
    {
        try { Directory.Delete(_dir, recursive: true); } catch { }
    }

    [Fact]
    public void EmptyTargetIsRecognizedAsUnscoped()
    {
        Assert.True(ApprovalPolicy.IsUnscopedTarget(""));
        Assert.True(ApprovalPolicy.IsUnscopedTarget("   "));
        Assert.True(ApprovalPolicy.IsUnscopedTarget(ApprovalPolicy.UnscopedTarget));
        Assert.False(ApprovalPolicy.IsUnscopedTarget("conv-1"));
    }

    [Fact]
    public void SessionScopeIsNarrowedToOnceWhenTargetIsUnknown()
    {
        Assert.Equal(ApprovalScope.Once, ApprovalPolicy.NarrowScope("", ApprovalScope.Session));
        Assert.Equal(ApprovalScope.Once, ApprovalPolicy.NarrowScope("-", ApprovalScope.Session));
        Assert.Equal(ApprovalScope.Session, ApprovalPolicy.NarrowScope("conv-1", ApprovalScope.Session));
    }

    [Fact]
    public void ApprovingAnUnscopedRequestNeverCreatesASessionGrant()
    {
        var store = new ApprovalStore(Path.Combine(_dir, "extension-approvals.json"));
        store.TryRecordPending(HookEventCatalog.PromptSubmit, "", "확인", "guard", Now);

        var id = ApprovalPolicy.BuildId(HookEventCatalog.PromptSubmit, "");
        // 사용자가 기간 승인을 요청해도 1회로 좁혀진다.
        var result = store.Approve(id, ApprovalScope.Session, 60, Now);

        Assert.True(result.Ok, result.Error);
        var grant = Assert.Single(result.State.Grants);
        Assert.Equal(ApprovalScope.Once, grant.Scope);
    }

    [Fact]
    public async Task UnscopedApprovalPassesExactlyOneRequest()
    {
        var store = new ApprovalStore(Path.Combine(_dir, "extension-approvals.json"));
        var coordinator = new HookApprovalCoordinator(store, () => Now);
        var result = new HookDispatchResult(
            HookEventCatalog.PromptSubmit,
            HookOutcome.Ask,
            "확인",
            "guard",
            string.Empty,
            string.Empty,
            Array.Empty<string>(),
            Array.Empty<HookRunResult>()
        );

        Assert.False(coordinator.Resolve(result, HookEventCatalog.PromptSubmit, "").Allowed);
        Assert.True(store
            .Approve(ApprovalPolicy.BuildId(HookEventCatalog.PromptSubmit, ""), ApprovalScope.Session, 60, Now)
            .Ok);

        // 첫 요청만 통과하고 다음 새 대화는 다시 막힌다.
        Assert.True(coordinator.Resolve(result, HookEventCatalog.PromptSubmit, "").Allowed);
        Assert.False(coordinator.Resolve(result, HookEventCatalog.PromptSubmit, "").Allowed);
        await Task.CompletedTask;
    }

    [Fact]
    public void NamedTargetKeepsSessionScope()
    {
        var store = new ApprovalStore(Path.Combine(_dir, "extension-approvals.json"));
        store.TryRecordPending(HookEventCatalog.PromptSubmit, "conv-1", "확인", "guard", Now);

        var result = store.Approve(
            ApprovalPolicy.BuildId(HookEventCatalog.PromptSubmit, "conv-1"),
            ApprovalScope.Session,
            60,
            Now
        );

        Assert.True(result.Ok, result.Error);
        Assert.Equal(ApprovalScope.Session, Assert.Single(result.State.Grants).Scope);
    }
}
