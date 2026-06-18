using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class UserRuleStoreTests : IDisposable
{
    // AtomicFileStore 가 부모 디렉터리 권한을 조정하므로 시스템 temp 루트가 아닌
    // 자체 하위 디렉터리를 쓴다(macOS /var/folders 루트는 chmod 거부).
    private readonly string _dir = Path.Combine(
        Path.GetTempPath(),
        $"omnux-user-rules-test-{Guid.NewGuid():N}"
    );

    private string _path => Path.Combine(_dir, "user_rules.md");

    public UserRuleStoreTests()
    {
        Directory.CreateDirectory(_dir);
    }

    public void Dispose()
    {
        try { Directory.Delete(_dir, recursive: true); } catch { }
    }

    [Fact]
    public void ReadReturnsEmptyWhenMissing()
    {
        var snapshot = UserRuleStore.Read(_path);
        Assert.False(snapshot.Exists);
        Assert.Equal(string.Empty, snapshot.Text);
    }

    [Fact]
    public void SaveThenReadRoundTrips()
    {
        var saved = UserRuleStore.Save("- 답변은 반말로\n- 불릿 3개 이하", _path);
        Assert.True(saved.Exists);
        Assert.Contains("반말", saved.Text);
        Assert.NotEqual(string.Empty, saved.UpdatedUtc);

        var read = UserRuleStore.Read(_path);
        Assert.Equal(saved.Text, read.Text);
    }

    [Fact]
    public void SaveCapsAtMaxChars()
    {
        var saved = UserRuleStore.Save(new string('가', UserRuleStore.SaveMaxChars + 500), _path);
        Assert.True(saved.Text.Length <= UserRuleStore.SaveMaxChars);
    }

    [Fact]
    public void DeleteRemovesFile()
    {
        UserRuleStore.Save("규칙", _path);
        var deleted = UserRuleStore.Delete(_path);
        Assert.False(deleted.Exists);
        Assert.False(File.Exists(_path));
    }

    [Fact]
    public void ClampForInjectionKeepsShortTextIntact()
    {
        Assert.Equal("짧은 규칙", UserRuleStore.ClampForInjection("짧은 규칙"));
    }

    [Fact]
    public void ClampForInjectionCutsAtLineBoundary()
    {
        var lines = string.Join("\n", Enumerable.Range(1, 60).Select(i => $"- 규칙 {i}: 항목 내용"));
        var clamped = UserRuleStore.ClampForInjection(lines);
        Assert.True(clamped.Length <= UserRuleStore.InjectionMaxChars + 20);
        Assert.EndsWith("…(이하 생략)", clamped);
        Assert.DoesNotContain("규칙 60", clamped);
    }
}
