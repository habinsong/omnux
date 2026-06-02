namespace Omnux.Middleware;

public sealed partial class CommandService
{
    private async Task<string?> ExecuteUnifiedSlashCommandDoctorAsync(
        UnifiedSlashCommand command,
        CancellationToken cancellationToken
    )
    {
        if (command.Kind != UnifiedSlashCommandKind.Doctor)
        {
            return null;
        }

        return await ExecuteDoctorReportCommandAsync(command.Json, command.LatestOnly, cancellationToken);
    }
}
