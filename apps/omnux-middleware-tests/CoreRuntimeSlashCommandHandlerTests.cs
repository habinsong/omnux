using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class CoreRuntimeSlashCommandHandlerTests
{
    [Fact]
    public void CanHandleMatchesOnlyExplicitCoreRuntimeSlashCommands()
    {
        var handler = CreateHandler();

        Assert.True(handler.CanHandle(new SlashCommandContext("/metrics", "web")));
        Assert.True(handler.CanHandle(new SlashCommandContext("/kill 123", "web")));
        Assert.False(handler.CanHandle(new SlashCommandContext("/metrics summary", "web")));
        Assert.False(handler.CanHandle(new SlashCommandContext("/kill abc", "web")));
        Assert.False(handler.CanHandle(new SlashCommandContext("/routine list", "web")));
    }

    [Fact]
    public async Task MetricsReadsCoreRuntimeAndRecordsAudit()
    {
        var events = new List<string>();
        var auditPath = Path.Combine(Path.GetTempPath(), $"omnux-core-runtime-slash-{Guid.NewGuid():N}", "audit.log");
        var handler = CreateHandler(recordEvent: events.Add, auditPath: auditPath);

        var result = await handler.HandleAsync(new SlashCommandContext("/metrics", "web"), CancellationToken.None);

        Assert.Equal("status=ok cpu_usage=1.00 mem_free_mb=2048", result);
        Assert.Contains("web:core:status=ok cpu_usage=1.00 mem_free_mb=2048", events);
        var audit = File.ReadAllText(auditPath);
        Assert.Contains("\"source\":\"web\"", audit);
        Assert.Contains("\"action\":\"metrics\"", audit);
        Assert.Contains("\"status\":\"ok\"", audit);
    }

    private static CoreRuntimeSlashCommandHandler CreateHandler(
        Action<string>? recordEvent = null,
        string? auditPath = null
    )
    {
        return new CoreRuntimeSlashCommandHandler(
            new FakeCoreRuntimeClient(),
            new AuditLogger(auditPath ?? Path.Combine(Path.GetTempPath(), $"omnux-core-runtime-slash-{Guid.NewGuid():N}", "audit.log")),
            null,
            recordEvent ?? (_ => { })
        );
    }

    private sealed class FakeCoreRuntimeClient : ICoreRuntimeClient
    {
        public Task<string> GetMetricsAsync(CancellationToken cancellationToken)
        {
            return Task.FromResult("status=ok cpu_usage=1.00 mem_free_mb=2048");
        }

        public Task<string> KillAsync(int pid, CancellationToken cancellationToken)
        {
            return Task.FromResult($"status=ok killed_pid={pid}");
        }
    }
}
