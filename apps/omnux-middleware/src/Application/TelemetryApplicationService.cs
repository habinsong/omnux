namespace Omnux.Middleware;

public interface ITelemetryApplicationService
{
    TelemetryActionResult GetSnapshot(TelemetryTraceQuery? query = null);
}

public sealed class TelemetryApplicationService : ITelemetryApplicationService
{
    private readonly TelemetryTracer _tracer;

    public TelemetryApplicationService(TelemetryTracer tracer)
    {
        _tracer = tracer;
    }

    public TelemetryActionResult GetSnapshot(TelemetryTraceQuery? query = null)
    {
        return new TelemetryActionResult(
            true,
            "telemetry snapshot loaded",
            _tracer.GetSnapshot(query)
        );
    }
}
