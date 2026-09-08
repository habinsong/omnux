using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class ConversationIndexScopeTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "omnux-conversation-index-" + Guid.NewGuid().ToString("N"));

    [Fact]
    public void ConversationSyncUpdatesSessionsAndPreservesOtherIndexedSources()
    {
        var paths = Paths();
        Directory.CreateDirectory(Path.Combine(_root, "apps"));
        Directory.CreateDirectory(Path.Combine(_root, "docs"));
        Directory.CreateDirectory(paths.MemoryNotesRootDir);
        var projectFile = Path.Combine(_root, "docs", "guide.md");
        File.WriteAllText(projectFile, "projectkeptword");
        File.WriteAllText(Path.Combine(paths.MemoryNotesRootDir, "note.md"), "memorykeptword");
        var conversations = new ConversationStore(paths.ConversationStatePath);
        var thread = conversations.Create("chat", "single", "대화", null, null, null);
        conversations.AppendMessage(thread.Id, "user", "oldsessionword", "");
        var schema = new MemoryIndexSchemaBootstrap(paths).EnsureInitialized();
        Assert.True(schema.FtsAvailable, schema.FtsError);
        var sync = new MemoryIndexDocumentSync(paths, schema);
        var full = sync.SyncOnce();
        Assert.True(full.ProjectDocuments > 0);
        Assert.Equal(1, full.MemoryDocuments);

        File.Delete(projectFile);
        File.WriteAllText(Path.Combine(paths.MemoryNotesRootDir, "note.md"), "changedmemoryword");
        conversations.AppendMessage(thread.Id, "assistant", "newsessionword", "");
        var partial = sync.SyncConversations();
        Assert.Equal(0, partial.ProjectDocuments);
        Assert.Equal(0, partial.MemoryDocuments);
        Assert.Equal(1, partial.SessionDocuments);
        var search = new MemorySearchTool(paths);
        Assert.Contains(search.Search("projectkeptword", 12, 0).Results, result => result.Source == "project");
        Assert.Contains(search.Search("memorykeptword", 12, 0).Results, result => result.Source == "memory");
        Assert.Contains(search.Search("newsessionword", 12, 0).Results, result => result.Source == "sessions");

        conversations.Delete(thread.Id);
        var deleted = sync.SyncConversations();
        Assert.Equal(1, deleted.RemovedDocuments);
        Assert.Empty(search.Search("newsessionword", 12, 0).Results);
        Assert.NotEmpty(search.Search("projectkeptword", 12, 0).Results);
    }

    private PathOptions Paths()
    {
        var state = Path.Combine(_root, ".state");
        var workspace = Path.Combine(_root, "workspace");
        return new PathOptions(
            Path.Combine(_root, "index.html"), Path.Combine(state, "usage.json"), Path.Combine(state, "copilot.json"),
            Path.Combine(state, "conversations.json"), Path.Combine(state, "auth.json"), Path.Combine(state, "memory-notes"),
            Path.Combine(workspace, "code-runs"), Path.Combine(workspace, "routines"), workspace,
            Path.Combine(state, "routines.json"), Path.Combine(workspace, "prompts"), Path.Combine(state, "audit.log"),
            Path.Combine(state, "retry.json"), Path.Combine(state, "health.json"), Path.Combine(state, "probe.json"),
            Path.Combine(state, "access.json"), Path.Combine(_root, "executor.py"));
    }

    public void Dispose() { if (Directory.Exists(_root)) Directory.Delete(_root, recursive: true); }
}
