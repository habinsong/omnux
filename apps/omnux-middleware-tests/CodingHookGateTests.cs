using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

/// <summary>
/// 훅이 실제 코딩 액션 실행을 막는지 확인한다. 판정 문자열이 아니라
/// 디스크의 파일 상태와 실행된 명령으로 검증한다.
/// </summary>
public sealed class CodingHookGateTests : IDisposable
{
    private readonly string _dir = Path.Combine(
        Path.GetTempPath(),
        $"omnux-coding-hook-gate-{Guid.NewGuid():N}"
    );

    private string ConfigPath => Path.Combine(_dir, "extensions.json");
    private string PluginRoot => Path.Combine(_dir, "plugins");
    private string Workspace => Path.Combine(_dir, "workspace");

    public CodingHookGateTests()
    {
        Directory.CreateDirectory(_dir);
        Directory.CreateDirectory(PluginRoot);
        Directory.CreateDirectory(Workspace);
    }

    public void Dispose()
    {
        try { Directory.Delete(_dir, recursive: true); } catch { }
    }

    [Fact]
    public async Task WriteIsBlockedWhenHookDeniesAndFileIsNotCreated()
    {
        var gate = GateWith(BuiltinHook("no-env", HookEventCatalog.CodingFilePre, BuiltinHookHandlers.DenyPath, "**/.env"));

        var result = await ExecuteAsync(
            new CodingLoopAction("write_file", ".env", "SECRET=1", ""),
            gate
        );

        Assert.False(result.Changed);
        Assert.Contains("write_file_blocked_by_hook", result.Message);
        Assert.Contains("no-env", result.Message);
        Assert.False(File.Exists(Path.Combine(Workspace, ".env")));
    }

    [Fact]
    public async Task UnrelatedPathIsStillWritten()
    {
        var gate = GateWith(BuiltinHook("no-env", HookEventCatalog.CodingFilePre, BuiltinHookHandlers.DenyPath, "**/.env"));

        var result = await ExecuteAsync(
            new CodingLoopAction("write_file", "main.ts", "export const a = 1;", ""),
            gate
        );

        Assert.True(result.Changed);
        Assert.Equal("export const a = 1;", await File.ReadAllTextAsync(Path.Combine(Workspace, "main.ts")));
    }

    [Fact]
    public async Task DeleteIsBlockedAndOriginalFileSurvives()
    {
        var target = Path.Combine(Workspace, "keep.txt");
        await File.WriteAllTextAsync(target, "원본");
        var gate = GateWith(BuiltinHook("protect", HookEventCatalog.CodingFilePre, BuiltinHookHandlers.DenyPath, "**/keep.txt"));

        var result = await ExecuteAsync(new CodingLoopAction("delete_file", "keep.txt", "", ""), gate);

        Assert.False(result.Changed);
        Assert.Contains("delete_file_blocked_by_hook", result.Message);
        Assert.Equal("원본", await File.ReadAllTextAsync(target));
    }

    [Fact]
    public async Task EditIsBlockedAndContentIsUnchanged()
    {
        var target = Path.Combine(Workspace, "app.ts");
        await File.WriteAllTextAsync(target, "const value = 1;");
        var gate = GateWith(BuiltinHook("freeze", HookEventCatalog.CodingFilePre, BuiltinHookHandlers.DenyPath, "**/*.ts"));

        var result = await ExecuteAsync(
            new CodingLoopAction("edit_file", "app.ts", "", "", "const value = 1;", "const value = 2;"),
            gate
        );

        Assert.False(result.Changed);
        Assert.Equal("const value = 1;", await File.ReadAllTextAsync(target));
    }

    [Fact]
    public async Task CommandIsBlockedAndRunnerIsNeverCalled()
    {
        // 기존 CodingExecutionSafetyPolicy 가 이미 막는 명령(rm -rf 등)이 아니라
        // 사용자 훅만 막는 명령을 써야 훅 경로를 실제로 확인할 수 있다.
        var gate = GateWith(
            BuiltinHook("no-publish", HookEventCatalog.CodingCommandPre, BuiltinHookHandlers.DenyCommand, "*npm publish*")
        );

        var invoked = 0;
        var result = await ExecuteAsync(
            new CodingLoopAction("run", "", "", "npm publish --access public"),
            gate,
            (_, _, _) =>
            {
                invoked++;
                return Task.FromResult(new CodingLoopShellResult(0, string.Empty, string.Empty, false));
            }
        );

        Assert.Contains("run_blocked_by_hook", result.Message);
        Assert.Null(result.Execution);
        Assert.Equal(0, invoked);
    }

    [Fact]
    public async Task AllowedCommandStillRuns()
    {
        var gate = GateWith(
            BuiltinHook("no-publish", HookEventCatalog.CodingCommandPre, BuiltinHookHandlers.DenyCommand, "*npm publish*")
        );

        var invoked = 0;
        var result = await ExecuteAsync(
            new CodingLoopAction("run", "", "", "npm test"),
            gate,
            (_, _, _) =>
            {
                invoked++;
                return Task.FromResult(new CodingLoopShellResult(0, "ok", string.Empty, false));
            }
        );

        Assert.Equal(1, invoked);
        Assert.NotNull(result.Execution);
        Assert.Equal("ok", result.Execution!.Status);
        Assert.Equal("npm test", result.Execution.Command);
    }

    [Fact]
    public async Task ApprovalRequestBlocksBecauseNoConfirmationPathExists()
    {
        var gate = GateWith(
            BuiltinHook("confirm", HookEventCatalog.CodingCommandPre, BuiltinHookHandlers.AskCommand, "*deploy*")
        );

        var invoked = 0;
        var result = await ExecuteAsync(
            new CodingLoopAction("run", "", "", "npm run deploy"),
            gate,
            (_, _, _) =>
            {
                invoked++;
                return Task.FromResult(new CodingLoopShellResult(0, string.Empty, string.Empty, false));
            }
        );

        Assert.Contains("run_blocked_by_hook", result.Message);
        Assert.Contains("승인", result.Message);
        Assert.Equal(0, invoked);
    }

    [Fact]
    public async Task PostWriteHookRunsAfterTheFileExists()
    {
        if (OperatingSystem.IsWindows())
        {
            return;
        }

        var marker = Path.Combine(_dir, "post-hook-saw.txt");
        var gate = GateWith(new HookDefinition(
            "record",
            HookEventCatalog.CodingFilePost,
            HookHandlerKind.Command,
            $"wc -c < '{Path.Combine(Workspace, "main.ts")}' > '{marker}'",
            string.Empty,
            string.Empty,
            HookMatcher.Any,
            HookDefinition.DefaultTimeoutMs,
            HookFailureMode.Open,
            true,
            string.Empty,
            string.Empty
        ));

        var result = await ExecuteAsync(
            new CodingLoopAction("write_file", "main.ts", "abcd", ""),
            gate
        );

        Assert.True(result.Changed);
        Assert.True(File.Exists(marker));
        // 훅이 실행될 때 파일이 이미 4바이트로 존재했다.
        Assert.Equal("4", (await File.ReadAllTextAsync(marker)).Trim());
    }

    [Fact]
    public async Task NoHooksMeansUnchangedBehaviour()
    {
        var gate = GateWith();
        var result = await ExecuteAsync(
            new CodingLoopAction("write_file", "main.ts", "hello", ""),
            gate
        );

        Assert.True(result.Changed);
        Assert.StartsWith("write:", result.Message);
    }

    [Fact]
    public async Task DisabledHookDoesNotBlock()
    {
        var gate = GateWith(
            BuiltinHook("no-env", HookEventCatalog.CodingFilePre, BuiltinHookHandlers.DenyPath, "**/.env")
                with { Enabled = false }
        );

        var result = await ExecuteAsync(
            new CodingLoopAction("write_file", ".env", "SECRET=1", ""),
            gate
        );

        Assert.True(result.Changed);
        Assert.True(File.Exists(Path.Combine(Workspace, ".env")));
    }

    private ExtensionCodingHookGate GateWith(params HookDefinition[] hooks)
    {
        var store = new ExtensionConfigStore(ConfigPath);
        var saved = store.Save(ExtensionConfigSnapshot.Empty with { Hooks = hooks });
        Assert.True(saved.Saved, saved.Error);

        var service = new ExtensionApplicationService(store, () => Workspace, () => PluginRoot);
        return new ExtensionCodingHookGate(new HookDispatcher(service));
    }

    private Task<CodingLoopActionResult> ExecuteAsync(
        CodingLoopAction action,
        ICodingHookGate gate,
        Func<string, string, CancellationToken, Task<CodingLoopShellResult>>? runner = null
    )
    {
        return CodingLoopActionExecutor.ExecuteAsync(
            action,
            Workspace,
            Array.Empty<string>(),
            "test",
            (_, path, _, _, _) => path,
            (root, relative) => Path.Combine(root, relative),
            (_, _, content) => content,
            runner ?? ((_, _, _) => Task.FromResult(new CodingLoopShellResult(0, string.Empty, string.Empty, false))),
            gate,
            CancellationToken.None
        );
    }

    private static HookDefinition BuiltinHook(string id, string eventId, string builtinId, string argument)
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

/// <summary>계획 차단 결과가 성공처럼 보이지 않는지 확인한다.</summary>
public sealed class CodingHookBlockedOutcomeTests
{
    [Fact]
    public void BlockedOutcomeNeverLooksSuccessful()
    {
        var outcome = CodingApplicationService.BuildHookBlockedCodingOutcome(
            "typescript",
            "const a = 1;",
            "raw",
            "/tmp/ws",
            Array.Empty<string>(),
            null,
            "refs 2",
            "guard: 계획이 금지 경로를 건드린다"
        );

        Assert.Equal("blocked", outcome.Execution.Status);
        Assert.Equal(-1, outcome.Execution.ExitCode);
        Assert.Contains("계획이 금지 경로를 건드린다", outcome.Execution.StdErr);
        Assert.Contains("막아", outcome.Summary);
        Assert.Empty(outcome.ChangedFiles);
        Assert.Equal("refs 2", outcome.RetrievalLabel);
    }

    [Fact]
    public void AlreadyChangedFilesAreReportedNotHidden()
    {
        var outcome = CodingApplicationService.BuildHookBlockedCodingOutcome(
            "typescript",
            string.Empty,
            string.Empty,
            "/tmp/ws",
            new[] { "b.ts", "a.ts", "a.ts", "  " },
            null,
            string.Empty,
            "guard: 중단"
        );

        Assert.Equal(new[] { "a.ts", "b.ts" }, outcome.ChangedFiles.ToArray());
        Assert.Contains("2개", outcome.Summary);
        Assert.Equal("blocked", outcome.Execution.Status);
    }

    [Fact]
    public void ReasonAlwaysCarriesTheDecidingHookId()
    {
        var withHook = CodingApplicationService.FormatCodingHookBlockReason(
            new HookGateDecision(false, "금지", "guard")
        );
        Assert.Equal("guard: 금지", withHook);

        var withoutReason = CodingApplicationService.FormatCodingHookBlockReason(
            new HookGateDecision(false, "   ", "guard")
        );
        Assert.Equal("guard: 훅이 차단했다", withoutReason);

        var anonymous = CodingApplicationService.FormatCodingHookBlockReason(
            new HookGateDecision(false, "금지", string.Empty)
        );
        Assert.Equal("금지", anonymous);
    }
}
