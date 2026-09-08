namespace Omnux.Middleware;

internal sealed class ProjectWorkspaceBindingService
{
    private readonly IProjectApplicationService _projects;
    private readonly string? _privateStateRoot;
    private readonly object _sync = new();
    private readonly HashSet<string> _active = new(OperatingSystem.IsWindows() ? StringComparer.OrdinalIgnoreCase : StringComparer.Ordinal);

    public ProjectWorkspaceBindingService(IProjectApplicationService projects, string? privateStateRoot = null)
    {
        _projects = projects;
        _privateStateRoot = privateStateRoot;
    }

    public CodingProjectBinding? Resolve(string? requestedKey, CodingProjectBinding? existing)
    {
        var key = string.IsNullOrWhiteSpace(requestedKey) ? existing?.Key : requestedKey.Trim();
        if (string.IsNullOrWhiteSpace(key)) return null;
        var project = _projects.ListProjects().FirstOrDefault(item => string.Equals(item.ProjectKey, key, StringComparison.OrdinalIgnoreCase))
            ?? throw new InvalidOperationException("등록된 프로젝트를 찾을 수 없습니다. 프로젝트를 다시 선택해 주세요.");
        var directory = ProjectWorkspaceFiles.CanonicalDirectory(project.Path);
        var comparison = OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal;
        if (directory.Equals(Path.GetPathRoot(directory), comparison)) throw new InvalidOperationException("파일 시스템 전체를 프로젝트 작업 폴더로 사용할 수 없습니다.");
        if (_privateStateRoot != null && Directory.Exists(_privateStateRoot))
        {
            var state = ProjectWorkspaceFiles.CanonicalDirectory(_privateStateRoot);
            if (state.Equals(directory, comparison) || state.StartsWith(directory + Path.DirectorySeparatorChar, comparison))
                throw new InvalidOperationException("개인 상태 폴더를 포함하는 경로입니다. 더 구체적인 프로젝트 폴더를 선택해 주세요.");
        }

        if (existing != null && (!string.Equals(existing.Key, key, StringComparison.OrdinalIgnoreCase)
            || !string.Equals(existing.Path, directory, OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal)))
            throw new InvalidOperationException("등록된 프로젝트 경로가 바뀌었습니다. 새 빌드에서 프로젝트를 선택해 주세요.");
        return new CodingProjectBinding(project.ProjectKey, project.Name, directory);
    }

    public IDisposable Acquire(CodingProjectBinding? binding, string? conversationId)
    {
        var keys = new[] { binding == null ? null : "project:" + binding.Path, string.IsNullOrWhiteSpace(conversationId) ? null : "conversation:" + conversationId }
            .Where(key => key != null).Cast<string>().ToArray();
        lock (_sync)
        {
            if (keys.Any(key => _active.Contains(key))) throw new InvalidOperationException("이 프로젝트 또는 빌드에서 다른 작업이 진행 중입니다. 완료하거나 중단한 뒤 다시 시도해 주세요.");
            foreach (var key in keys) _active.Add(key);
        }
        return new Lease(this, keys);
    }

    private sealed class Lease : IDisposable
    {
        private ProjectWorkspaceBindingService? _owner;
        private readonly string[] _keys;
        public Lease(ProjectWorkspaceBindingService owner, string[] keys) { _owner = owner; _keys = keys; }
        public void Dispose()
        {
            var owner = Interlocked.Exchange(ref _owner, null);
            if (owner == null) return;
            lock (owner._sync) foreach (var key in _keys) owner._active.Remove(key);
        }
    }
}
