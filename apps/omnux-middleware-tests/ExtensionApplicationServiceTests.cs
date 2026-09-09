using System.Text;
using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

/// <summary>실제 파일·플러그인 폴더·프로세스로 확장 계층 전체 경로를 확인한다.</summary>
public sealed class ExtensionApplicationServiceTests : IDisposable
{
    private readonly string _dir = Path.Combine(
        Path.GetTempPath(),
        $"omnux-extensions-service-{Guid.NewGuid():N}"
    );

    private string ConfigPath => Path.Combine(_dir, "extensions.json");
    private string PluginRoot => Path.Combine(_dir, "plugins");

    public ExtensionApplicationServiceTests()
    {
        Directory.CreateDirectory(_dir);
        Directory.CreateDirectory(PluginRoot);
    }

    public void Dispose()
    {
        try { Directory.Delete(_dir, recursive: true); } catch { }
    }

    private ExtensionApplicationService CreateService()
    {
        return new ExtensionApplicationService(
            new ExtensionConfigStore(ConfigPath),
            () => _dir,
            () => PluginRoot
        );
    }

    [Fact]
    public void EmptyStateExposesCatalogsWithoutHooks()
    {
        var overview = CreateService().GetOverview();
        Assert.Empty(overview.EffectiveHooks);
        Assert.Empty(overview.Plugins);
        Assert.False(overview.Config.Exists);
        Assert.Equal(ConfigPath, overview.ConfigPath);
    }

    [Fact]
    public void SaveHookPersistsAndAppearsInOverview()
    {
        var service = CreateService();
        var result = service.SaveHook(BuiltinHook("guard", BuiltinHookHandlers.DenyPath, "**/.env"));
        Assert.True(result.Ok);
        Assert.Empty(result.Errors);

        var hook = Assert.Single(result.Overview.EffectiveHooks);
        Assert.Equal("guard", hook.Id);
        Assert.True(File.Exists(ConfigPath));

        // 새 인스턴스로 다시 읽어도 남아 있다.
        Assert.Single(CreateService().GetOverview().EffectiveHooks);
    }

    [Fact]
    public void InvalidHookIsRejectedWithReasonAndNotSaved()
    {
        var service = CreateService();
        var invalid = BuiltinHook("bad", BuiltinHookHandlers.DenyPath, string.Empty);

        var result = service.SaveHook(invalid);
        Assert.False(result.Ok);
        Assert.Contains(result.Errors, error => error.Contains("deny-path"));
        Assert.Empty(result.Overview.EffectiveHooks);
    }

    [Fact]
    public void UnsupportedHandlerIsRejectedInsteadOfSilentlyStored()
    {
        var hook = BuiltinHook("p", BuiltinHookHandlers.RequireApproval, string.Empty)
            with { Handler = HookHandlerKind.Prompt };

        var result = CreateService().SaveHook(hook);
        Assert.False(result.Ok);
        Assert.Contains(result.Errors, error => error.Contains("prompt"));
    }

    [Fact]
    public void ClosedFailureModeOnNonBlockingEventIsRejected()
    {
        var hook = BuiltinHook("post", BuiltinHookHandlers.RequireApproval, string.Empty) with
        {
            Event = HookEventCatalog.ToolPost,
            FailureMode = HookFailureMode.Closed
        };

        var result = CreateService().SaveHook(hook);
        Assert.False(result.Ok);
        Assert.Contains(result.Errors, error => error.Contains("차단할 수 없어"));
    }

    [Fact]
    public void ToggleAndDeleteReportMissingIds()
    {
        var service = CreateService();
        Assert.False(service.SetHookEnabled("nope", false).Ok);
        Assert.False(service.DeleteHook("nope").Ok);
        Assert.False(service.DeleteRule("nope").Ok);
    }

    [Fact]
    public void ToggleHookKeepsOtherFields()
    {
        var service = CreateService();
        service.SaveHook(BuiltinHook("guard", BuiltinHookHandlers.DenyPath, "**/.env"));

        var result = service.SetHookEnabled("guard", false);
        Assert.True(result.Ok);
        var hook = Assert.Single(result.Overview.EffectiveHooks);
        Assert.False(hook.Enabled);
        Assert.Equal("**/.env", hook.BuiltinArgument);
    }

    [Fact]
    public void PluginHooksAppearAndCannotBeEditedAsUserHooks()
    {
        WritePlugin(
            "safety",
            "{\"id\":\"safety\",\"version\":\"1\",\"hooks\":[{\"id\":\"env\",\"event\":\"coding.file.pre\","
            + "\"handler\":\"builtin\",\"builtinId\":\"deny-path\",\"builtinArgument\":\"**/.env\"}]}"
        );

        var service = CreateService();
        var overview = service.GetOverview();
        var hook = Assert.Single(overview.EffectiveHooks);
        Assert.Equal("safety:env", hook.Id);
        Assert.True(hook.IsFromPlugin);

        var result = service.SaveHook(hook);
        Assert.False(result.Ok);
        Assert.Contains(result.Errors, error => error.Contains("플러그인이 기여한"));
    }

    [Fact]
    public void DisablingPluginRemovesItsContributions()
    {
        WritePlugin(
            "safety",
            "{\"id\":\"safety\",\"version\":\"1\",\"rules\":[{\"id\":\"r\",\"body\":\"본문\"}]}"
        );

        var service = CreateService();
        Assert.Single(service.GetOverview().EffectiveRules);

        var result = service.SetPluginEnabled("safety", false);
        Assert.True(result.Ok);
        Assert.Empty(result.Overview.EffectiveRules);
        Assert.False(result.Overview.Plugins[0].Enabled);

        Assert.True(service.SetPluginEnabled("safety", true).Ok);
        Assert.Single(service.GetOverview().EffectiveRules);
    }

    [Fact]
    public void PluginRootMustExistToBeRegistered()
    {
        var service = CreateService();
        var missing = Path.Combine(_dir, "missing-root");

        var failed = service.AddPluginRoot(missing);
        Assert.False(failed.Ok);
        Assert.Contains(failed.Errors, error => error.Contains("폴더가 없다"));

        Directory.CreateDirectory(missing);
        var added = service.AddPluginRoot(missing);
        Assert.True(added.Ok);
        Assert.Contains(Path.GetFullPath(missing), added.Overview.PluginRoots);

        Assert.True(service.RemovePluginRoot(Path.GetFullPath(missing)).Ok);
    }

    [Fact]
    public void DamagedConfigBlocksMutationWithReason()
    {
        File.WriteAllText(ConfigPath, "{ broken", Encoding.UTF8);
        var result = CreateService().SaveHook(BuiltinHook("g", BuiltinHookHandlers.RequireApproval, string.Empty));
        Assert.False(result.Ok);
        Assert.Contains(result.Errors, error => error.Contains("읽지 못해"));
    }

    [Fact]
    public void RuleResolutionUsesUserAndPluginRules()
    {
        WritePlugin(
            "styleguide",
            "{\"id\":\"styleguide\",\"version\":\"1\",\"rules\":"
            + "[{\"id\":\"r\",\"title\":\"플러그인\",\"body\":\"플러그인 본문\",\"priority\":10}]}"
        );

        var service = CreateService();
        service.SaveRule(new ExtensionRule(
            "mine",
            "내 규칙",
            "사용자 본문",
            ExtensionRule.ScopeGlobal,
            string.Empty,
            50,
            true,
            string.Empty
        ));

        var selection = service.ResolveRules(ExtensionRule.ScopeGlobal, null, 2000);
        Assert.Equal(2, selection.Selected.Count);
        Assert.Equal("styleguide:r", selection.Selected[0].Id);
        Assert.Contains("플러그인 본문", selection.Text);
        Assert.Contains("사용자 본문", selection.Text);
    }

    [Fact]
    public async Task TestHookRunsBuiltinAndReportsRealDecision()
    {
        var service = CreateService();
        service.SaveHook(BuiltinHook("guard", BuiltinHookHandlers.DenyPath, "**/.env"));

        var denied = await service.TestHookAsync(
            "guard",
            HookEventInput.ForEvent(HookEventCatalog.CodingFilePre) with { FilePath = "/repo/.env" },
            CancellationToken.None
        );
        Assert.Equal(HookRunStatus.Completed, denied.Status);
        Assert.Equal(HookOutcome.Deny, denied.Outcome);

        var allowed = await service.TestHookAsync(
            "guard",
            HookEventInput.ForEvent(HookEventCatalog.CodingFilePre) with { FilePath = "/repo/main.ts" },
            CancellationToken.None
        );
        Assert.Equal(HookOutcome.None, allowed.Outcome);
    }

    [Fact]
    public async Task TestHookRunsDisabledHookWithoutEnablingIt()
    {
        var service = CreateService();
        service.SaveHook(BuiltinHook("guard", BuiltinHookHandlers.DenyPath, "**/.env") with { Enabled = false });

        var run = await service.TestHookAsync(
            "guard",
            HookEventInput.ForEvent(HookEventCatalog.CodingFilePre) with { FilePath = "/repo/.env" },
            CancellationToken.None
        );
        Assert.Equal(HookOutcome.Deny, run.Outcome);
        Assert.False(service.GetOverview().EffectiveHooks[0].Enabled);
    }

    [Fact]
    public async Task TestHookReportsMissingHookInsteadOfSucceeding()
    {
        var run = await CreateService().TestHookAsync(
            "absent",
            HookEventInput.ForEvent(HookEventCatalog.ToolPre),
            CancellationToken.None
        );
        Assert.Equal(HookRunStatus.NotRun, run.Status);
        Assert.Contains("찾지 못했다", run.Reason);
    }

    [Fact]
    public async Task DispatcherBlocksMatchingWriteAndAllowsOthers()
    {
        var service = CreateService();
        service.SaveHook(
            BuiltinHook("guard", BuiltinHookHandlers.DenyPath, "**/.env") with
            {
                Matcher = new HookMatcher("Write|Edit", string.Empty)
            }
        );

        var dispatcher = new HookDispatcher(service);
        var blocked = await dispatcher.DispatchAsync(
            HookEventInput.ForEvent(HookEventCatalog.CodingFilePre) with
            {
                ToolName = "Write",
                FilePath = "/repo/.env"
            },
            CancellationToken.None
        );
        Assert.True(blocked.IsBlocked);
        Assert.Equal("guard", blocked.DecidedByHookId);

        var otherTool = await dispatcher.DispatchAsync(
            HookEventInput.ForEvent(HookEventCatalog.CodingFilePre) with
            {
                ToolName = "Read",
                FilePath = "/repo/.env"
            },
            CancellationToken.None
        );
        Assert.False(otherTool.IsBlocked);
        Assert.Empty(otherTool.Runs);
    }

    [Fact]
    public async Task DeniedEventStopsLaterHooksFromRunning()
    {
        if (OperatingSystem.IsWindows())
        {
            return;
        }

        var marker = Path.Combine(_dir, "second-ran.txt");
        var service = CreateService();
        service.SaveHook(BuiltinHook("a-deny", BuiltinHookHandlers.DenyPath, "**/*"));
        service.SaveHook(new HookDefinition(
            "b-touch",
            HookEventCatalog.CodingFilePre,
            HookHandlerKind.Command,
            $"touch '{marker}'",
            string.Empty,
            string.Empty,
            HookMatcher.Any,
            HookDefinition.DefaultTimeoutMs,
            HookFailureMode.Open,
            true,
            string.Empty,
            string.Empty
        ));

        var result = await new HookDispatcher(service).DispatchAsync(
            HookEventInput.ForEvent(HookEventCatalog.CodingFilePre) with { FilePath = "/repo/a.ts" },
            CancellationToken.None
        );

        Assert.True(result.IsBlocked);
        Assert.Single(result.Runs);
        Assert.False(File.Exists(marker));
    }

    [Fact]
    public async Task UpdatedInputIsParsedButNotAppliedYet()
    {
        if (OperatingSystem.IsWindows())
        {
            return;
        }

        var service = CreateService();
        service.SaveHook(new HookDefinition(
            "rewrite",
            HookEventCatalog.ToolPre,
            HookHandlerKind.Command,
            "echo '{\"decision\":\"allow\",\"updatedInput\":{\"command\":\"ls -a\"}}'",
            string.Empty,
            string.Empty,
            HookMatcher.Any,
            HookDefinition.DefaultTimeoutMs,
            HookFailureMode.Open,
            true,
            string.Empty,
            string.Empty
        ));

        var result = await new HookDispatcher(service).DispatchAsync(
            HookEventInput.ForEvent(HookEventCatalog.ToolPre) with { ToolName = "Bash" },
            CancellationToken.None
        );

        // 훅이 돌려준 updatedInput 은 실행 결과에 그대로 남는다. 값을 잃지 않는다.
        var run = Assert.Single(result.Runs);
        Assert.Contains("ls -a", run.UpdatedInputJson);

        // 다만 지금은 어떤 이벤트도 재작성을 허용하지 않으므로 합성 결과에는 반영되지 않는다.
        // 실제로 적용하는 게이트가 생기면(EXT-08) 이 검사를 함께 바꾼다.
        Assert.False(HookEventCatalog.Find(HookEventCatalog.ToolPre)!.CanRewriteInput);
        Assert.False(result.HasUpdatedInput);
    }

    private static HookDefinition BuiltinHook(string id, string builtinId, string argument)
    {
        return new HookDefinition(
            id,
            HookEventCatalog.CodingFilePre,
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

    private void WritePlugin(string folder, string manifest)
    {
        var directory = Path.Combine(PluginRoot, folder);
        Directory.CreateDirectory(directory);
        File.WriteAllText(
            Path.Combine(directory, PluginManifestParser.ManifestFileName),
            manifest,
            Encoding.UTF8
        );
    }
}
