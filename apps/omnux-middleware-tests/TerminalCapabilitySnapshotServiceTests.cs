using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class TerminalCapabilitySnapshotServiceTests
{
    [Fact]
    public void GetSnapshotReportsResolvableShellAndToolchains()
    {
        var root = Path.Combine(Path.GetTempPath(), $"omnux-terminal-test-{Guid.NewGuid():N}");
        var bin = Path.Combine(root, "bin");
        Directory.CreateDirectory(bin);
        var shellPath = Path.Combine(bin, "bash");
        var gitPath = Path.Combine(bin, "git");
        File.WriteAllText(shellPath, string.Empty);
        File.WriteAllText(gitPath, string.Empty);

        try
        {
            var snapshot = new TerminalCapabilitySnapshotService(
                    EnvMap(
                        ("SHELL", shellPath),
                        ("PATH", bin)
                    ),
                    File.Exists,
                    () => DateTimeOffset.Parse("2026-06-04T00:00:00Z"),
                    isWindows: false
                )
                .GetSnapshot();

            Assert.Equal("snapshot_only", snapshot.Status);
            Assert.False(snapshot.PtySessionEnabled);
            Assert.Equal(DateTimeOffset.Parse("2026-06-04T00:00:00Z"), snapshot.ScannedAtUtc);
            Assert.Contains(snapshot.Shells, item =>
                item.Name == "current-shell" && item.Status == "available" && item.ResolvedPath == shellPath);
            Assert.Contains(snapshot.Toolchains, item =>
                item.Name == "git" && item.Status == "available" && item.ResolvedPath == gitPath);
            Assert.Contains(snapshot.Checks, check =>
                check.Name == "pty_session" && check.Status == "skipped");
            Assert.Contains(snapshot.Checks, check =>
                check.Name == "safety_policy" && check.Status == "ok");
        }
        finally
        {
            TryDeleteDirectory(root);
        }
    }

    [Fact]
    public void GetSnapshotBlocksWhenNoShellIsResolvable()
    {
        var snapshot = new TerminalCapabilitySnapshotService(
                EnvMap(
                    ("SHELL", "/missing/shell"),
                    ("PATH", string.Empty)
                ),
                _ => false,
                () => DateTimeOffset.Parse("2026-06-04T00:00:00Z"),
                isWindows: false
            )
            .GetSnapshot();

        Assert.Equal("blocked", snapshot.Status);
        Assert.False(snapshot.PtySessionEnabled);
        Assert.Contains(snapshot.Checks, check =>
            check.Name == "shell" && check.Status == "failed");
    }

    private static Func<string, string?> EnvMap(params (string Key, string Value)[] values)
    {
        var map = values.ToDictionary(item => item.Key, item => item.Value, StringComparer.Ordinal);
        return key => map.TryGetValue(key, out var value) ? value : null;
    }

    private static void TryDeleteDirectory(string path)
    {
        try
        {
            if (Directory.Exists(path))
            {
                Directory.Delete(path, recursive: true);
            }
        }
        catch
        {
        }
    }
}
