namespace Omnux.Middleware;

public sealed partial class CommandService
{
    public Task<ProjectContextSnapshot> ScanProjectContextAsync(CancellationToken cancellationToken, string? projectKey = null)
        => _contextAppService.ScanProjectContextAsync(cancellationToken, projectKey);

    public Task<SkillManifestListResult> ListSkillsAsync(CancellationToken cancellationToken, string? projectKey = null)
        => _contextAppService.ListSkillsAsync(cancellationToken, projectKey);

    public Task<CommandTemplateListResult> ListCommandsAsync(CancellationToken cancellationToken, string? projectKey = null)
        => _contextAppService.ListCommandsAsync(cancellationToken, projectKey);
}
