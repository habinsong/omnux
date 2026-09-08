using System.Text.Json;

namespace Omnux.Middleware;

internal sealed class ProjectRegistryStore
{
    private const int Version = 1;
    private readonly string _path;

    public ProjectRegistryStore(string path) => _path = path;

    public ProjectState Load()
    {
        var json = AtomicFileStore.ReadAllTextWithBackup(_path, IsValidStateJson, logScope: "projects");
        if (string.IsNullOrWhiteSpace(json))
        {
            if (File.Exists(_path) || Directory.Exists(_path))
                throw new InvalidDataException("프로젝트 목록을 읽지 못했습니다. 기존 파일을 보존했습니다. 상태 파일과 백업을 확인해 주세요.");
            return new ProjectState(Version, Array.Empty<ProjectItem>());
        }
        var state = JsonSerializer.Deserialize(json, ProjectJsonContext.Default.ProjectState)!;
        if (state.Version != Version)
            throw new InvalidDataException($"지원하지 않는 프로젝트 목록 버전입니다: {state.Version}. 기존 파일은 변경하지 않았습니다.");
        return state;
    }

    public void Save(IReadOnlyList<ProjectItem> projects)
    {
        var json = JsonSerializer.Serialize(new ProjectState(Version, projects), ProjectJsonContext.Default.ProjectState);
        AtomicFileStore.WriteAllText(_path, json, ownerOnly: true);
    }

    private static bool IsValidStateJson(string json)
    {
        try
        {
            var state = JsonSerializer.Deserialize(json, ProjectJsonContext.Default.ProjectState);
            if (state?.Projects == null) return false;
            var keys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            return state.Projects.All(item => item != null && !string.IsNullOrWhiteSpace(item.ProjectKey)
                && !string.IsNullOrWhiteSpace(item.Path) && keys.Add(item.ProjectKey));
        }
        catch (JsonException) { return false; }
    }
}
