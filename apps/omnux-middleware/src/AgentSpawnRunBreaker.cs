using System.Text;
using System.Text.Json;

namespace Omnux.Middleware;

internal sealed record AgentSpawnRunBreakerDecision(
    bool Blocked,
    string Reason,
    string? Message
);

internal sealed class AgentSpawnRunBreaker
{
    private readonly string _statePath;
    private readonly Func<DateTimeOffset> _utcNow;

    public AgentSpawnRunBreaker(IStatePathResolver pathResolver, Func<DateTimeOffset>? utcNow = null)
        : this(pathResolver.ResolveStateFilePath("agent_spawn_breaker.json"), utcNow)
    {
    }

    public AgentSpawnRunBreaker(string statePath, Func<DateTimeOffset>? utcNow = null)
    {
        _statePath = Path.GetFullPath(statePath);
        _utcNow = utcNow ?? (() => DateTimeOffset.UtcNow);
    }

    public AgentSpawnRunBreakerDecision Evaluate()
    {
        var state = LoadState();
        if (state == null || !state.Enabled)
        {
            return new AgentSpawnRunBreakerDecision(false, "not_enabled", null);
        }

        var now = _utcNow();
        if (state.ExpiresUtc.HasValue && state.ExpiresUtc.Value <= now)
        {
            return new AgentSpawnRunBreakerDecision(false, "expired", null);
        }

        var reason = NormalizeToken(state.Reason, "manual_breaker");
        var message = NormalizeMessage(state.Message)
            ?? $"sessions_spawn run breaker active: {reason}. 신규 스폰과 큐 재시도를 중단했습니다.";
        return new AgentSpawnRunBreakerDecision(true, reason, message);
    }

    private AgentSpawnRunBreakerState? LoadState()
    {
        try
        {
            var json = AtomicFileStore.ReadAllTextWithBackup(
                _statePath,
                IsValidStateJson,
                Encoding.UTF8,
                "agent-spawn-breaker"
            );
            if (string.IsNullOrWhiteSpace(json))
            {
                return null;
            }

            return JsonSerializer.Deserialize(json, OmniJsonContext.Default.AgentSpawnRunBreakerState);
        }
        catch
        {
            return null;
        }
    }

    private static bool IsValidStateJson(string json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return false;
        }

        try
        {
            return JsonSerializer.Deserialize(json, OmniJsonContext.Default.AgentSpawnRunBreakerState) != null;
        }
        catch
        {
            return false;
        }
    }

    private static string NormalizeToken(string? value, string fallback)
    {
        var normalized = (value ?? string.Empty)
            .Replace('\r', ' ')
            .Replace('\n', ' ')
            .Trim();
        return string.IsNullOrWhiteSpace(normalized) ? fallback : normalized;
    }

    private static string? NormalizeMessage(string? value)
    {
        var normalized = (value ?? string.Empty)
            .Replace('\r', ' ')
            .Replace('\n', ' ')
            .Trim();
        return string.IsNullOrWhiteSpace(normalized) ? null : normalized;
    }
}

internal sealed class AgentSpawnRunBreakerState
{
    public bool Enabled { get; set; }
    public string Reason { get; set; } = string.Empty;
    public string? Message { get; set; }
    public DateTimeOffset? ExpiresUtc { get; set; }
}
