using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Omnux.Middleware;

public interface IProjectApplicationService
{
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

internal sealed class ProjectApplicationService : IProjectApplicationService
{
    private const int StateVersion = 1;
    private static readonly string[] Palette =
    {
        "#2563EB",
        "#16A34A",
        "#7C3AED",
        "#D97706",
        "#0891B2",
        "#DC2626"
    };

    private readonly string _statePath;
    private readonly object _lock = new();

    public ProjectApplicationService(string statePath)
    {
        _statePath = statePath;
    }

    public IReadOnlyList<ProjectItem> ListProjects()
    {
        lock (_lock)
        {
            return LoadState().Projects.ToArray();
        }
    }

    public ProjectActionResult CreateProject(string? name, string? path, string? description, string? color)
    {
        lock (_lock)
        {
            var resolvedPath = ResolveExistingDirectory(path, out var pathError);
            if (resolvedPath == null)
            {
                return Failure(pathError);
            }

            var state = LoadState();
            if (state.Projects.Any(item => string.Equals(item.Path, resolvedPath, StringComparison.OrdinalIgnoreCase)))
            {
                return Failure("이미 등록된 프로젝트 경로입니다.", state.Projects);
            }

            var projectName = NormalizeName(name, resolvedPath);
            var key = CreateUniqueProjectKey(projectName, state.Projects);
            var now = DateTimeOffset.UtcNow.ToString("O");
            var next = new ProjectItem(
                key,
                projectName,
                resolvedPath,
                NormalizeDescription(description),
                NormalizeColor(color, projectName),
                state.Projects.Count == 0,
                0,
                0,
                now,
                now
            );
            var items = state.Projects.Concat(new[] { next }).ToArray();
            SaveState(new ProjectState(StateVersion, NormalizeMainProject(items)));
            return Success("프로젝트를 등록했습니다.", next);
        }
    }

    public ProjectActionResult UpdateProject(string? projectKey, string? name, string? path, string? description, string? color, bool? isMain)
    {
        lock (_lock)
        {
            var state = LoadState();
            var index = FindProjectIndex(state.Projects, projectKey, name, path);
            if (index < 0)
            {
                return Failure("프로젝트를 찾을 수 없습니다.", state.Projects);
            }

            var current = state.Projects[index];
            string nextPath = current.Path;
            if (!string.IsNullOrWhiteSpace(path))
            {
                var resolvedPath = ResolveExistingDirectory(path, out var pathError);
                if (resolvedPath == null)
                {
                    return Failure(pathError, state.Projects);
                }
                nextPath = resolvedPath;
            }

            if (state.Projects.Where((_, itemIndex) => itemIndex != index)
                    .Any(item => string.Equals(item.Path, nextPath, StringComparison.OrdinalIgnoreCase)))
            {
                return Failure("이미 등록된 프로젝트 경로입니다.", state.Projects);
            }

            var nextName = string.IsNullOrWhiteSpace(name) ? current.Name : NormalizeName(name, nextPath);
            var updated = current with
            {
                Name = nextName,
                Path = nextPath,
                Description = description == null ? current.Description : NormalizeDescription(description),
                Color = color == null ? current.Color : NormalizeColor(color, nextName),
                IsMain = isMain ?? current.IsMain,
                UpdatedAtUtc = DateTimeOffset.UtcNow.ToString("O")
            };
            var items = state.Projects.ToArray();
            items[index] = updated;
            items = NormalizeMainProject(items, isMain == true ? updated.ProjectKey : null).ToArray();
            SaveState(new ProjectState(StateVersion, items));
            return Success("프로젝트를 수정했습니다.", updated);
        }
    }

    public ProjectActionResult DeleteProject(string? projectKey, string? name, string? path)
    {
        lock (_lock)
        {
            var state = LoadState();
            var index = FindProjectIndex(state.Projects, projectKey, name, path);
            if (index < 0)
            {
                return Failure("프로젝트를 찾을 수 없습니다.", state.Projects);
            }

            var item = state.Projects[index];
            var items = state.Projects.Where((_, itemIndex) => itemIndex != index).ToArray();
            items = NormalizeMainProject(items).ToArray();
            SaveState(new ProjectState(StateVersion, items));
            return new ProjectActionResult(true, "프로젝트를 삭제했습니다.", item, items);
        }
    }

    public ProjectActionResult TouchProject(string? projectKey, string? name, string? path)
    {
        lock (_lock)
        {
            var state = LoadState();
            var index = FindProjectIndex(state.Projects, projectKey, name, path);
            if (index < 0)
            {
                return Failure("프로젝트를 찾을 수 없습니다.", state.Projects);
            }

            var items = state.Projects.ToArray();
            var now = DateTimeOffset.UtcNow.ToString("O");
            items[index] = items[index] with { LastOpenedUtc = now, UpdatedAtUtc = now };
            SaveState(new ProjectState(StateVersion, items));
            return Success("프로젝트 사용 시간을 갱신했습니다.", items[index]);
        }
    }

    private ProjectState LoadState()
    {
        var json = AtomicFileStore.ReadAllTextWithBackup(
            _statePath,
            IsValidStateJson,
            logScope: "projects"
        );
        if (string.IsNullOrWhiteSpace(json))
        {
            return new ProjectState(StateVersion, Array.Empty<ProjectItem>());
        }

        try
        {
            return JsonSerializer.Deserialize(json, ProjectJsonContext.Default.ProjectState)
                   ?? new ProjectState(StateVersion, Array.Empty<ProjectItem>());
        }
        catch
        {
            return new ProjectState(StateVersion, Array.Empty<ProjectItem>());
        }
    }

    private void SaveState(ProjectState state)
    {
        var json = JsonSerializer.Serialize(state, ProjectJsonContext.Default.ProjectState);
        AtomicFileStore.WriteAllText(_statePath, json, ownerOnly: true);
    }

    private static bool IsValidStateJson(string json)
    {
        try
        {
            return JsonSerializer.Deserialize(json, ProjectJsonContext.Default.ProjectState) != null;
        }
        catch
        {
            return false;
        }
    }

    private ProjectActionResult Success(string message, ProjectItem item)
    {
        return new ProjectActionResult(true, message, item, ListProjects());
    }

    private static ProjectActionResult Failure(string message, IReadOnlyList<ProjectItem>? items = null)
    {
        return new ProjectActionResult(false, message, null, items ?? Array.Empty<ProjectItem>());
    }

    private static string? ResolveExistingDirectory(string? path, out string error)
    {
        error = string.Empty;
        var trimmed = (path ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(trimmed))
        {
            error = "프로젝트 경로가 필요합니다.";
            return null;
        }

        try
        {
            var fullPath = Path.GetFullPath(Environment.ExpandEnvironmentVariables(trimmed));
            if (!Directory.Exists(fullPath))
            {
                error = "존재하는 로컬 폴더 경로만 등록할 수 있습니다.";
                return null;
            }
            return fullPath;
        }
        catch (Exception ex)
        {
            error = "프로젝트 경로를 해석할 수 없습니다: " + ex.Message;
            return null;
        }
    }

    private static string NormalizeName(string? name, string path)
    {
        var trimmed = (name ?? string.Empty).Trim();
        if (!string.IsNullOrWhiteSpace(trimmed))
        {
            return trimmed.Length <= 80 ? trimmed : trimmed[..80];
        }

        var directoryName = new DirectoryInfo(path).Name;
        return string.IsNullOrWhiteSpace(directoryName) ? path : directoryName;
    }

    private static string NormalizeDescription(string? description)
    {
        var trimmed = (description ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(trimmed))
        {
            return "등록된 로컬 프로젝트";
        }
        return trimmed.Length <= 160 ? trimmed : trimmed[..160];
    }

    private static string NormalizeColor(string? color, string seed)
    {
        var trimmed = (color ?? string.Empty).Trim();
        if (trimmed.Length == 7
            && trimmed[0] == '#'
            && trimmed.Skip(1).All(Uri.IsHexDigit))
        {
            return trimmed.ToUpperInvariant();
        }

        var sum = Encoding.UTF8.GetBytes(seed).Aggregate(0, (acc, value) => acc + value);
        return Palette[Math.Abs(sum) % Palette.Length];
    }

    private static string CreateUniqueProjectKey(string name, IReadOnlyList<ProjectItem> items)
    {
        var baseKey = ToProjectKey(name);
        var key = baseKey;
        var index = 2;
        while (items.Any(item => string.Equals(item.ProjectKey, key, StringComparison.OrdinalIgnoreCase)))
        {
            key = $"{baseKey}-{index}";
            index += 1;
        }
        return key;
    }

    private static string ToProjectKey(string name)
    {
        var builder = new StringBuilder();
        foreach (var ch in name.ToLowerInvariant())
        {
            if ((ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9'))
            {
                builder.Append(ch);
            }
            else if (builder.Length > 0 && builder[^1] != '-')
            {
                builder.Append('-');
            }
        }

        var key = builder.ToString().Trim('-');
        if (string.IsNullOrWhiteSpace(key))
        {
            key = "project";
        }
        return key.Length <= 48 ? key : key[..48].Trim('-');
    }

    private static int FindProjectIndex(IReadOnlyList<ProjectItem> items, string? projectKey, string? name, string? path)
    {
        var key = (projectKey ?? string.Empty).Trim();
        if (!string.IsNullOrWhiteSpace(key))
        {
            for (var i = 0; i < items.Count; i++)
            {
                if (string.Equals(items[i].ProjectKey, key, StringComparison.OrdinalIgnoreCase))
                {
                    return i;
                }
            }
        }

        var normalizedPath = (path ?? string.Empty).Trim();
        if (!string.IsNullOrWhiteSpace(normalizedPath))
        {
            try
            {
                normalizedPath = Path.GetFullPath(Environment.ExpandEnvironmentVariables(normalizedPath));
            }
            catch
            {
            }
            for (var i = 0; i < items.Count; i++)
            {
                if (string.Equals(items[i].Path, normalizedPath, StringComparison.OrdinalIgnoreCase))
                {
                    return i;
                }
            }
        }

        var normalizedName = (name ?? string.Empty).Trim();
        if (!string.IsNullOrWhiteSpace(normalizedName))
        {
            for (var i = 0; i < items.Count; i++)
            {
                if (string.Equals(items[i].Name, normalizedName, StringComparison.OrdinalIgnoreCase))
                {
                    return i;
                }
            }
        }

        return -1;
    }

    private static IReadOnlyList<ProjectItem> NormalizeMainProject(IReadOnlyList<ProjectItem> items, string? preferredMainKey = null)
    {
        if (items.Count == 0)
        {
            return items;
        }

        var selectedKey = !string.IsNullOrWhiteSpace(preferredMainKey)
            ? preferredMainKey
            : items.FirstOrDefault(item => item.IsMain)?.ProjectKey ?? items[0].ProjectKey;
        return items
            .Select((item, index) => item with { IsMain = string.Equals(item.ProjectKey, selectedKey, StringComparison.OrdinalIgnoreCase) || (index == 0 && string.IsNullOrWhiteSpace(selectedKey)) })
            .ToArray();
    }
}

[JsonSourceGenerationOptions(
    PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    WriteIndented = false
)]
[JsonSerializable(typeof(ProjectItem))]
[JsonSerializable(typeof(ProjectItem[]), TypeInfoPropertyName = "ProjectItemArray")]
[JsonSerializable(typeof(ProjectState))]
[JsonSerializable(typeof(ProjectActionResult))]
internal partial class ProjectJsonContext : JsonSerializerContext
{
}
