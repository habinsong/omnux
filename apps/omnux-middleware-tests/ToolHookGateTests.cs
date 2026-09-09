using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

/// <summary>실제 확장 설정으로 도구 훅 게이트를 확인한다.</summary>
public sealed class ToolHookGateTests : IDisposable
{
    private readonly string _dir = Path.Combine(
        Path.GetTempPath(),
        $"omnux-tool-hook-gate-{Guid.NewGuid():N}"
    );

    public ToolHookGateTests()
    {
        Directory.CreateDirectory(_dir);
        Directory.CreateDirectory(Path.Combine(_dir, "plugins"));
    }

    public void Dispose()
    {
        try { Directory.Delete(_dir, recursive: true); } catch { }
    }

    [Fact]
    public void ToolNameCombinesTypeAndAction()
    {
        Assert.Equal("cron", ExtensionToolHookGate.BuildToolName("cron", ""));
        Assert.Equal("cron:add", ExtensionToolHookGate.BuildToolName(" cron ", " add "));
        Assert.Equal(string.Empty, ExtensionToolHookGate.BuildToolName("  ", "add"));
    }

    [Fact]
    public async Task NoHooksAllowsTheTool()
    {
        var decision = await GateWith().BeforeToolAsync("web_search", "", "{}", CancellationToken.None);
        Assert.True(decision.Allowed);
    }

    [Fact]
    public async Task DenyHookBlocksTheTool()
    {
        var gate = GateWith(Builtin("no-browser", HookEventCatalog.ToolPre, BuiltinHookHandlers.RequireApproval, "브라우저 확인"));
        var decision = await gate.BeforeToolAsync("browser", "", "{}", CancellationToken.None);

        Assert.False(decision.Allowed);
        Assert.Equal("no-browser", decision.DecidedByHookId);
    }

    [Fact]
    public async Task ToolPatternSelectsOneToolOnly()
    {
        var gate = GateWith(new HookDefinition(
            "browser-only",
            HookEventCatalog.ToolPre,
            HookHandlerKind.Builtin,
            string.Empty,
            BuiltinHookHandlers.RequireApproval,
            "브라우저만 확인",
            new HookMatcher("browser", string.Empty),
            HookDefinition.DefaultTimeoutMs,
            HookFailureMode.Open,
            true,
            string.Empty,
            string.Empty
        ));

        Assert.False((await gate.BeforeToolAsync("browser", "", "{}", CancellationToken.None)).Allowed);
        Assert.True((await gate.BeforeToolAsync("web_search", "", "{}", CancellationToken.None)).Allowed);
    }

    [Fact]
    public async Task ActionIsPartOfTheMatchedToolName()
    {
        // cron:remove 만 막고 cron:list 는 통과해야 한다.
        var gate = GateWith(new HookDefinition(
            "no-cron-remove",
            HookEventCatalog.ToolPre,
            HookHandlerKind.Builtin,
            string.Empty,
            BuiltinHookHandlers.RequireApproval,
            "예약 삭제 확인",
            new HookMatcher("cron:remove", string.Empty),
            HookDefinition.DefaultTimeoutMs,
            HookFailureMode.Open,
            true,
            string.Empty,
            string.Empty
        ));

        Assert.False((await gate.BeforeToolAsync("cron", "remove", "{}", CancellationToken.None)).Allowed);
        Assert.True((await gate.BeforeToolAsync("cron", "list", "{}", CancellationToken.None)).Allowed);
    }

    [Fact]
    public async Task RequestJsonReachesTheCommandHook()
    {
        if (OperatingSystem.IsWindows())
        {
            return;
        }

        var capture = Path.Combine(_dir, "tool-event.json");
        var gate = GateWith(new HookDefinition(
            "record",
            HookEventCatalog.ToolPre,
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

        var decision = await gate.BeforeToolAsync(
            "web_search",
            "",
            "{\"type\":\"web_search\",\"query\":\"탭\\t포함\"}",
            CancellationToken.None
        );
        Assert.True(decision.Allowed);

        using var document = System.Text.Json.JsonDocument.Parse(await File.ReadAllTextAsync(capture));
        var root = document.RootElement;
        Assert.Equal(HookEventCatalog.ToolPre, root.GetProperty("event").GetString());
        Assert.Equal("web_search", root.GetProperty("toolName").GetString());
        // 요청 원문이 객체 그대로 전달된다.
        Assert.Equal("탭\t포함", root.GetProperty("toolInput").GetProperty("query").GetString());
    }

    [Fact]
    public async Task AfterAndErrorHooksNeverThrow()
    {
        var gate = GateWith(new HookDefinition(
            "broken",
            HookEventCatalog.ToolPost,
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

        await gate.AfterToolAsync("web_search", "", CancellationToken.None);
        await gate.OnToolErrorAsync("web_search", "", "실패", CancellationToken.None);
    }

    [Fact]
    public async Task ApprovalMakesTheSameToolPassNextTime()
    {
        var store = new ApprovalStore(Path.Combine(_dir, "extension-approvals.json"));
        var gate = GateWith(
            new[] { Builtin("confirm", HookEventCatalog.ToolPre, BuiltinHookHandlers.RequireApproval, "확인") },
            store
        );

        Assert.False((await gate.BeforeToolAsync("browser", "", "{}", CancellationToken.None)).Allowed);

        var pendingId = ApprovalPolicy.BuildId(HookEventCatalog.ToolPre, "browser");
        Assert.True(store.Approve(pendingId, ApprovalScope.Session, 60, DateTimeOffset.UtcNow).Ok);

        Assert.True((await gate.BeforeToolAsync("browser", "", "{}", CancellationToken.None)).Allowed);
        // 다른 도구에는 새지 않는다.
        Assert.False((await gate.BeforeToolAsync("canvas", "", "{}", CancellationToken.None)).Allowed);
    }

    private ExtensionToolHookGate GateWith(params HookDefinition[] hooks) => GateWith(hooks, null);

    private ExtensionToolHookGate GateWith(HookDefinition[] hooks, ApprovalStore? approvalStore)
    {
        var store = new ExtensionConfigStore(Path.Combine(_dir, "extensions.json"));
        var saved = store.Save(ExtensionConfigSnapshot.Empty with { Hooks = hooks });
        Assert.True(saved.Saved, saved.Error);

        var service = new ExtensionApplicationService(
            store,
            () => _dir,
            () => Path.Combine(_dir, "plugins")
        );
        var approvals = new HookApprovalCoordinator(
            approvalStore ?? new ApprovalStore(Path.Combine(_dir, "extension-approvals.json"))
        );
        return new ExtensionToolHookGate(new HookDispatcher(service), approvals);
    }

    private static HookDefinition Builtin(string id, string eventId, string builtinId, string argument)
    {
        return new HookDefinition(
            id,
            eventId,
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
