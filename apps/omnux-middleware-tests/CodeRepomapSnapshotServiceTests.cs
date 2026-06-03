using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class CodeRepomapSnapshotServiceTests
{
    [Fact]
    public void GetSnapshotMapsCodeDeclarations()
    {
        var root = Path.Combine(Path.GetTempPath(), $"omnux-repomap-test-{Guid.NewGuid():N}");
        var appDir = Path.Combine(root, "apps", "demo");
        var scriptDir = Path.Combine(root, "scripts");
        Directory.CreateDirectory(appDir);
        Directory.CreateDirectory(scriptDir);
        File.WriteAllText(Path.Combine(appDir, "Sample.cs"), """
namespace Demo;

public sealed class Sample
{
    public Sample()
    {
    }

    public void First()
    {
    }
}
""");
        File.WriteAllText(Path.Combine(scriptDir, "tool.py"), """
class Runner:
    def run(self):
        pass

def main():
    pass
""");

        try
        {
            var snapshot = new CodeRepomapSnapshotService(
                    root,
                    () => DateTimeOffset.Parse("2026-06-04T00:00:00Z")
                )
                .GetSnapshot(limit: 10);

            Assert.Equal("ok", snapshot.Status);
            Assert.Equal(DateTimeOffset.Parse("2026-06-04T00:00:00Z"), snapshot.ScannedAtUtc);
            Assert.Equal(2, snapshot.MappedFileCount);
            Assert.False(snapshot.Truncated);
            Assert.Contains(snapshot.Files, file =>
                file.Path == "apps/demo/Sample.cs"
                && file.Symbols.Any(symbol => symbol.Name == "Sample" && symbol.Kind == "class")
                && file.Symbols.Any(symbol => symbol.Name == "First" && symbol.Kind == "method"));
            Assert.Contains(snapshot.Files, file =>
                file.Path == "scripts/tool.py"
                && file.Symbols.Any(symbol => symbol.Name == "Runner" && symbol.Kind == "class")
                && file.Symbols.Any(symbol => symbol.Name == "main" && symbol.Kind == "def"));
        }
        finally
        {
            TryDeleteDirectory(root);
        }
    }

    [Fact]
    public void GetSnapshotIgnoresExcludedDirectories()
    {
        var root = Path.Combine(Path.GetTempPath(), $"omnux-repomap-test-{Guid.NewGuid():N}");
        var excludedDir = Path.Combine(root, "apps", "demo", "node_modules", "pkg");
        Directory.CreateDirectory(excludedDir);
        File.WriteAllText(Path.Combine(excludedDir, "ignored.ts"), """
export function ignored() {
}
""");

        try
        {
            var snapshot = new CodeRepomapSnapshotService(root).GetSnapshot(limit: 10);

            Assert.Equal("empty", snapshot.Status);
            Assert.Empty(snapshot.Files);
        }
        finally
        {
            TryDeleteDirectory(root);
        }
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
