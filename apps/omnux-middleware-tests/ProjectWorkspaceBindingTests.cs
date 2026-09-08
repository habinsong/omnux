using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class ProjectWorkspaceBindingTests : IDisposable
{
    private readonly string _root = Directory.CreateTempSubdirectory("omnux-project-binding-").FullName;

    [Fact]
    public void ProjectBindingSurvivesReloadAndCannotMoveToAnotherDirectory()
    {
        var registry = Registry();
        var folder = Directory.CreateDirectory(Path.Combine(_root, "source")).FullName;
        var project = registry.CreateProject("프로젝트", folder, null, null).Item!;
        var resolver = new ProjectWorkspaceBindingService(registry);
        var binding = resolver.Resolve(project.ProjectKey, null)!;
        var state = Path.Combine(_root, "conversations.json");
        var store = new ConversationStore(state);
        var thread = store.Create("coding", "single", "등록된 작업", null, null, null);
        store.BindCodingProject(thread.Id, binding);
        Assert.Equal(binding, new ConversationStore(state).Get(thread.Id)!.CodingProject);
        Assert.Equal(binding, resolver.Resolve(null, binding));

        var second = Directory.CreateDirectory(Path.Combine(_root, "another")).FullName;
        registry.UpdateProject(project.ProjectKey, null, second, null, null, null);
        Assert.Throws<InvalidOperationException>(() => resolver.Resolve(null, binding));
        Assert.Throws<InvalidOperationException>(() => store.BindCodingProject(thread.Id, binding with { Path = second }));
        Assert.Equal(binding, store.Get(thread.Id)!.CodingProject);
    }

    [Fact]
    public void MissingOrDeletedProjectCannotBecomeAnImplicitNewWorkspace()
    {
        var registry = Registry();
        var resolver = new ProjectWorkspaceBindingService(registry);
        Assert.Null(resolver.Resolve(null, null));
        Assert.Throws<InvalidOperationException>(() => resolver.Resolve("missing", null));
        var path = Directory.CreateDirectory(Path.Combine(_root, "source")).FullName;
        var project = registry.CreateProject("프로젝트", path, null, null).Item!;
        var binding = resolver.Resolve(project.ProjectKey, null)!;
        registry.DeleteProject(project.ProjectKey, null, null);
        Assert.Throws<InvalidOperationException>(() => resolver.Resolve(null, binding));
        Assert.True(Directory.Exists(path));
    }

    [Fact]
    public void ExistingUnboundConversationRequiresNewBuildBeforeProjectSelection()
    {
        var store = new ConversationStore(Path.Combine(_root, "state.json"));
        var thread = store.Create("coding", "single", "이전 작업", null, null, null);
        store.AppendMessage(thread.Id, "user", "기존 요청", "");
        Assert.Throws<InvalidOperationException>(() => store.BindCodingProject(thread.Id, new CodingProjectBinding("project", "프로젝트", _root)));
        Assert.Null(store.Get(thread.Id)!.CodingProject);
    }

    [Fact]
    public void ProjectAndConversationLeasesPreventOverlappingWrites()
    {
        var binding = new CodingProjectBinding("one", "프로젝트", _root);
        var service = new ProjectWorkspaceBindingService(Registry());
        using (service.Acquire(binding, "conversation"))
        {
            Assert.Throws<InvalidOperationException>(() => service.Acquire(binding with { Key = "alias" }, "another"));
            Assert.Throws<InvalidOperationException>(() => service.Acquire(null, "conversation"));
        }
        using var next = service.Acquire(binding, "conversation");
    }

    [Fact]
    public void DirectoryAliasResolvesToTheSameLeaseIdentity()
    {
        if (OperatingSystem.IsWindows()) return;
        var directory = Directory.CreateDirectory(Path.Combine(_root, "source")).FullName;
        var alias = Path.Combine(_root, "alias");
        Directory.CreateSymbolicLink(alias, directory);
        var registry = Registry();
        var first = registry.CreateProject("first", directory, null, null).Item!;
        var second = registry.CreateProject("second", alias, null, null).Item!;
        var service = new ProjectWorkspaceBindingService(registry);
        var binding = service.Resolve(first.ProjectKey, null)!;
        var aliasBinding = service.Resolve(second.ProjectKey, null)!;
        Assert.Equal(binding.Path, aliasBinding.Path);
        using var lease = service.Acquire(binding, "first");
        Assert.Throws<InvalidOperationException>(() => service.Acquire(aliasBinding, "second"));
    }

    [Fact]
    public async Task ComparisonCopiesKeepSourcesAndExcludePrivateFilesDependenciesAndLinks()
    {
        var source = Directory.CreateDirectory(Path.Combine(_root, "source")).FullName;
        File.WriteAllText(Path.Combine(source, "main.py"), "print('source')");
        File.WriteAllBytes(Path.Combine(source, "asset.png"), new byte[] { 1, 2, 3, 4 });
        File.WriteAllBytes(Path.Combine(source, ".env"), Array.Empty<byte>());
        var dependencies = Directory.CreateDirectory(Path.Combine(source, "node_modules"));
        File.WriteAllText(Path.Combine(dependencies.FullName, "dependency.js"), "fixture");
        var credentials = Directory.CreateDirectory(Path.Combine(source, ".config", "gh"));
        File.WriteAllBytes(Path.Combine(credentials.FullName, "hosts.yml"), Array.Empty<byte>());
        if (!OperatingSystem.IsWindows()) File.CreateSymbolicLink(Path.Combine(source, "linked.py"), Path.Combine(source, "main.py"));
        var run = Directory.CreateDirectory(Path.Combine(_root, "run")).FullName;
        var binding = new CodingProjectBinding("project", "프로젝트", source);
        await ProjectWorkspaceFiles.PrepareComparisonAsync(binding, run, CancellationToken.None);
        var worker = await ProjectWorkspaceFiles.WorkerDirectoryAsync(binding, run, "grok", "fixture", CancellationToken.None);
        Assert.Equal("print('source')", File.ReadAllText(Path.Combine(worker, "main.py")));
        Assert.Equal(new byte[] { 1, 2, 3, 4 }, File.ReadAllBytes(Path.Combine(worker, "asset.png")));
        Assert.False(File.Exists(Path.Combine(worker, ".env")));
        Assert.False(Directory.Exists(Path.Combine(worker, "node_modules")));
        Assert.False(File.Exists(Path.Combine(worker, ".config", "gh", "hosts.yml")));
        Assert.False(File.Exists(Path.Combine(worker, "linked.py")));
        File.WriteAllText(Path.Combine(worker, "main.py"), "print('worker')");
        Assert.Equal("print('source')", File.ReadAllText(Path.Combine(source, "main.py")));
        var sourceHashes = await ProjectWorkspaceFiles.FingerprintsAsync(source, CancellationToken.None);
        var workerHashes = await ProjectWorkspaceFiles.FingerprintsAsync(worker, CancellationToken.None);
        Assert.NotEqual(sourceHashes["main.py"], workerHashes["main.py"]);
        Assert.Equal(sourceHashes["asset.png"], workerHashes["asset.png"]);
    }

    private ProjectApplicationService Registry() => new(Path.Combine(_root, "projects.json"));
    public void Dispose() => Directory.Delete(_root, recursive: true);
}
