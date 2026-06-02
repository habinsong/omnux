namespace Omnux.Middleware;

internal sealed record AgentSpawnBudgetDecision(
    bool Allowed,
    string CostClass,
    string? Error,
    string? Note
);

internal static class AgentSpawnBudgetPolicy
{
    public const int DefaultMaxRunTimeoutSeconds = 3_600;
    public const int AcpRunMaxTimeoutSeconds = 7_200;
    public const int AcpSessionMaxTimeoutSeconds = 1_800;
    public const int HighCostTaskChars = 2_400;

    public static AgentSpawnBudgetDecision Evaluate(
        string runtime,
        string mode,
        int runTimeoutSeconds,
        bool thread,
        int taskLength
    )
    {
        var normalizedRuntime = Normalize(runtime, "subagent");
        var normalizedMode = Normalize(mode, thread ? "session" : "run");
        var timeout = Math.Max(0, runTimeoutSeconds);
        var length = Math.Max(0, taskLength);

        if (timeout > DefaultMaxRunTimeoutSeconds && normalizedRuntime != "acp")
        {
            return Reject(
                "subagent_long_timeout",
                $"sessions_spawn budget rejected: subagent runTimeoutSeconds must be <= {DefaultMaxRunTimeoutSeconds}."
            );
        }

        if (normalizedRuntime != "acp")
        {
            return Allow(
                timeout > 1_800 || length > HighCostTaskChars ? "subagent_elevated" : "subagent_standard",
                "spawn budget: subagent standard lane accepted."
            );
        }

        if (normalizedMode == "session")
        {
            if (!thread)
            {
                return Reject("acp_session_without_thread", "sessions_spawn budget rejected: acp session requires thread=true.");
            }

            if (timeout > AcpSessionMaxTimeoutSeconds)
            {
                return Reject(
                    "acp_session_timeout",
                    $"sessions_spawn budget rejected: acp session runTimeoutSeconds must be <= {AcpSessionMaxTimeoutSeconds}."
                );
            }

            if (length > HighCostTaskChars)
            {
                return Reject(
                    "acp_session_task_budget",
                    $"sessions_spawn budget rejected: acp session task must be <= {HighCostTaskChars} characters."
                );
            }

            return Allow("acp_session_controlled", "spawn budget: acp session controlled lane accepted.");
        }

        if (timeout > AcpRunMaxTimeoutSeconds)
        {
            return Reject(
                "acp_run_timeout",
                $"sessions_spawn budget rejected: acp run runTimeoutSeconds must be <= {AcpRunMaxTimeoutSeconds}."
            );
        }

        return Allow(
            timeout > DefaultMaxRunTimeoutSeconds || length > HighCostTaskChars ? "acp_run_elevated" : "acp_run_standard",
            "spawn budget: acp run lane accepted."
        );
    }

    private static AgentSpawnBudgetDecision Allow(string costClass, string note) =>
        new(true, costClass, null, note);

    private static AgentSpawnBudgetDecision Reject(string costClass, string error) =>
        new(false, costClass, error, null);

    private static string Normalize(string? value, string fallback)
    {
        var normalized = (value ?? string.Empty).Trim().ToLowerInvariant();
        return string.IsNullOrWhiteSpace(normalized) ? fallback : normalized;
    }
}
