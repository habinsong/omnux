using System.Text.Json.Serialization;

namespace Omnux.Middleware;

public interface IProjectApplicationService
{
    ProjectFolderSnapshot BrowseFolders(string? path, string? search);
    IReadOnlyList<ProjectItem> ListProjects();
    ProjectActionResult CreateProject(string? name, string? path, string? description, string? color);
    ProjectActionResult UpdateProject(string? projectKey, string? name, string? path, string? description, string? color, bool? isMain);
    ProjectActionResult DeleteProject(string? projectKey, string? name, string? path);
    ProjectActionResult TouchProject(string? projectKey, string? name, string? path);
}

public sealed record ProjectItem(
    string ProjectKey,
    string Name,
    string Path,
    string Description,
    string Color,
    bool IsMain,
    int Runs,
    int Automations,
    string LastOpenedUtc,
    string UpdatedAtUtc
);

public sealed record ProjectState(
    int Version,
    IReadOnlyList<ProjectItem> Projects
);

public sealed record ProjectActionResult(
    bool Ok,
    string Message,
    ProjectItem? Item,
    IReadOnlyList<ProjectItem> Items
);

[JsonSourceGenerationOptions(
    PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    WriteIndented = false
)]
[JsonSerializable(typeof(ProjectItem))]
[JsonSerializable(typeof(ProjectItem[]), TypeInfoPropertyName = "ProjectItemArray")]
[JsonSerializable(typeof(ProjectState))]
[JsonSerializable(typeof(ProjectActionResult))]
[JsonSerializable(typeof(ProjectFolderSnapshot))]
internal partial class ProjectJsonContext : JsonSerializerContext
{
}
