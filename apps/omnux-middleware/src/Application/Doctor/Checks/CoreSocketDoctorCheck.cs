namespace Omnux.Middleware;

public sealed class CoreSocketDoctorCheck : IDoctorCheck
{
    private readonly PathOptions _paths;
    private readonly ICoreRuntimeClient _coreClient;

    public CoreSocketDoctorCheck(PathOptions paths, ICoreRuntimeClient coreClient)
    {
        _paths = paths;
        _coreClient = coreClient;
    }

    public string Id => "core_runtime";

    public async Task<DoctorCheckResult> RunAsync(CancellationToken cancellationToken)
    {
        var auditParent = Path.GetDirectoryName(_paths.AuditLogPath) ?? "(none)";
        var auditParentExists = Directory.Exists(auditParent);

        try
        {
            var metrics = await _coreClient.GetMetricsAsync(cancellationToken);
            var status = auditParentExists
                ? DoctorStatus.Ok
                : DoctorStatus.Warn;
            var summary = status == DoctorStatus.Ok
                ? ".NET 코어 런타임 응답이 정상입니다."
                : ".NET 코어 런타임은 응답했지만 감사 로그 경로 점검에 경고가 있습니다.";
            return new DoctorCheckResult(
                Id,
                status,
                summary,
                $"runtime=dotnet; auditParent={auditParent}({(auditParentExists ? "present" : "missing")}); metrics={DoctorSupport.Trim(metrics, 240)}",
                status == DoctorStatus.Ok
                    ? Array.Empty<string>()
                    : new[] { "감사 로그 부모 디렉터리 존재 여부를 점검하세요." }
            );
        }
        catch (Exception ex)
        {
            return new DoctorCheckResult(
                Id,
                DoctorStatus.Fail,
                ".NET 코어 런타임 점검에 실패했습니다.",
                $"runtime=dotnet; error={DoctorSupport.Trim(ex.Message, 280)}",
                new[] { "미들웨어 프로세스의 OS metrics/kill 권한과 런타임 예외 로그를 확인하세요." }
            );
        }
    }
}
