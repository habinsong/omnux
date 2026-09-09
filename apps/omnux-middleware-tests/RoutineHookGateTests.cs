using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class HookGatePolicyTests
{
    [Fact]
    public void NoDecisionAllows()
    {
        var decision = HookGatePolicy.ToDecision(HookDispatchResult.Empty(HookEventCatalog.RoutinePre));
        Assert.True(decision.Allowed);
        Assert.Equal(string.Empty, decision.Reason);
    }

    [Fact]
    public void AllowOutcomeAllows()
    {
        Assert.True(HookGatePolicy.ToDecision(Result(HookOutcome.Allow, "ok", "h1")).Allowed);
    }

    [Fact]
    public void DenyBlocksAndKeepsReasonAndHookId()
    {
        var decision = HookGatePolicy.ToDecision(Result(HookOutcome.Deny, "보호 경로", "guard"));
        Assert.False(decision.Allowed);
        Assert.Equal("보호 경로", decision.Reason);
        Assert.Equal("guard", decision.DecidedByHookId);
    }

    [Fact]
    public void DenyWithoutReasonStillExplainsItself()
    {
        var decision = HookGatePolicy.ToDecision(Result(HookOutcome.Deny, string.Empty, "guard"));
        Assert.False(decision.Allowed);
        Assert.NotEqual(string.Empty, decision.Reason);
    }

    [Fact]
    public void AskBlocksAndSaysApprovalPathIsMissing()
    {
        var decision = HookGatePolicy.ToDecision(Result(HookOutcome.Ask, "확인 필요", "confirm"));
        Assert.False(decision.Allowed);
        Assert.Contains("확인 필요", decision.Reason);
        Assert.Contains(HookGatePolicy.PendingApprovalNote, decision.Reason);
    }

    private static HookDispatchResult Result(HookOutcome outcome, string reason, string hookId)
    {
        return new HookDispatchResult(
            HookEventCatalog.RoutinePre,
            outcome,
            reason,
            hookId,
            string.Empty,
            string.Empty,
            Array.Empty<string>(),
            Array.Empty<HookRunResult>()
        );
    }
}

/// <summary>실제 확장 설정과 실제 훅 실행으로 자동화 게이트를 확인한다.</summary>
public sealed class RoutineHookGateTests : IDisposable
{
    private readonly string _dir = Path.Combine(
        Path.GetTempPath(),
        $"omnux-routine-hook-gate-{Guid.NewGuid():N}"
    );

    public RoutineHookGateTests()
    {
        Directory.CreateDirectory(_dir);
        Directory.CreateDirectory(Path.Combine(_dir, "plugins"));
    }

    public void Dispose()
    {
        try { Directory.Delete(_dir, recursive: true); } catch { }
    }

    [Fact]
    public async Task NoHooksAllowsTheRun()
    {
        var gate = GateWith();
        var decision = await gate.BeforeRunAsync("daily-report", "일일 보고", CancellationToken.None);
        Assert.True(decision.Allowed);
    }

    [Fact]
    public async Task ApprovalHookBlocksTheRunWithReason()
    {
        var gate = GateWith(new HookDefinition(
            "confirm-routine",
            HookEventCatalog.RoutinePre,
            HookHandlerKind.Builtin,
            string.Empty,
            BuiltinHookHandlers.RequireApproval,
            "예약 실행 확인",
            HookMatcher.Any,
            HookDefinition.DefaultTimeoutMs,
            HookFailureMode.Open,
            true,
            string.Empty,
            string.Empty
        ));

        var decision = await gate.BeforeRunAsync("daily-report", "일일 보고", CancellationToken.None);
        Assert.False(decision.Allowed);
        Assert.Equal("confirm-routine", decision.DecidedByHookId);
        Assert.Contains("예약 실행 확인", decision.Reason);
    }

    [Fact]
    public async Task ToolPatternLimitsTheHookToOneRoutine()
    {
        var gate = GateWith(new HookDefinition(
            "only-deploy",
            HookEventCatalog.RoutinePre,
            HookHandlerKind.Builtin,
            string.Empty,
            BuiltinHookHandlers.RequireApproval,
            "배포 루틴 확인",
            new HookMatcher("deploy-nightly", string.Empty),
            HookDefinition.DefaultTimeoutMs,
            HookFailureMode.Open,
            true,
            string.Empty,
            string.Empty
        ));

        Assert.False((await gate.BeforeRunAsync("deploy-nightly", "배포", CancellationToken.None)).Allowed);
        Assert.True((await gate.BeforeRunAsync("daily-report", "보고", CancellationToken.None)).Allowed);
    }

    [Fact]
    public async Task CommandHookReceivesRoutineIdOnStandardInput()
    {
        if (OperatingSystem.IsWindows())
        {
            return;
        }

        var capture = Path.Combine(_dir, "routine-event.json");
        var gate = GateWith(new HookDefinition(
            "record",
            HookEventCatalog.RoutinePre,
            HookHandlerKind.Command,
            $"cat > '{capture}'",
            string.Empty,
            string.Empty,
            HookMatcher.Any,
            HookDefinition.DefaultTimeoutMs,
            HookFailureMode.Open,
            true,
            string.Empty,
            string.Empty
        ));

        var decision = await gate.BeforeRunAsync("daily-report", "일일 보고", CancellationToken.None);
        Assert.True(decision.Allowed);

        using var document = System.Text.Json.JsonDocument.Parse(await File.ReadAllTextAsync(capture));
        var root = document.RootElement;
        Assert.Equal(HookEventCatalog.RoutinePre, root.GetProperty("event").GetString());
        Assert.Equal("daily-report", root.GetProperty("sessionId").GetString());
        Assert.Equal("일일 보고", root.GetProperty("prompt").GetString());
    }

    [Fact]
    public async Task AfterRunNeverThrowsEvenWhenHookFails()
    {
        var gate = GateWith(new HookDefinition(
            "broken",
            HookEventCatalog.RoutinePost,
            HookHandlerKind.Command,
            "exit 9",
            string.Empty,
            string.Empty,
            HookMatcher.Any,
            HookDefinition.DefaultTimeoutMs,
            HookFailureMode.Open,
            true,
            string.Empty,
            string.Empty
        ));

        await gate.AfterRunAsync("daily-report", "ok", CancellationToken.None);
    }

    private ExtensionRoutineHookGate GateWith(params HookDefinition[] hooks)
    {
        var store = new ExtensionConfigStore(Path.Combine(_dir, "extensions.json"));
        var saved = store.Save(ExtensionConfigSnapshot.Empty with { Hooks = hooks });
        Assert.True(saved.Saved, saved.Error);

        var service = new ExtensionApplicationService(
            store,
            () => _dir,
            () => Path.Combine(_dir, "plugins")
        );
        return new ExtensionRoutineHookGate(new HookDispatcher(service));
    }
}

/// <summary>코딩 계획 훅 게이트를 실제 확장 설정으로 확인한다.</summary>
public sealed class CodingPlanHookGateTests : IDisposable
{
    private readonly string _dir = Path.Combine(
        Path.GetTempPath(),
        $"omnux-coding-plan-gate-{Guid.NewGuid():N}"
    );

    public CodingPlanHookGateTests()
    {
        Directory.CreateDirectory(_dir);
        Directory.CreateDirectory(Path.Combine(_dir, "plugins"));
    }

    public void Dispose()
    {
        try { Directory.Delete(_dir, recursive: true); } catch { }
    }

    [Fact]
    public async Task NoHooksAllowsThePlan()
    {
        var decision = await GateWith().BeforePlanAsync("웹 페이지를 만든다", _dir, CancellationToken.None);
        Assert.True(decision.Allowed);
    }

    [Fact]
    public async Task PlanHookCanBlockBeforeAnyFileIsTouched()
    {
        var gate = GateWith(Builtin("no-plan", BuiltinHookHandlers.RequireApproval, "계획 검토 필요"));
        var decision = await gate.BeforePlanAsync("웹 페이지를 만든다", _dir, CancellationToken.None);

        Assert.False(decision.Allowed);
        Assert.Equal("no-plan", decision.DecidedByHookId);
        Assert.Contains("계획 검토 필요", decision.Reason);
    }

    [Fact]
    public async Task FilePreHookDoesNotFireOnThePlanEvent()
    {
        // 이벤트가 다르면 걸리지 않아야 한다. 한 훅이 모든 시점에 적용되면 안 된다.
        var gate = GateWith(new HookDefinition(
            "file-only",
            HookEventCatalog.CodingFilePre,
            HookHandlerKind.Builtin,
            string.Empty,
            BuiltinHookHandlers.RequireApproval,
            "파일 확인",
            HookMatcher.Any,
            HookDefinition.DefaultTimeoutMs,
            HookFailureMode.Open,
            true,
            string.Empty,
            string.Empty
        ));

        Assert.True((await gate.BeforePlanAsync("무엇이든", _dir, CancellationToken.None)).Allowed);
    }

    [Fact]
    public async Task ObjectiveReachesTheCommandHookAsPrompt()
    {
        if (OperatingSystem.IsWindows())
        {
            return;
        }

        var capture = Path.Combine(_dir, "plan-event.json");
        var gate = GateWith(new HookDefinition(
            "record",
            HookEventCatalog.CodingPlan,
            HookHandlerKind.Command,
            $"cat > '{capture}'",
            string.Empty,
            string.Empty,
            HookMatcher.Any,
            HookDefinition.DefaultTimeoutMs,
            HookFailureMode.Open,
            true,
            string.Empty,
            string.Empty
        ));

        Assert.True((await gate.BeforePlanAsync("계산기를 만든다", _dir, CancellationToken.None)).Allowed);

        using var document = System.Text.Json.JsonDocument.Parse(await File.ReadAllTextAsync(capture));
        Assert.Equal(HookEventCatalog.CodingPlan, document.RootElement.GetProperty("event").GetString());
        Assert.Equal("계산기를 만든다", document.RootElement.GetProperty("prompt").GetString());
        Assert.Equal(_dir, document.RootElement.GetProperty("cwd").GetString());
    }

    private ExtensionCodingHookGate GateWith(params HookDefinition[] hooks)
    {
        var store = new ExtensionConfigStore(Path.Combine(_dir, "extensions.json"));
        var saved = store.Save(ExtensionConfigSnapshot.Empty with { Hooks = hooks });
        Assert.True(saved.Saved, saved.Error);

        var service = new ExtensionApplicationService(
            store,
            () => _dir,
            () => Path.Combine(_dir, "plugins")
        );
        return new ExtensionCodingHookGate(new HookDispatcher(service));
    }

    private static HookDefinition Builtin(string id, string builtinId, string argument)
    {
        return new HookDefinition(
            id,
            HookEventCatalog.CodingPlan,
            HookHandlerKind.Builtin,
            string.Empty,
            builtinId,
            argument,
            HookMatcher.Any,
            HookDefinition.DefaultTimeoutMs,
            HookFailureMode.Open,
            true,
            string.Empty,
            string.Empty
        );
    }
}

/// <summary>수명 알림 훅과 검증 게이트를 실제 확장 설정으로 확인한다.</summary>
public sealed class LifecycleAndVerifyHookTests : IDisposable
{
    private readonly string _dir = Path.Combine(
        Path.GetTempPath(),
        $"omnux-lifecycle-hook-{Guid.NewGuid():N}"
    );

    public LifecycleAndVerifyHookTests()
    {
        Directory.CreateDirectory(_dir);
        Directory.CreateDirectory(Path.Combine(_dir, "plugins"));
    }

    public void Dispose()
    {
        try { Directory.Delete(_dir, recursive: true); } catch { }
    }

    [Fact]
    public async Task SessionStartHookReceivesTheSessionId()
    {
        if (OperatingSystem.IsWindows())
        {
            return;
        }

        var capture = Path.Combine(_dir, "session-event.json");
        var notifier = NotifierWith(Command("record", HookEventCatalog.SessionStart, $"cat > '{capture}'"));

        await notifier.NotifyAsync(HookEventCatalog.SessionStart, "sess-1", "websocket", CancellationToken.None);

        using var document = System.Text.Json.JsonDocument.Parse(await File.ReadAllTextAsync(capture));
        var root = document.RootElement;
        Assert.Equal(HookEventCatalog.SessionStart, root.GetProperty("event").GetString());
        Assert.Equal("sess-1", root.GetProperty("sessionId").GetString());
        Assert.Equal("websocket", root.GetProperty("prompt").GetString());
    }

    [Fact]
    public async Task NotifierRefusesBlockingEventsSoDecisionsAreNotDiscarded()
    {
        if (OperatingSystem.IsWindows())
        {
            return;
        }

        var capture = Path.Combine(_dir, "should-not-exist.json");
        var notifier = NotifierWith(Command("record", HookEventCatalog.ToolPre, $"cat > '{capture}'"));

        // tool.pre 는 차단 가능한 이벤트다. 알림 경로로 보내면 판정을 버리게 되므로 실행하지 않는다.
        await notifier.NotifyAsync(HookEventCatalog.ToolPre, "sess-1", "x", CancellationToken.None);
        Assert.False(File.Exists(capture));
    }

    [Fact]
    public async Task UnknownEventIsIgnored()
    {
        await NotifierWith().NotifyAsync("nope", "sess-1", "x", CancellationToken.None);
    }

    [Fact]
    public async Task FailingNotificationHookDoesNotThrow()
    {
        var notifier = NotifierWith(Command("broken", HookEventCatalog.SessionEnd, "exit 9"));
        await notifier.NotifyAsync(HookEventCatalog.SessionEnd, "sess-1", "websocket", CancellationToken.None);
    }

    [Fact]
    public async Task VerifyHookCanBlockTheFinalCommand()
    {
        var gate = GateWith(new HookDefinition(
            "no-verify",
            HookEventCatalog.CodingVerify,
            HookHandlerKind.Builtin,
            string.Empty,
            BuiltinHookHandlers.DenyCommand,
            "*pytest*",
            HookMatcher.Any,
            HookDefinition.DefaultTimeoutMs,
            HookFailureMode.Open,
            true,
            string.Empty,
            string.Empty
        ));

        Assert.False((await gate.BeforeVerifyAsync("pytest -q", _dir, CancellationToken.None)).Allowed);
        Assert.True((await gate.BeforeVerifyAsync("node main.js", _dir, CancellationToken.None)).Allowed);
    }

    private ExtensionCodingHookGate GateWith(params HookDefinition[] hooks)
    {
        return new ExtensionCodingHookGate(
            new HookDispatcher(ServiceWith(hooks)),
            new HookApprovalCoordinator(new ApprovalStore(Path.Combine(_dir, "extension-approvals.json")))
        );
    }

    private ExtensionLifecycleHookNotifier NotifierWith(params HookDefinition[] hooks)
    {
        return new ExtensionLifecycleHookNotifier(new HookDispatcher(ServiceWith(hooks)));
    }

    private ExtensionApplicationService ServiceWith(HookDefinition[] hooks)
    {
        var store = new ExtensionConfigStore(Path.Combine(_dir, "extensions.json"));
        var saved = store.Save(ExtensionConfigSnapshot.Empty with { Hooks = hooks });
        Assert.True(saved.Saved, saved.Error);
        return new ExtensionApplicationService(store, () => _dir, () => Path.Combine(_dir, "plugins"));
    }

    private static HookDefinition Command(string id, string eventId, string command)
    {
        return new HookDefinition(
            id,
            eventId,
            HookHandlerKind.Command,
            command,
            string.Empty,
            string.Empty,
            HookMatcher.Any,
            HookDefinition.DefaultTimeoutMs,
            HookFailureMode.Open,
            true,
            string.Empty,
            string.Empty
        );
    }
}
