using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

// DoctorSlashCommandHandler를 CommandService(God Object) 없이 IDoctorApplicationService fake만으로
// 단독 생성/구동한다. 이 테스트가 통과한다는 것 자체가 /doctor 텍스트 명령이 82개 private 필드에서
// 탈결합되어 도메인 서비스에만 의존함을 증명한다(결함 4번 M1).
public sealed class DoctorSlashCommandHandlerTests
{
    private static DoctorReport BuildReport(string id = "rpt-1") =>
        new DoctorReport(
            id,
            new DateTimeOffset(2026, 6, 2, 0, 0, 0, TimeSpan.Zero),
            new[]
            {
                new DoctorCheckResult("check.a", DoctorStatus.Ok, "all good", null, Array.Empty<string>())
            },
            OkCount: 1,
            WarnCount: 0,
            FailCount: 0,
            SkipCount: 0
        );

    [Fact]
    public void CanHandleMatchesDoctorAndRejectsOthers()
    {
        var handler = new DoctorSlashCommandHandler(new FakeDoctorService(BuildReport()));

        Assert.True(handler.CanHandle(new SlashCommandContext("/doctor", "web")));
        Assert.True(handler.CanHandle(new SlashCommandContext("/doctor json", "telegram")));
        Assert.True(handler.CanHandle(new SlashCommandContext("/doctor last", "web")));
        Assert.False(handler.CanHandle(new SlashCommandContext("/plan list", "web")));
        Assert.False(handler.CanHandle(new SlashCommandContext("hello there", "web")));
    }

    [Fact]
    public async Task RunsFreshReportAsText()
    {
        var fake = new FakeDoctorService(BuildReport());
        var handler = new DoctorSlashCommandHandler(fake);

        var result = await handler.HandleAsync(new SlashCommandContext("/doctor", "web"), CancellationToken.None);

        Assert.Equal(1, fake.RunCalls);
        Assert.Equal(0, fake.GetLastCalls);
        Assert.Contains("[omnux Doctor]", result);
        Assert.Contains("report=rpt-1", result);
    }

    [Fact]
    public async Task LastUsesStoredReportInsteadOfRunning()
    {
        var fake = new FakeDoctorService(BuildReport("stored"));
        var handler = new DoctorSlashCommandHandler(fake);

        var result = await handler.HandleAsync(new SlashCommandContext("/doctor last", "web"), CancellationToken.None);

        Assert.Equal(0, fake.RunCalls);
        Assert.Equal(1, fake.GetLastCalls);
        Assert.Contains("report=stored", result);
    }

    [Fact]
    public async Task JsonReturnsSerializedReportNotText()
    {
        var handler = new DoctorSlashCommandHandler(new FakeDoctorService(BuildReport()));

        var result = await handler.HandleAsync(new SlashCommandContext("/doctor json", "web"), CancellationToken.None);

        Assert.Contains("rpt-1", result);
        Assert.DoesNotContain("[omnux Doctor]", result);
    }

    [Fact]
    public async Task TelegramLargeJsonUsesCommandHandoff()
    {
        var bigChecks = new List<DoctorCheckResult>();
        for (var i = 0; i < 60; i++)
        {
            bigChecks.Add(new DoctorCheckResult(
                $"check.{i}",
                DoctorStatus.Warn,
                $"summary {i} with enough text to inflate the serialized payload size",
                "detail line that is intentionally long so the JSON crosses the handoff threshold",
                new[] { "do something useful" }
            ));
        }

        var report = new DoctorReport("big", new DateTimeOffset(2026, 6, 2, 0, 0, 0, TimeSpan.Zero), bigChecks, 0, 60, 0, 0);
        var handler = new DoctorSlashCommandHandler(new FakeDoctorService(report));

        var result = await handler.HandleAsync(new SlashCommandContext("/doctor json", "telegram"), CancellationToken.None);

        Assert.Contains("telegram_command_output_handoff", result);
        Assert.Contains("Doctor JSON", result);
    }

    [Fact]
    public async Task TelegramDoctorHelpReturnsTelegramHelpNotReport()
    {
        var fake = new FakeDoctorService(BuildReport());
        var handler = new DoctorSlashCommandHandler(fake);

        var result = await handler.HandleAsync(new SlashCommandContext("/doctor help", "telegram"), CancellationToken.None);

        // 텔레그램 help는 리포트를 실행하지 않고 도움말을 반환해야 한다.
        Assert.Equal(0, fake.RunCalls);
        Assert.Equal(0, fake.GetLastCalls);
        Assert.Equal(TelegramHelpTextPolicy.Build("doctor"), result);
    }

    [Fact]
    public async Task WebDoctorHelpRunsReportLikeLegacy()
    {
        var fake = new FakeDoctorService(BuildReport());
        var handler = new DoctorSlashCommandHandler(fake);

        // 웹 `/doctor help`는 레거시와 동일하게 리포트를 실행(도움말 아님).
        var result = await handler.HandleAsync(new SlashCommandContext("/doctor help", "web"), CancellationToken.None);

        Assert.Equal(1, fake.RunCalls);
        Assert.Contains("[omnux Doctor]", result);
    }

    [Fact]
    public async Task JsonWithMissingLastReportReturnsNullLiteral()
    {
        var fake = new FakeDoctorService(null);
        var handler = new DoctorSlashCommandHandler(fake);

        var result = await handler.HandleAsync(new SlashCommandContext("/doctor last json", "web"), CancellationToken.None);

        Assert.Equal("null", result);
        Assert.Equal(0, fake.RunCalls);
    }

    private sealed class FakeDoctorService : IDoctorApplicationService
    {
        private readonly DoctorReport? _report;

        public FakeDoctorService(DoctorReport? report) => _report = report;

        public int RunCalls { get; private set; }
        public int GetLastCalls { get; private set; }

        public Task<DoctorReport> RunDoctorAsync(CancellationToken cancellationToken)
        {
            RunCalls++;
            return Task.FromResult(_report ?? throw new InvalidOperationException("no report configured for RunDoctorAsync"));
        }

        public Task<DoctorReport?> GetLastDoctorReportAsync(CancellationToken cancellationToken)
        {
            GetLastCalls++;
            return Task.FromResult(_report);
        }

        public Task<DoctorFixPlanResult> PreviewDoctorFixAsync(CancellationToken cancellationToken)
            => throw new NotSupportedException();

        public DoctorFixPlanResult ApplyDoctorFix(string previewId)
            => throw new NotSupportedException();
    }
}
