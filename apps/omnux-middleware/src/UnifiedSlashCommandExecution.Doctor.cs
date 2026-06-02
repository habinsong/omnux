namespace Omnux.Middleware;

public sealed partial class CommandService
{
    private async Task<string?> ExecuteUnifiedSlashCommandDoctorAsync(
        UnifiedSlashCommand command,
        string source,
        CancellationToken cancellationToken
    )
    {
        if (!IsUnifiedSlashDoctorCommand(command.Kind))
        {
            return null;
        }

        return await ExecuteUnifiedSlashDoctorCommandBoundaryAsync(
            new UnifiedSlashDoctorCommandRequest(command.Json, command.LatestOnly, source),
            cancellationToken
        );
    }
}
