namespace Omnux.Middleware;

public sealed partial class CommandService
{
    private readonly record struct UnifiedSlashDoctorCommandRequest(
        bool Json,
        bool LatestOnly,
        string Source
    );

    private static bool IsUnifiedSlashDoctorCommand(UnifiedSlashCommandKind kind)
    {
        return kind == UnifiedSlashCommandKind.Doctor;
    }

    private async Task<string?> ExecuteUnifiedSlashDoctorCommandBoundaryAsync(
        UnifiedSlashDoctorCommandRequest request,
        CancellationToken cancellationToken
    )
    {
        return await ExecuteDoctorReportCommandAsync(
            request.Json,
            request.LatestOnly,
            cancellationToken,
            request.Source
        );
    }
}
