using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class CodingCheckpointTests
{
    [Theory]
    [InlineData("grok", "fixture")]
    [InlineData("auto", null)]
    public void ResumeKeepsPrimarySelectionWhenAnotherWorkerReports(string provider, string? model)
    {
        using var fixture = new Fixture("orchestration");
        using var cancellation = new CancellationTokenSource();
        using (var checkpoint = fixture.Checkpoint(cancellation.Token, provider, model))
        {
            checkpoint.Bind(null)(new CodingProgressUpdate("orchestration", "codex", "review-model", "executing", "", 1, 3, 50, false));
            cancellation.Cancel();
        }
        var stored = fixture.Store.Get(fixture.Thread.Id)!.LatestCodingResult!;
        Assert.Equal(provider, stored.Provider);
        Assert.Equal(model ?? "", stored.Model);
        Assert.Equal("review-model", stored.ResumeModels!["codex"]);
    }

    [Theory]
    [InlineData("single")]
    [InlineData("orchestration")]
    [InlineData("multi")]
    public void CancelledFilesAndRequestSurviveReload(string mode)
    {
        using var fixture = new Fixture(mode);
        using var cancellation = new CancellationTokenSource();
        using (var checkpoint = fixture.Checkpoint(cancellation.Token))
        {
            File.WriteAllText(Path.Combine(fixture.Run, "kept.txt"), "keep");
            var report = checkpoint.Bind(update => Assert.Equal(fixture.Thread.Id, update.ConversationId));
            report(new CodingProgressUpdate(mode, "grok", "selected-model", "executing", "", 1, 3, 50, false));
            var partial = new ConversationStore(fixture.State).Get(fixture.Thread.Id)!.LatestCodingResult!;
            Assert.Equal("incomplete", partial.Execution.Status);
            Assert.Contains(Path.Combine(fixture.Run, "kept.txt"), partial.ChangedFiles);
            cancellation.Cancel();
        }
        var stored = new ConversationStore(fixture.State).Get(fixture.Thread.Id)!.LatestCodingResult!;
        Assert.Equal("cancelled", stored.Execution.Status);
        Assert.Equal(fixture.Run, stored.Execution.RunDirectory);
        Assert.Equal("원래 요청", stored.ResumeInput);
        Assert.Equal("selected-model", stored.ResumeModels!["grok"]);
        Assert.Null(stored.ResumeModels["nvidia"]);
        Assert.Equal("keep", File.ReadAllText(Path.Combine(fixture.Run, "kept.txt")));
    }

    [Fact]
    public void CompletedResultIsNotOverwrittenByLateCancellation()
    {
        using var fixture = new Fixture("single");
        using var cancellation = new CancellationTokenSource();
        using (fixture.Checkpoint(cancellation.Token))
        {
            var partial = fixture.Store.Get(fixture.Thread.Id)!.LatestCodingResult!;
            fixture.Store.SetLatestCodingResult(fixture.Thread.Id, partial with {
                CheckpointId = null, ResumeInput = null, Execution = partial.Execution with {Status = "ok", ExitCode = 0}
            });
            cancellation.Cancel();
        }
        Assert.Equal("ok", fixture.Store.Get(fixture.Thread.Id)!.LatestCodingResult!.Execution.Status);
    }

    [Fact]
    public void EarlierCheckpointCannotOverwriteNewerWorkOrRestoreDeletedHistory()
    {
        using var fixture = new Fixture("single");
        using var cancellation = new CancellationTokenSource();
        var first = fixture.Checkpoint(cancellation.Token);
        using var second = fixture.Checkpoint(CancellationToken.None);
        var current = fixture.Store.Get(fixture.Thread.Id)!.LatestCodingResult!;
        cancellation.Cancel();
        first.Dispose();
        Assert.Equal(current.CheckpointId, fixture.Store.Get(fixture.Thread.Id)!.LatestCodingResult!.CheckpointId);
        Assert.Equal("incomplete", fixture.Store.Get(fixture.Thread.Id)!.LatestCodingResult!.Execution.Status);
        fixture.Store.Delete(fixture.Thread.Id);
        second.Dispose();
        Assert.Null(new ConversationStore(fixture.State).Get(fixture.Thread.Id));
    }

    [Fact]
    public void InventoryExcludesCredentialsDependenciesAndLinks()
    {
        using var fixture = new Fixture("single");
        File.WriteAllText(Path.Combine(fixture.Run,".env"), "dummy test fixture");
        File.WriteAllText(Path.Combine(fixture.Run,"source.py"), "print('ok')");
        var dependencies = Directory.CreateDirectory(Path.Combine(fixture.Run,"node_modules"));
        File.WriteAllText(Path.Combine(dependencies.FullName,"dependency.js"), "fixture");
        if (!OperatingSystem.IsWindows())
        {
            var external = Directory.CreateDirectory(Path.Combine(fixture.Root,"external"));
            File.WriteAllText(Path.Combine(external.FullName,"outside.py"), "fixture");
            Directory.CreateSymbolicLink(Path.Combine(fixture.Run,"linked"), external.FullName);
        }
        using (fixture.Checkpoint(CancellationToken.None)) { }
        Assert.Equal(new[]{Path.Combine(fixture.Run,"source.py")},fixture.Store.Get(fixture.Thread.Id)!.LatestCodingResult!.ChangedFiles);
    }

    [Fact]
    public void RerunResultPersistsWithoutReplacingNewerWorkOrDeletedHistory()
    {
        using var fixture = new Fixture("single");
        using (fixture.Checkpoint(CancellationToken.None)) { }
        var expected = fixture.Store.Get(fixture.Thread.Id)!.LatestCodingResult!;
        var rerun = expected with { Execution = expected.Execution with { Status = "ok", StdOut = "rerun output" } };
        Assert.True(fixture.Store.TryReplaceLatestCodingResult(fixture.Thread.Id, expected, rerun));
        Assert.Equal("rerun output", new ConversationStore(fixture.State).Get(fixture.Thread.Id)!.LatestCodingResult!.Execution.StdOut);
        Assert.False(fixture.Store.TryReplaceLatestCodingResult(fixture.Thread.Id, expected, expected));
        Assert.Same(rerun, fixture.Store.Get(fixture.Thread.Id)!.LatestCodingResult);
        fixture.Store.Delete(fixture.Thread.Id);
        Assert.False(fixture.Store.TryReplaceLatestCodingResult(fixture.Thread.Id, rerun, expected));
        Assert.Null(new ConversationStore(fixture.State).Get(fixture.Thread.Id));
    }

    private sealed class Fixture : IDisposable
    {
        public string Root { get; } = Directory.CreateTempSubdirectory("omnux-checkpoint-").FullName;
        public string State { get; }
        public string Run { get; }
        public ConversationStore Store { get; }
        public ConversationThreadView Thread { get; }
        private readonly string _mode;

        public Fixture(string mode)
        {
            _mode = mode;
            State = Path.Combine(Root,"conversations.json");
            Run = Directory.CreateDirectory(Path.Combine(Root,"run")).FullName;
            Store = new ConversationStore(State);
            Thread = Store.Create("coding",mode,"검증",null,null,null);
        }

        public CodingApplicationService.CodingCheckpoint Checkpoint(CancellationToken token, string provider = "grok", string? model = "fixture") => new(Store,
            new CodingRunRequest("원래 요청","test","coding",_mode,Thread.Id,null,null,null,null,provider,model,"python",null,GrokModel:"fixture"),
            Thread.Id,Run,token);
        public void Dispose() => Directory.Delete(Root,recursive:true);
    }
}
