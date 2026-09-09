using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class PromptContextComposerTests
{
    [Fact]
    public void NoContextLeavesThePromptUntouched()
    {
        Assert.Equal("원본 질문", PromptContextComposer.Apply("원본 질문", null));
        Assert.Equal("원본 질문", PromptContextComposer.Apply("원본 질문", Array.Empty<string>()));
        Assert.Equal("원본 질문", PromptContextComposer.Apply("원본 질문", new[] { "   " }));
    }

    [Fact]
    public void ContextIsAppendedBelowTheOriginalText()
    {
        var result = PromptContextComposer.Apply("원본 질문", new[] { "오늘은 금요일", "배포 금지" });

        // 사용자가 쓴 본문이 앞에 그대로 남는다.
        Assert.StartsWith("원본 질문", result);
        Assert.Contains(PromptContextComposer.BlockHeader, result);
        Assert.Contains("- 오늘은 금요일", result);
        Assert.Contains("- 배포 금지", result);
    }

    [Fact]
    public void CodeInThePromptIsNotModified()
    {
        var prompt = "다음을 고쳐줘\n```python\ndef f():\n    return 1\n```";
        var result = PromptContextComposer.Apply(prompt, new[] { "짧게" });
        Assert.StartsWith(prompt, result);
    }

    [Fact]
    public void OversizedContextIsSkippedNotTruncated()
    {
        var big = new string('가', PromptContextComposer.MaxContextChars + 1);
        var result = PromptContextComposer.Apply("질문", new[] { big, "짧은 문맥" });

        Assert.DoesNotContain(big, result);
        Assert.Contains("- 짧은 문맥", result);
    }

    [Fact]
    public void AllContextOversizedMeansNoBlockAtAll()
    {
        var big = new string('가', PromptContextComposer.MaxContextChars + 1);
        Assert.Equal("질문", PromptContextComposer.Apply("질문", new[] { big }));
    }
}

/// <summary>실제 확장 설정으로 프롬프트 훅 게이트를 확인한다.</summary>
public sealed class PromptHookGateTests : IDisposable
{
    private readonly string _dir = Path.Combine(
        Path.GetTempPath(),
        $"omnux-prompt-hook-gate-{Guid.NewGuid():N}"
    );

    public PromptHookGateTests()
    {
        Directory.CreateDirectory(_dir);
        Directory.CreateDirectory(Path.Combine(_dir, "plugins"));
    }

    public void Dispose()
    {
        try { Directory.Delete(_dir, recursive: true); } catch { }
    }

    [Fact]
    public async Task NoHooksAllowsThePrompt()
    {
        var decision = await GateWith().BeforePromptAsync("안녕", "conv-1", CancellationToken.None);
        Assert.True(decision.Allowed);
        Assert.Empty(decision.AdditionalContext);
    }

    [Fact]
    public async Task ApprovalHookBlocksThePrompt()
    {
        var gate = GateWith(Builtin("confirm", BuiltinHookHandlers.RequireApproval, "요청 확인"));
        var decision = await gate.BeforePromptAsync("안녕", "conv-1", CancellationToken.None);

        Assert.False(decision.Allowed);
        Assert.Equal("confirm", decision.DecidedByHookId);
        Assert.Contains("요청 확인", decision.Reason);
    }

    [Fact]
    public async Task AddContextHookSuppliesExtraContext()
    {
        var gate = GateWith(Builtin("note", BuiltinHookHandlers.AddContext, "배포는 금지다"));
        var decision = await gate.BeforePromptAsync("안녕", "conv-1", CancellationToken.None);

        Assert.True(decision.Allowed);
        Assert.Contains("배포는 금지다", decision.AdditionalContext);
    }

    [Fact]
    public async Task BlockedPromptCarriesNoContext()
    {
        var gate = GateWith(
            Builtin("note", BuiltinHookHandlers.AddContext, "붙일 문맥"),
            Builtin("stop", BuiltinHookHandlers.RequireApproval, "막는다")
        );

        var decision = await gate.BeforePromptAsync("안녕", "conv-1", CancellationToken.None);
        Assert.False(decision.Allowed);
        Assert.Empty(decision.AdditionalContext);
    }

    [Fact]
    public async Task PromptTextReachesTheCommandHook()
    {
        if (OperatingSystem.IsWindows())
        {
            return;
        }

        var capture = Path.Combine(_dir, "prompt-event.json");
        var gate = GateWith(new HookDefinition(
            "record",
            HookEventCatalog.PromptSubmit,
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

        Assert.True((await gate.BeforePromptAsync("탭\t포함 질문", "conv-9", CancellationToken.None)).Allowed);

        using var document = System.Text.Json.JsonDocument.Parse(await File.ReadAllTextAsync(capture));
        var root = document.RootElement;
        Assert.Equal(HookEventCatalog.PromptSubmit, root.GetProperty("event").GetString());
        Assert.Equal("탭\t포함 질문", root.GetProperty("prompt").GetString());
        Assert.Equal("conv-9", root.GetProperty("sessionId").GetString());
    }

    [Fact]
    public async Task ApprovalIsScopedToTheConversation()
    {
        var store = new ApprovalStore(Path.Combine(_dir, "extension-approvals.json"));
        var gate = GateWith(new[] { Builtin("confirm", BuiltinHookHandlers.RequireApproval, "확인") }, store);

        Assert.False((await gate.BeforePromptAsync("안녕", "conv-a", CancellationToken.None)).Allowed);
        Assert.True(store
            .Approve(ApprovalPolicy.BuildId(HookEventCatalog.PromptSubmit, "conv-a"), ApprovalScope.Session, 60, DateTimeOffset.UtcNow)
            .Ok);

        Assert.True((await gate.BeforePromptAsync("안녕", "conv-a", CancellationToken.None)).Allowed);
        // 다른 대화에는 새지 않는다.
        Assert.False((await gate.BeforePromptAsync("안녕", "conv-b", CancellationToken.None)).Allowed);
    }

    private ExtensionPromptHookGate GateWith(params HookDefinition[] hooks) => GateWith(hooks, null);

    private ExtensionPromptHookGate GateWith(HookDefinition[] hooks, ApprovalStore? approvalStore)
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
        return new ExtensionPromptHookGate(new HookDispatcher(service), approvals);
    }

    private static HookDefinition Builtin(string id, string builtinId, string argument)
    {
        return new HookDefinition(
            id,
            HookEventCatalog.PromptSubmit,
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
