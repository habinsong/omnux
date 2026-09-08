namespace Omnux.Middleware;

public sealed class ContextApplicationService : IContextApplicationService
{
    private readonly ProjectContextLoader _projectContextLoader;
    private readonly ProjectWorkspaceBindingService? _projects;

    public ContextApplicationService(ProjectContextLoader projectContextLoader, IProjectApplicationService? projects = null)
    {
        _projectContextLoader = projectContextLoader;
        _projects = projects == null ? null : new ProjectWorkspaceBindingService(projects);
    }

    public Task<ProjectContextSnapshot> ScanProjectContextAsync(CancellationToken cancellationToken, string? projectKey = null)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_projectContextLoader.LoadSnapshot(ResolveDirectory(projectKey)));
    }

    public Task<SkillManifestListResult> ListSkillsAsync(CancellationToken cancellationToken, string? projectKey = null)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var snapshot = _projectContextLoader.LoadSnapshot(ResolveDirectory(projectKey));
        return Task.FromResult(new SkillManifestListResult(
            snapshot.ProjectRoot,
            snapshot.CurrentDirectory,
            snapshot.Skills,
            snapshot.ScannedAtUtc
        ));
    }

    public Task<CommandTemplateListResult> ListCommandsAsync(CancellationToken cancellationToken, string? projectKey = null)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var snapshot = _projectContextLoader.LoadSnapshot(ResolveDirectory(projectKey));
        return Task.FromResult(new CommandTemplateListResult(
            snapshot.ProjectRoot,
            snapshot.CurrentDirectory,
            snapshot.Commands,
            snapshot.ScannedAtUtc
        ));
    }
    private string? ResolveDirectory(string? projectKey)
    {
        if (string.IsNullOrWhiteSpace(projectKey)) return null;
        if (_projects == null) throw new InvalidOperationException("프로젝트 조회 서비스가 연결되지 않았습니다.");
        return _projects.Resolve(projectKey, null)?.Path;
    }

}
