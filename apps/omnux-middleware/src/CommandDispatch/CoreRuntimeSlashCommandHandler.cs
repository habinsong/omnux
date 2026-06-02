namespace Omnux.Middleware;

internal sealed class CoreRuntimeSlashCommandHandler : ISlashCommandHandler
{
    private readonly ICoreRuntimeClient _coreClient;
    private readonly AuditLogger _auditLogger;
    private readonly string? _killAllowlistCsv;
    private readonly Action<string> _recordEvent;

    public CoreRuntimeSlashCommandHandler(
        ICoreRuntimeClient coreClient,
        AuditLogger auditLogger,
        string? killAllowlistCsv,
        Action<string> recordEvent
    )
    {
        _coreClient = coreClient;
        _auditLogger = auditLogger;
        _killAllowlistCsv = killAllowlistCsv;
        _recordEvent = recordEvent;
    }

    public bool CanHandle(SlashCommandContext context)
    {
        var text = (context.Text ?? string.Empty).Trim();
        return text.Equals("/metrics", StringComparison.OrdinalIgnoreCase)
            || KillCommandPolicy.TryParse(text, out _);
    }

    public async Task<string> HandleAsync(SlashCommandContext context, CancellationToken cancellationToken)
    {
        var source = string.IsNullOrWhiteSpace(context.Source) ? "web" : context.Source;
        var text = (context.Text ?? string.Empty).Trim();
        if (text.Equals("/metrics", StringComparison.OrdinalIgnoreCase))
        {
            var metrics = await _coreClient.GetMetricsAsync(cancellationToken);
            _recordEvent($"{source}:core:{metrics}");
            _auditLogger.Log(source, "metrics", "ok", metrics);
            return metrics;
        }

        if (!KillCommandPolicy.TryParse(text, out var pid))
        {
            return "unsupported core runtime command";
        }

        var guard = await KillTargetGuardPolicy.ValidateAsync(pid, source, _killAllowlistCsv, cancellationToken);
        if (!guard.Allowed)
        {
            _auditLogger.Log(source, "kill", "deny", $"pid={pid} reason={guard.Reason}");
            return $"kill denied: {guard.Reason}";
        }

        var result = await _coreClient.KillAsync(pid, cancellationToken);
        _recordEvent($"{source}:core:{result}");
        _auditLogger.Log(source, "kill", "ok", $"pid={pid}");
        return result;
    }
}
