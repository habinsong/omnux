using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class AgentSpawnBudgetPolicyTests
{
    [Fact]
    public void Evaluate_AllowsStandardSubagentSpawn()
    {
        var decision = AgentSpawnBudgetPolicy.Evaluate(
            "subagent",
            "run",
            runTimeoutSeconds: 900,
            thread: false,
            taskLength: 120
        );

        Assert.True(decision.Allowed);
        Assert.Equal("subagent_standard", decision.CostClass);
        Assert.Null(decision.Error);
    }

    [Fact]
    public void Evaluate_RejectsSubagentLongTimeout()
    {
        var decision = AgentSpawnBudgetPolicy.Evaluate(
            "subagent",
            "run",
            runTimeoutSeconds: AgentSpawnBudgetPolicy.DefaultMaxRunTimeoutSeconds + 1,
            thread: false,
            taskLength: 120
        );

        Assert.False(decision.Allowed);
        Assert.Equal("subagent_long_timeout", decision.CostClass);
        Assert.Contains("runTimeoutSeconds", decision.Error);
    }

    [Fact]
    public void Evaluate_RejectsAcpSessionLongTimeoutAndLongTask()
    {
        var timeoutDecision = AgentSpawnBudgetPolicy.Evaluate(
            "acp",
            "session",
            runTimeoutSeconds: AgentSpawnBudgetPolicy.AcpSessionMaxTimeoutSeconds + 1,
            thread: true,
            taskLength: 120
        );
        var taskDecision = AgentSpawnBudgetPolicy.Evaluate(
            "acp",
            "session",
            runTimeoutSeconds: 900,
            thread: true,
            taskLength: AgentSpawnBudgetPolicy.HighCostTaskChars + 1
        );

        Assert.False(timeoutDecision.Allowed);
        Assert.Equal("acp_session_timeout", timeoutDecision.CostClass);
        Assert.False(taskDecision.Allowed);
        Assert.Equal("acp_session_task_budget", taskDecision.CostClass);
    }

    [Fact]
    public void Evaluate_AllowsElevatedAcpRunWithinCeiling()
    {
        var decision = AgentSpawnBudgetPolicy.Evaluate(
            "acp",
            "run",
            runTimeoutSeconds: AgentSpawnBudgetPolicy.AcpRunMaxTimeoutSeconds,
            thread: false,
            taskLength: AgentSpawnBudgetPolicy.HighCostTaskChars + 1
        );

        Assert.True(decision.Allowed);
        Assert.Equal("acp_run_elevated", decision.CostClass);
    }
}
