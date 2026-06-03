using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class LogicRunRecoveryScannerTests
{
    [Fact]
    public void ListReturnsOnlyNonTerminalSnapshots()
    {
        using var temp = TestStateDirectory.Create();
        WriteSnapshot(temp.Path, BuildSnapshot("graph-a", "run-active", "running"));
        WriteSnapshot(temp.Path, BuildSnapshot("graph-a", "run-done", "completed"));

        var result = LogicRunRecoveryScanner.List(temp.Path);

        Assert.Equal(1, result.Total);
        var item = Assert.Single(result.Items);
        Assert.Equal("run-active", item.RunId);
        Assert.Equal("graph-a", item.GraphId);
        Assert.Equal("running", item.Status);
        Assert.Equal(1, item.CompletedNodeCount);
        Assert.Equal(1, item.PendingNodeCount);
        Assert.Contains("node_started", item.LastEvent);
    }

    private static void WriteSnapshot(string root, LogicRunSnapshot snapshot)
    {
        var dir = Path.Combine(root, snapshot.GraphId, snapshot.RunId);
        Directory.CreateDirectory(dir);
        File.WriteAllText(Path.Combine(dir, "snapshot.json"), LogicGraphJson.Serialize(snapshot));
    }

    private static LogicRunSnapshot BuildSnapshot(string graphId, string runId, string status)
    {
        return new LogicRunSnapshot(
            runId,
            graphId,
            "Demo Flow",
            status,
            "test",
            "2026-06-04T00:00:00Z",
            status == "running" ? "2026-06-04T00:00:02Z" : "2026-06-04T00:00:03Z",
            status == "running" ? string.Empty : "2026-06-04T00:00:03Z",
            string.Empty,
            string.Empty,
            new[] { "[2026-06-04T00:00:02Z] node_started n2 Step 2" },
            new[]
            {
                new LogicNodeRunState("n1", "start", "Start", "completed", null, "2026-06-04T00:00:00Z", "2026-06-04T00:00:01Z", null),
                new LogicNodeRunState("n2", "chat_single", "Step 2", "running", null, "2026-06-04T00:00:02Z", string.Empty, null)
            }
        );
    }

    private sealed class TestStateDirectory : IDisposable
    {
        private TestStateDirectory(string path)
        {
            Path = path;
        }

        public string Path { get; }

        public static TestStateDirectory Create()
        {
            var path = System.IO.Path.Combine(
                System.IO.Path.GetTempPath(),
                "omnux-logic-recovery-tests",
                Guid.NewGuid().ToString("N")
            );
            Directory.CreateDirectory(path);
            return new TestStateDirectory(path);
        }

        public void Dispose()
        {
            try
            {
                if (Directory.Exists(Path))
                {
                    Directory.Delete(Path, recursive: true);
                }
            }
            catch
            {
                // best effort cleanup
            }
        }
    }
}
