using Omnux.Middleware;
using System.Text.Json;

namespace Omnux.Middleware.Tests;

public sealed class WebSocketCommandRatePolicyTests
{
    [Theory]
    [InlineData("doctor_get_last", null)]
    [InlineData("plan_list", null)]
    [InlineData("task_graph_list", null)]
    [InlineData("git_automation_snapshot_get", null)]
    [InlineData("telemetry_snapshot_get", null)]
    [InlineData("mcp_servers_list", null)]
    [InlineData("local_llm_snapshot_get", null)]
    [InlineData("terminal_capabilities_get", null)]
    [InlineData("git_time_machine_snapshot_get", null)]
    [InlineData("agent_bus_get", null)]
    [InlineData("agent_watchdog_snapshot_get", null)]
    [InlineData("agent_worktree_snapshot_get", null)]
    [InlineData("multi_agent_trace_snapshot_get", null)]
    [InlineData("semantic_search_readiness_get", null)]
    [InlineData("code_repomap_snapshot_get", null)]
    [InlineData("commit_learning_snapshot_get", null)]
    [InlineData("self_improvement_snapshot_get", null)]
    [InlineData("logic_path_list", null)]
    [InlineData("context_scan", null)]
    [InlineData("commands_list", null)]
    [InlineData("read_workspace_file", null)]
    [InlineData("get_metrics", null)]
    [InlineData("cron", "status")]
    [InlineData("cron", "list")]
    [InlineData("cron", "runs")]
    [InlineData("nodes", "status")]
    [InlineData("nodes", "pending")]
    [InlineData("nodes", "describe")]
    [InlineData("sessions_spawn", "status")]
    public void DashboardReadOnlyMessagesDoNotConsumeCommandRateLimit(string type, string? action)
    {
        Assert.False(WebSocketCommandRatePolicy.ShouldApplyCommandRateLimit(type, action));
    }

    [Theory]
    [InlineData("doctor_run", null)]
    [InlineData("command", null)]
    [InlineData("telegram_stub_command", null)]
    [InlineData("llm_chat_single", null)]
    [InlineData("coding_run_single", null)]
    [InlineData("logic_graph_run", null)]
    [InlineData("git_operation_apply", null)]
    [InlineData("refactor_apply", null)]
    [InlineData("cron", "run")]
    [InlineData("cron", "add")]
    [InlineData("nodes", "invoke")]
    [InlineData("sessions_send", null)]
    public void ExecutionAndMutationMessagesConsumeCommandRateLimit(string type, string? action)
    {
        Assert.True(WebSocketCommandRatePolicy.ShouldApplyCommandRateLimit(type, action));
    }

    [Fact]
    public void RateLimitedErrorPayloadIncludesRequestDiagnostics()
    {
        using var doc = JsonDocument.Parse(WebSocketCommandRatePolicy.BuildRateLimitedErrorJson("cron", "run", 30));
        var root = doc.RootElement;

        Assert.Equal("error", root.GetProperty("type").GetString());
        Assert.Equal("rate_limited", root.GetProperty("message").GetString());
        Assert.Equal("cron", root.GetProperty("requestType").GetString());
        Assert.Equal("run", root.GetProperty("requestAction").GetString());
        Assert.Equal(30, root.GetProperty("limitPerMinute").GetInt32());
        Assert.Equal(60, root.GetProperty("windowSeconds").GetInt32());
    }
}
