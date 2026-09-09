using System.Text;
using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class PluginManifestParserTests
{
    [Fact]
    public void ValidManifestQualifiesContributedIds()
    {
        var manifest = PluginManifestParser.Parse(
            """
            {
              "id": "safety",
              "name": "안전 기본",
              "version": "1.2.0",
              "license": "MIT",
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
                { "id": "style", "title": "스타일", "body": "짧게 쓴다" }
              ]
            }
            """,
            "/plugins/safety"
        );

        Assert.True(manifest.IsValid);
        Assert.Equal("안전 기본", manifest.Name);
        Assert.Equal("MIT", manifest.License);
        var hook = Assert.Single(manifest.Hooks);
        Assert.Equal("safety:no-env", hook.Id);
        Assert.Equal("safety", hook.Source);
        var rule = Assert.Single(manifest.Rules);
        Assert.Equal("safety:style", rule.Id);
        Assert.Equal("safety", rule.Source);
    }

    [Fact]
    public void MissingIdAndVersionAreReported()
    {
        var manifest = PluginManifestParser.Parse("{\"name\":\"x\"}", "/plugins/x");
        Assert.False(manifest.IsValid);
        Assert.Contains(manifest.Errors, error => error.Contains("id"));
        Assert.Contains(manifest.Errors, error => error.Contains("version"));
    }

    [Fact]
    public void UnknownEventIsRejectedNotSilentlyAccepted()
    {
        var manifest = PluginManifestParser.Parse(
            "{\"id\":\"p\",\"version\":\"1\",\"hooks\":[{\"id\":\"h\",\"event\":\"nope\"}]}",
            "/plugins/p"
        );
        Assert.Empty(manifest.Hooks);
        Assert.Contains(manifest.Errors, error => error.Contains("nope"));
    }

    [Fact]
    public void BrokenJsonIsReported()
    {
        var manifest = PluginManifestParser.Parse("{", "/plugins/p");
        Assert.False(manifest.IsValid);
        Assert.Contains(manifest.Errors, error => error.Contains("JSON"));
    }

    [Fact]
    public void InvalidIdCharactersAreRejected()
    {
        Assert.False(PluginManifestParser.IsValidId("has space"));
        Assert.False(PluginManifestParser.IsValidId("../escape"));
        Assert.True(PluginManifestParser.IsValidId("safety-basics.v1_0"));
    }
}

public sealed class PluginScannerTests : IDisposable
{
    private readonly string _root = Path.Combine(
        Path.GetTempPath(),
        $"omnux-plugin-scan-{Guid.NewGuid():N}"
    );

    public PluginScannerTests()
    {
        Directory.CreateDirectory(_root);
    }

    public void Dispose()
    {
        try { Directory.Delete(_root, recursive: true); } catch { }
    }

    [Fact]
    public void MissingRootIsListedButNotAnError()
    {
        var missing = Path.Combine(_root, "not-there");
        var result = new PluginScanner(new[] { missing }).Scan(Array.Empty<string>());
        Assert.Empty(result.Entries);
        Assert.Empty(result.Errors);
        Assert.Contains(Path.GetFullPath(missing), result.ScannedRoots);
    }

    [Fact]
    public void ValidAndBrokenPluginsAreBothListed()
    {
        WritePlugin("good", "{\"id\":\"good\",\"version\":\"1\",\"rules\":[{\"id\":\"r\",\"body\":\"본문\"}]}");
        WritePlugin("bad", "{\"id\":\"bad\"}");

        var result = new PluginScanner(new[] { _root }).Scan(Array.Empty<string>());
        Assert.Equal(2, result.Entries.Count);

        var good = result.Entries.Single(entry => entry.Manifest.Id == "good");
        Assert.True(good.Enabled);
        Assert.True(good.Manifest.IsValid);

        var bad = result.Entries.Single(entry => entry.Manifest.Id == "bad");
        Assert.False(bad.Enabled);
        Assert.False(bad.Manifest.IsValid);
        Assert.NotEmpty(result.Errors);
    }

    [Fact]
    public void DisabledPluginContributesNothing()
    {
        WritePlugin(
            "safety",
            "{\"id\":\"safety\",\"version\":\"1\",\"hooks\":[{\"id\":\"h\",\"event\":\"tool.pre\","
            + "\"handler\":\"builtin\",\"builtinId\":\"require-approval\"}]}"
        );

        var enabled = new PluginScanner(new[] { _root }).Scan(Array.Empty<string>());
        Assert.Single(PluginScanner.CollectHooks(enabled.Entries));

        var disabled = new PluginScanner(new[] { _root }).Scan(new[] { "safety" });
        Assert.Empty(PluginScanner.CollectHooks(disabled.Entries));
        Assert.False(disabled.Entries[0].Enabled);
    }

    [Fact]
    public void DuplicateIdKeepsFirstAndReportsSecond()
    {
        WritePlugin("a-first", "{\"id\":\"dup\",\"version\":\"1\"}");
        WritePlugin("b-second", "{\"id\":\"dup\",\"version\":\"2\"}");

        var result = new PluginScanner(new[] { _root }).Scan(Array.Empty<string>());
        var entry = Assert.Single(result.Entries);
        Assert.Equal("1", entry.Manifest.Version);
        Assert.Contains(result.Errors, error => error.Contains("중복"));
    }

    [Fact]
    public void FolderWithoutManifestIsIgnored()
    {
        Directory.CreateDirectory(Path.Combine(_root, "empty"));
        var result = new PluginScanner(new[] { _root }).Scan(Array.Empty<string>());
        Assert.Empty(result.Entries);
        Assert.Empty(result.Errors);
    }

    private void WritePlugin(string folder, string manifest)
    {
        var directory = Path.Combine(_root, folder);
        Directory.CreateDirectory(directory);
        File.WriteAllText(
            Path.Combine(directory, PluginManifestParser.ManifestFileName),
            manifest,
            Encoding.UTF8
        );
    }
}
