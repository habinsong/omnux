namespace Omnux.Middleware.Tests;

public sealed class DefaultStatePathResolverTests : IDisposable
{
    private readonly string? _previousWorkspaceRoot =
        Environment.GetEnvironmentVariable("OMNUX_WORKSPACE_ROOT");

    public void Dispose()
    {
        Environment.SetEnvironmentVariable("OMNUX_WORKSPACE_ROOT", _previousWorkspaceRoot);
    }

    [Fact]
    public void ExplicitWorkspaceRootEnvWins()
    {
        var stateRoot = CreateTempDir();
        var workspace = Path.Combine(CreateTempDir(), "workspace", "coding");
        Environment.SetEnvironmentVariable("OMNUX_WORKSPACE_ROOT", workspace);

        var resolved = DefaultStatePathResolver.ResolveDefaultWorkspaceRootDir(stateRoot);

        Assert.Equal(Path.GetFullPath(workspace), resolved);
    }

    [Fact]
    public void ResolvedWorkspaceRootNeverSitsDirectlyUnderFileSystemRoot()
    {
        // 패키징된 .app 처럼 리포 상대 경로가 모두 빗나가면 예전 로직은 `/coding` 을 골랐고,
        // 컨테이너 루트가 `/` 가 되어 `/.runtime` 생성이 read-only file system 으로 실패했다.
        Environment.SetEnvironmentVariable("OMNUX_WORKSPACE_ROOT", null);
        var stateRoot = CreateTempDir();

        var resolved = DefaultStatePathResolver.ResolveDefaultWorkspaceRootDir(stateRoot);

        var parent = Directory.GetParent(resolved);
        Assert.NotNull(parent);
        Assert.NotEqual(Path.GetPathRoot(resolved), parent!.FullName);
    }

    [Fact]
    public void LogicRuntimeRootStaysInsideWorkspaceContainer()
    {
        var container = CreateTempDir();
        var workspace = Path.Combine(container, "coding");
        Directory.CreateDirectory(workspace);
        Environment.SetEnvironmentVariable("OMNUX_WORKSPACE_ROOT", workspace);

        var resolver = DefaultStatePathResolver.CreateDefault();

        Assert.Equal(Path.Combine(container, ".runtime", "logic"), resolver.GetLogicRuntimeRoot());
        Assert.Equal(Path.Combine(container, ".runtime", "tasks"), resolver.GetTaskRuntimeRoot());
    }

    private static string CreateTempDir()
    {
        var path = Path.Combine(Path.GetTempPath(), "omnux-paths-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(path);
        return path;
    }
}
