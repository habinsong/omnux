using System.Text;
using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

/// <summary>실제 파일로 손상·미래 버전·저장 실패 계약을 확인한다.</summary>
public sealed class ExtensionConfigStoreTests : IDisposable
{
    private readonly string _dir = Path.Combine(
        Path.GetTempPath(),
        $"omnux-extensions-store-{Guid.NewGuid():N}"
    );

    private string ConfigPath => Path.Combine(_dir, "extensions.json");

    public ExtensionConfigStoreTests()
    {
        Directory.CreateDirectory(_dir);
    }

    public void Dispose()
    {
        try { Directory.Delete(_dir, recursive: true); } catch { }
    }

    [Fact]
    public void MissingFileReadsAsEmptyWithoutCreatingIt()
    {
        var store = new ExtensionConfigStore(ConfigPath);
        var snapshot = store.Read();
        Assert.False(snapshot.Exists);
        Assert.Empty(snapshot.Hooks);
        Assert.False(File.Exists(ConfigPath));
    }

    [Fact]
    public void SaveThenReadKeepsEveryField()
    {
        var store = new ExtensionConfigStore(ConfigPath);
        var hook = new HookDefinition(
            "block-env",
            HookEventCatalog.CodingFilePre,
            HookHandlerKind.Builtin,
            string.Empty,
            BuiltinHookHandlers.DenyPath,
            "**/.env",
            new HookMatcher("Write|Edit", "**/*.env"),
            4321,
            HookFailureMode.Closed,
            true,
            string.Empty,
            "비밀 파일 보호"
        );

        var result = store.Save(ExtensionConfigSnapshot.Empty with { Hooks = new[] { hook } });
        Assert.True(result.Saved);
        Assert.Equal(string.Empty, result.Error);

        var reloaded = new ExtensionConfigStore(ConfigPath).Read();
        var stored = Assert.Single(reloaded.Hooks);
        Assert.Equal("block-env", stored.Id);
        Assert.Equal(HookEventCatalog.CodingFilePre, stored.Event);
        Assert.Equal(HookHandlerKind.Builtin, stored.Handler);
        Assert.Equal(BuiltinHookHandlers.DenyPath, stored.BuiltinId);
        Assert.Equal("**/.env", stored.BuiltinArgument);
        Assert.Equal("Write|Edit", stored.Matcher.ToolPattern);
        Assert.Equal("**/*.env", stored.Matcher.PathGlob);
        Assert.Equal(4321, stored.TimeoutMs);
        Assert.Equal(HookFailureMode.Closed, stored.FailureMode);
        Assert.Equal("비밀 파일 보호", stored.Description);
    }

    [Fact]
    public void RuleBodyWithControlCharactersSurvivesRoundTrip()
    {
        var store = new ExtensionConfigStore(ConfigPath);
        var body = "탭\t포함\n두 번째 줄 \"인용\"";
        var rule = new ExtensionRule("r1", "제목", body, ExtensionRule.ScopeGlobal, string.Empty, 10, true, string.Empty);

        Assert.True(store.Save(ExtensionConfigSnapshot.Empty with { Rules = new[] { rule } }).Saved);
        var stored = Assert.Single(new ExtensionConfigStore(ConfigPath).Read().Rules);
        Assert.Equal(body, stored.Body);
    }

    [Fact]
    public void DamagedConfigIsReportedAndNotOverwritten()
    {
        File.WriteAllText(ConfigPath, "{ this is not json", Encoding.UTF8);
        var originalHash = File.ReadAllText(ConfigPath);

        var store = new ExtensionConfigStore(ConfigPath);
        var snapshot = store.Read();
        Assert.True(snapshot.Exists);
        Assert.NotEqual(string.Empty, snapshot.LoadError);

        var result = store.Save(ExtensionConfigSnapshot.Empty);
        Assert.False(result.Saved);
        Assert.Contains("읽지 못해", result.Error);
        // AUT-02 회귀: 손상 문서를 빈 설정으로 덮어쓰지 않는다.
        Assert.Equal(originalHash, File.ReadAllText(ConfigPath));
    }

    [Fact]
    public void FutureVersionIsRejectedAndPreserved()
    {
        var payload = "{\"version\":999,\"hooks\":[]}";
        File.WriteAllText(ConfigPath, payload, Encoding.UTF8);

        var store = new ExtensionConfigStore(ConfigPath);
        var snapshot = store.Read();
        Assert.Equal(999, snapshot.Version);
        Assert.Contains("지원하지 않는", snapshot.LoadError);

        var result = store.Save(ExtensionConfigSnapshot.Empty);
        Assert.False(result.Saved);
        Assert.Equal(payload, File.ReadAllText(ConfigPath));
    }

    [Fact]
    public void ExplicitRecoveryCanOverwriteDamagedConfig()
    {
        File.WriteAllText(ConfigPath, "{ broken", Encoding.UTF8);
        var store = new ExtensionConfigStore(ConfigPath);

        var result = store.Save(ExtensionConfigSnapshot.Empty, allowOverwriteDamaged: true);
        Assert.True(result.Saved);
        Assert.Equal(string.Empty, store.Read().LoadError);
    }

    [Fact]
    public void SaveFailureIsReportedNotSwallowed()
    {
        // 파일 자리에 디렉터리를 두어 실제 쓰기 실패를 만든다.
        Directory.CreateDirectory(ConfigPath);
        var store = new ExtensionConfigStore(ConfigPath);

        var result = store.Save(ExtensionConfigSnapshot.Empty);
        Assert.False(result.Saved);
        Assert.NotEqual(string.Empty, result.Error);
    }

    [Fact]
    public void UnknownHookEntriesAreDroppedButValidOnesRemain()
    {
        File.WriteAllText(
            ConfigPath,
            "{\"version\":1,\"hooks\":[{\"id\":\"\",\"event\":\"tool.pre\"},"
            + "{\"id\":\"ok\",\"event\":\"tool.pre\",\"handler\":\"command\",\"command\":\"true\"}]}",
            Encoding.UTF8
        );

        var snapshot = new ExtensionConfigStore(ConfigPath).Read();
        var hook = Assert.Single(snapshot.Hooks);
        Assert.Equal("ok", hook.Id);
        Assert.Equal(HookHandlerKind.Command, hook.Handler);
    }
}
