namespace Omnux.Middleware;

/// <summary>
/// <c>/doctor</c> 텍스트 명령 핸들러. <see cref="IDoctorApplicationService"/>와 순수 정책
/// (<see cref="DoctorJson"/>, <see cref="DoctorCli"/>, <see cref="TelegramCommandHandoffPolicy"/>)만
/// 의존하며 CommandService private state에 의존하지 않는다.
/// 결함 4번 God Object 탈결합의 첫 도메인 이관이다.
/// </summary>
internal sealed class DoctorSlashCommandHandler : ISlashCommandHandler
{
    // 텔레그램 Doctor JSON handoff 임계값.
    private const int DoctorJsonHeavyChars = 1200;
    private const int DoctorJsonHeavyLines = 24;

    private readonly IDoctorApplicationService _doctorService;

    public DoctorSlashCommandHandler(IDoctorApplicationService doctorService)
    {
        _doctorService = doctorService;
    }

    public bool CanHandle(SlashCommandContext context)
    {
        return UnifiedSlashCommandPolicy.Parse(context.Text)?.Kind == UnifiedSlashCommandKind.Doctor;
    }

    public async Task<string> HandleAsync(SlashCommandContext context, CancellationToken cancellationToken)
    {
        var isTelegram = string.Equals(context.Source, "telegram", StringComparison.OrdinalIgnoreCase);

        // 텔레그램 `/doctor help` → 텔레그램 도움말. 텔레그램 direct wrapper 없이 라우터에서 직접 보존한다.
        // (웹 `/doctor help`는 레거시와 동일하게 도움말이 아니라 리포트를 실행한다.)
        if (isTelegram)
        {
            var tokens = (context.Text ?? string.Empty)
                .Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            if (tokens.Length >= 2 && tokens[1].Equals("help", StringComparison.OrdinalIgnoreCase))
            {
                return TelegramHelpTextPolicy.Build("doctor");
            }
        }

        var command = UnifiedSlashCommandPolicy.Parse(context.Text);
        var json = command?.Json ?? false;
        var latestOnly = command?.LatestOnly ?? false;

        var report = latestOnly
            ? await _doctorService.GetLastDoctorReportAsync(cancellationToken)
            : await _doctorService.RunDoctorAsync(cancellationToken);

        if (json)
        {
            if (report == null)
            {
                return "null";
            }

            var jsonText = DoctorJson.Serialize(report, indented: true);
            if (string.Equals(context.Source, "telegram", StringComparison.OrdinalIgnoreCase)
                && TelegramCommandHandoffPolicy.ShouldUseCommandHandoff(jsonText, heavyChars: DoctorJsonHeavyChars, heavyLines: DoctorJsonHeavyLines))
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
