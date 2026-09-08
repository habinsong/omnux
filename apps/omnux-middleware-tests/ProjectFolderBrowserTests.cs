using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class ProjectFolderBrowserTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "omnux-project-folders-" + Guid.NewGuid().ToString("N"));
    private string Create(string name) => Directory.CreateDirectory(Path.Combine(_root, name)).FullName;

    [Fact]
    public void BrowseListsFoldersAndFiltersWithoutReadingFiles()
    {
        var workspace = Create("workspace");
        Create("workspace/alpha"); Create("workspace/beta"); Create("workspace/.hidden");
        File.WriteAllText(Path.Combine(workspace, "reference.txt"), "파일 내용");
        var browser = new ProjectFolderBrowser(workspace, Create("state"), _root);
        var result = browser.Browse(null, null);
        Assert.True(result.Ok, result.Error);
        Assert.True(result.CanSelect, result.SelectionReason);
        Assert.Equal(new[] { "alpha", "beta" }, result.Items.Select(item => item.Name));
        Assert.Single(browser.Browse(workspace, "ALP").Items);
        var parent = browser.Browse(result.Parent, null);
        Assert.True(parent.Ok);
        Assert.False(parent.CanSelect);
    }

    [Fact]
    public void PrivateDirectoriesAndAliasesCannotBeBrowsedOrRegistered()
    {
        var workspace = Create("workspace");
        var state = Create("state");
        var browser = new ProjectFolderBrowser(workspace, state, _root);
        Assert.False(browser.Browse(state, null).Ok);
        var ssh = Create(".ssh");
        Assert.False(browser.Browse(ssh, null).Ok);
        var registry = new ProjectApplicationService(Path.Combine(state, "projects.json"), state, workspace);
        Assert.False(registry.CreateProject("private", ssh, null, null).Ok);
        Assert.False(registry.CreateProject("parent", _root, null, null).Ok);
        if (!OperatingSystem.IsWindows())
        {
            var alias = Path.Combine(workspace, "alias");
            Directory.CreateSymbolicLink(alias, state);
            Assert.False(browser.Browse(alias, null).Ok);
            Assert.False(registry.CreateProject("alias", alias, null, null).Ok);
        }
    }

    [Fact]
    public void FolderBrowserIsNotExposedToLimitedRemoteSessions()
        => Assert.False(RemoteLimitedMessagePolicy.IsAllowed("project_folders_list"));

    public void Dispose() { if (Directory.Exists(_root)) Directory.Delete(_root, recursive: true); }
}
