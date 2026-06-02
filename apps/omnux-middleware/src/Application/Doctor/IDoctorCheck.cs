namespace Omnux.Middleware;

public interface IDoctorCheck
{
    string Id { get; }
    Task<DoctorCheckResult> RunAsync(CancellationToken cancellationToken);
}
