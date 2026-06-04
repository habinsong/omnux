namespace Omnux.Middleware;

internal static class WebSocketCommandRatePolicy
{
    private static readonly HashSet<string> ReadOnlyMessageTypes = new(StringComparer.Ordinal)
    {
        "agent_bus_get",
        "agent_watchdog_snapshot_get",
        "agent_worktree_snapshot_get",
        "code_repomap_snapshot_get",
        "commands_list",
        "commit_learning_snapshot_get",
        "context_scan",
        "doctor_get_last",
        "get_conversation",
        "get_metrics",
        "get_routines",
        "get_routine_run_detail",
        "get_routine_scheduler_status",
        "git_automation_snapshot_get",
        "git_time_machine_snapshot_get",
        "list_conversations",
        "list_memory_notes",
        "local_llm_snapshot_get",
        "logic_graph_get",
        "logic_graph_list",
        "logic_graph_recovery_list",
        "logic_graph_run_get",
        "logic_path_list",
        "mcp_servers_list",
        "memory_search",
        "multi_agent_trace_snapshot_get",
        "notebook_get",
        "plan_get",
        "plan_list",
        "projects_list",
        "read_memory_note",
        "read_workspace_file",
        "routing_decision_get_last",
        "routing_policy_get",
        "semantic_search_readiness_get",
        "self_improvement_snapshot_get",
        "session_replay_get",
        "sessions_history",
        "sessions_list",
        "skill_get",
        "skills_list",
        "task_graph_get",
        "task_graph_list",
        "task_output_get",
        "telemetry_snapshot_get",
        "terminal_capabilities_get"
    };

    private static readonly HashSet<string> ReadOnlyCronActions = new(StringComparer.OrdinalIgnoreCase)
    {
        "list",
        "runs",
        "status"
    };

    private static readonly HashSet<string> ReadOnlyNodeActions = new(StringComparer.OrdinalIgnoreCase)
    {
        "describe",
        "pending",
        "status"
    };

    internal static bool ShouldApplyCommandRateLimit(string? messageType, string? action)
    {
        var type = (messageType ?? string.Empty).Trim();
        if (ReadOnlyMessageTypes.Contains(type))
        {
            return false;
        }

        if (type.Equals("cron", StringComparison.Ordinal))
        {
            return !ReadOnlyCronActions.Contains((action ?? string.Empty).Trim());
        }

        if (type.Equals("nodes", StringComparison.Ordinal))
        {
            return !ReadOnlyNodeActions.Contains((action ?? string.Empty).Trim());
        }

        if (type.Equals("sessions_spawn", StringComparison.Ordinal))
        {
            return !(action ?? string.Empty).Trim().Equals("status", StringComparison.OrdinalIgnoreCase);
        }

        return true;
    }

    internal static string BuildRateLimitedErrorJson(string? messageType, string? action, int limitPerMinute)
    {
        var requestType = (messageType ?? string.Empty).Trim();
        var requestAction = (action ?? string.Empty).Trim();
        return "{"
            + "\"type\":\"error\","
            + "\"message\":\"rate_limited\","
            + $"\"requestType\":\"{WebSocketGateway.EscapeJson(requestType)}\","
            + $"\"requestAction\":\"{WebSocketGateway.EscapeJson(requestAction)}\","
            + $"\"limitPerMinute\":{Math.Max(1, limitPerMinute)},"
            + "\"windowSeconds\":60"
            + "}";
    }
}
