namespace Omnux.Middleware;

public sealed partial class CommandService
{
    public Task<DoctorReport> RunDoctorAsync(CancellationToken cancellationToken)
        => _doctorAppService.RunDoctorAsync(cancellationToken);

    public Task<DoctorReport?> GetLastDoctorReportAsync(CancellationToken cancellationToken)
        => _doctorAppService.GetLastDoctorReportAsync(cancellationToken);

    public Task<DoctorFixPlanResult> PreviewDoctorFixAsync(CancellationToken cancellationToken)
        => _doctorAppService.PreviewDoctorFixAsync(cancellationToken);

    public DoctorFixPlanResult ApplyDoctorFix(string previewId)
        => _doctorAppService.ApplyDoctorFix(previewId);

    private async Task<string> ExecuteDoctorReportCommandAsync(
        bool json,
        bool latestOnly,
        CancellationToken cancellationToken,
        string source = "web"
    )
    {
        var report = latestOnly
            ? await GetLastDoctorReportAsync(cancellationToken)
            : await RunDoctorAsync(cancellationToken);

        if (json)
        {
            if (report == null)
            {
                return "null";
            }

            var jsonText = DoctorJson.Serialize(report, indented: true);
            if (string.Equals(source, "telegram", StringComparison.OrdinalIgnoreCase)
                && TelegramCommandHandoffPolicy.ShouldUseCommandHandoff(jsonText, heavyChars: 1200, heavyLines: 24))
            {
                return TelegramCommandHandoffPolicy.BuildCommandHandoffText(
                    "Doctor JSON",
                    $"report={report.ReportId} ok={report.OkCount} warn={report.WarnCount} fail={report.FailCount} skip={report.SkipCount}",
                    jsonText,
                    new[]
                    {
                        latestOnly ? "/doctor last" : "/doctor",
                        "/handoff"
                    }
                );
            }

            return jsonText;
        }

        return DoctorCli.RenderText(report);
    }
}
