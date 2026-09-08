using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class ProjectRegistrySafetyTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "omnux-project-registry-" + Guid.NewGuid().ToString("N"));
    private string StatePath => Path.Combine(_root, "state", "projects.json");
    private string DirectoryPath(string name) => Directory.CreateDirectory(Path.Combine(_root, name)).FullName;

    [Theory]
    [InlineData("update")]
    [InlineData("delete")]
    [InlineData("touch")]
    public void MissingExplicitKeyNeverTargetsAProjectByItsFallbackFields(string action)
    {
        var registry = new ProjectApplicationService(StatePath);
        var project = registry.CreateProject("기존 프로젝트", DirectoryPath("source"), "원래 설명", null).Item!;
        var before = File.ReadAllText(StatePath);
        var result = action switch
        {
            "update" => registry.UpdateProject("deleted-key", project.Name, project.Path, "다른 설명", null, null),
            "delete" => registry.DeleteProject("deleted-key", project.Name, project.Path),
            _ => registry.TouchProject("deleted-key", project.Name, project.Path)
        };
        Assert.False(result.Ok);
        Assert.Equal(before, File.ReadAllText(StatePath));
    }

    [Theory]
    [InlineData("{invalid")]
    [InlineData("{\"version\":1,\"projects\":null}")]
    [InlineData("{\"version\":999,\"projects\":[]}")]
    public void InvalidRegistryIsNotOverwrittenByANewRegistration(string json)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(StatePath)!);
        File.WriteAllText(StatePath, json);
        var registry = new ProjectApplicationService(StatePath);
        Assert.Throws<InvalidDataException>(() => registry.CreateProject("새 프로젝트", DirectoryPath("source"), "", null));
        Assert.Equal(json, File.ReadAllText(StatePath));
    }

    [Fact]
    public void RemovingRegistrationLeavesTheSourceFolderAndFilesUntouched()
    {
        var registry = new ProjectApplicationService(StatePath);
        var source = DirectoryPath("source");
        var file = Path.Combine(source, "keep.txt");
        File.WriteAllText(file, "보존할 파일");
        var project = registry.CreateProject("프로젝트", source, null, null).Item!;
        Assert.True(registry.DeleteProject(project.ProjectKey, null, null).Ok);
        Assert.Equal("보존할 파일", File.ReadAllText(file));
    }

    public void Dispose() { if (Directory.Exists(_root)) Directory.Delete(_root, recursive: true); }
}
