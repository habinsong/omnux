using System.Text.Json;
using System.Text.RegularExpressions;

namespace Omnux.Middleware;

internal sealed class FileProjectChangeStore
{
    private readonly string _directory;
    public FileProjectChangeStore(IStatePathResolver paths) => _directory = paths.ResolveStateDirectoryPath(DefaultStatePathResolver.CodingProjectPreviewsDirectoryName);
    public void Save(ProjectChangeRecord record)
    {
        Directory.CreateDirectory(_directory);
        AtomicFileStore.WriteAllText(PathFor(record.Preview.Id), JsonSerializer.Serialize(record, ProjectChangeJsonContext.Default.ProjectChangeRecord), ownerOnly: true);
    }
    public ProjectChangeRecord? Read(string id)
    {
        var path = PathFor(id);
        if (!File.Exists(path)) return null;
        return JsonSerializer.Deserialize(File.ReadAllText(path), ProjectChangeJsonContext.Default.ProjectChangeRecord);
    }
    public void Remove(string id) => File.Delete(PathFor(id));
    private string PathFor(string id)
    {
        if (!Regex.IsMatch(id ?? "", "^[a-f0-9]{32}$")) throw new InvalidOperationException("변경 검토 ID가 올바르지 않습니다.");
        return Path.Combine(_directory, id + ".json");
    }
}
