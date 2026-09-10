using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

/// <summary>
/// 픽스처 프롬프트 → 계획 파싱 → 플러그인 훅/규칙 → 실행. 네트워크와 실제 LLM 은 쓰지 않는다.
/// </summary>
public sealed class CodingHarnessFixtureLoopTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), $"omnux-harness-{Guid.NewGuid():N}");
    private string PluginRoot => Path.Combine(_dir, "plugins");
    private string Workspace => Path.Combine(_dir, "workspace");
    private string ConfigPath => Path.Combine(_dir, "extensions.json");

    public CodingHarnessFixtureLoopTests()
    {
        Directory.CreateDirectory(PluginRoot);
        Directory.CreateDirectory(Workspace);
    }

    public void Dispose()
    {
        try { Directory.Delete(_dir, recursive: true); } catch { }
    }

    [Fact]
    public async Task FixturePromptPlanIsDrivenThroughPluginHookAndRulesWithoutNetwork()
    {
        const string userPrompt = "Create a program in main.py that prints 'hello'. Do not touch .env.";
        WritePlugin(
            "safety",
            """
            {
              "id": "safety",
              "name": "안전",
              "version": "1.0.0",
              "hooks": [
                {
                  "id": "no-env",
                  "event": "coding.file.pre",
                  "handler": "builtin",
                  "builtinId": "deny-path",
                  "builtinArgument": "**/.env"
                }
              ],
              "rules": [
                {
                  "id": "verify",
                  "title": "완료 판정",
                  "body": "실행하거나 검증한 결과만 완료로 보고한다."
                }
              ]
            }
            """
        );

        var scan = new PluginScanner(new[] { PluginRoot }).Scan(Array.Empty<string>());
        var hooks = PluginScanner.CollectHooks(scan.Entries);
        var rules = PluginScanner.CollectRules(scan.Entries);
        Assert.Contains(hooks, hook => hook.Id == "safety:no-env");
        Assert.Contains(rules, rule => rule.Id == "safety:verify");

        var injected = RuleInjectionPolicy.BuildBody(
            null,
            ExtensionRuleResolver.Resolve(rules, ExtensionRule.ScopeGlobal, null)
        );
        Assert.Contains("실행하거나 검증한 결과만 완료로 보고한다.", injected);

        var plan = CodingLoopPromptInterpreter.Interpret(userPrompt, "python", loopPrompt =>
        {
            Assert.Contains("[목표]", loopPrompt);
            Assert.Contains(userPrompt, loopPrompt);
            var paths = CodingFallbackPolicy.ExtractRequestedCodingPaths(userPrompt, "python");
            var path = Assert.Single(paths);
            Assert.Equal("main.py", path);
            var expected = CodingFallbackPolicy.ExtractExpectedConsoleOutput(userPrompt);
            var printed = string.IsNullOrWhiteSpace(expected) ? "hello" : expected;
            return "{\"analysis\":\"write the requested file\",\"done\":false,\"final_message\":\"\",\"actions\":["
                + "{\"type\":\"write_file\",\"path\":\"" + path + "\",\"content\":\"print('" + printed + "')\"}]}";
        });
        Assert.Equal("main.py", Assert.Single(plan.Actions).Path);

        var store = new ExtensionConfigStore(ConfigPath);
        var saved = store.Save(ExtensionConfigSnapshot.Empty with { Hooks = hooks });
        Assert.True(saved.Saved, saved.Error);
        var gate = new ExtensionCodingHookGate(
            new HookDispatcher(new ExtensionApplicationService(store, () => Workspace, () => PluginRoot))
        );

        var blocked = await ExecuteAsync(new CodingLoopAction("write_file", ".env", "SECRET=1", ""), gate);
        Assert.False(blocked.Changed);
        Assert.False(File.Exists(Path.Combine(Workspace, ".env")));
        Assert.Contains("blocked_by_hook", blocked.Message);

        var written = await ExecuteAsync(plan.Actions[0], gate);
        Assert.True(written.Changed);
        var created = await File.ReadAllTextAsync(Path.Combine(Workspace, "main.py"));
        Assert.StartsWith("print(", created);
    }

    private Task<CodingLoopActionResult> ExecuteAsync(CodingLoopAction action, ICodingHookGate gate)
    {
        return CodingLoopActionExecutor.ExecuteAsync(
            action,
            Workspace,
            Array.Empty<string>(),
            "test",
            (_, path, _, _, _) => path,
            (root, relative) => Path.Combine(root, relative),
            (_, _, content) => content,
            (_, _, _) => Task.FromResult(new CodingLoopShellResult(0, string.Empty, string.Empty, false)),
            gate,
            CancellationToken.None
        );
    }

    private void WritePlugin(string folder, string json)
    {
        var directory = Path.Combine(PluginRoot, folder);
        Directory.CreateDirectory(directory);
        File.WriteAllText(Path.Combine(directory, "omnux-plugin.json"), json);
    }
}
