using System.Text;

namespace Omnux.Middleware;

/// <summary>
/// <c>/task</c> 텍스트 명령 핸들러. <see cref="ITaskGraphApplicationService"/>와 순수 포맷터/정책만
/// 의존하며 CommandService private state에 의존하지 않는다(결함 4번 탈결합).
/// 기존 <c>CommandService.ExecuteTaskSlashCommandAsync</c> 동작을 동일하게 재현한다.
/// </summary>
internal sealed class TaskSlashCommandHandler : ISlashCommandHandler
{
    private const string HelpText =
        """
        [작업 명령]
        자연어 예시:
        - "작업 목록 보여줘"
        - "작업 상태 graph_20260308123500001"
        - "작업 실행 graph_20260308123500001"

        정확히 제어할 때:
        /task list
        /task create <plan-id>
        /task status <graph-id>
        /task run <graph-id>
        /task cancel <graph-id> <task-id>
        /task output <graph-id> <task-id>
        """;

    private readonly ITaskGraphApplicationService _taskGraphService;

    public TaskSlashCommandHandler(ITaskGraphApplicationService taskGraphService)
    {
        _taskGraphService = taskGraphService;
    }

    public bool CanHandle(SlashCommandContext context)
    {
        return UnifiedSlashCommandPolicy.Parse(context.Text)?.Kind == UnifiedSlashCommandKind.Task;
    }

    public async Task<string> HandleAsync(SlashCommandContext context, CancellationToken cancellationToken)
    {
        var isTelegram = string.Equals(context.Source, "telegram", StringComparison.OrdinalIgnoreCase);
        var tokens = (context.Text ?? string.Empty)
            .Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        if (tokens.Length <= 1 || tokens[1].Equals("help", StringComparison.OrdinalIgnoreCase))
        {
            return HelpText;
        }

        var action = tokens[1].Trim().ToLowerInvariant();
        if (action == "list")
        {
            return FormatTaskGraphList(_taskGraphService.ListTaskGraphs());
        }

        if (action == "create")
        {
            if (tokens.Length < 3)
            {
                return "사용법: /task create <plan-id>";
            }

            return FormatTaskGraphActionResult(_taskGraphService.CreateTaskGraph(tokens[2]));
        }

        if (action == "status" || action == "get")
        {
            if (tokens.Length < 3)
            {
                return "사용법: /task status <graph-id>";
            }

            var snapshot = _taskGraphService.GetTaskGraph(tokens[2]);
            return snapshot == null
                ? "Task graph를 찾을 수 없습니다."
                : FormatTaskGraphSnapshot(snapshot);
        }

        if (action == "run")
        {
            if (tokens.Length < 3)
            {
                return "사용법: /task run <graph-id>";
            }

            var result = await _taskGraphService.RunTaskGraphAsync(tokens[2], "web", null, cancellationToken);
            return FormatTaskGraphActionResult(result);
        }

        if (action == "cancel")
        {
            if (tokens.Length < 4)
            {
                return "사용법: /task cancel <graph-id> <task-id>";
            }

            return FormatTaskGraphActionResult(_taskGraphService.CancelTask(tokens[2], tokens[3]));
        }

        if (action == "output")
        {
            if (tokens.Length < 4)
            {
                return "사용법: /task output <graph-id> <task-id>";
            }

            var output = _taskGraphService.GetTaskOutput(tokens[2], tokens[3]);
            return output == null
                ? "Task output을 찾을 수 없습니다."
                : FormatTaskOutput(output, isTelegram);
        }

        return "알 수 없는 /task 명령입니다. /task help를 확인하세요.";
    }

    private static string FormatTaskGraphList(TaskGraphListResult result)
    {
        if (result.Items.Count == 0)
        {
            return "저장된 Task graph가 없습니다.";
        }

        var builder = new StringBuilder();
        builder.AppendLine($"task graphs: {result.Items.Count}");
        foreach (var item in result.Items.Take(12))
        {
            builder.AppendLine(
                $"- {item.GraphId} plan={item.SourcePlanId} status={item.Status} done={item.CompletedNodes}/{item.TotalNodes} fail={item.FailedNodes} running={item.RunningNodes}"
            );
        }

        return builder.ToString().TrimEnd();
    }

    private static string FormatTaskGraphActionResult(TaskGraphActionResult result)
    {
        if (!result.Ok)
        {
            return $"error: {result.Message}";
        }

        if (result.Snapshot == null)
        {
            return result.Message;
        }

        return $"{result.Message}\n{FormatTaskGraphSnapshot(result.Snapshot)}";
    }

    private static string FormatTaskGraphSnapshot(TaskGraphSnapshot snapshot)
    {
        var builder = new StringBuilder();
        builder.AppendLine(
            $"graph={snapshot.Graph.GraphId} plan={snapshot.Graph.SourcePlanId} status={snapshot.Graph.Status} nodes={snapshot.Graph.Nodes.Count}"
        );
        foreach (var node in snapshot.Graph.Nodes)
        {
            var dependsOn = node.DependsOn.Count == 0 ? "-" : string.Join(",", node.DependsOn);
            builder.AppendLine($"- {node.TaskId} [{node.Status}] {node.Category} deps={dependsOn} title={node.Title}");
            if (!string.IsNullOrWhiteSpace(node.OutputSummary))
            {
                builder.AppendLine($"  summary: {SlashCommandTextFormat.Trim(node.OutputSummary, 200)}");
            }

            if (!string.IsNullOrWhiteSpace(node.Error))
            {
                builder.AppendLine($"  error: {SlashCommandTextFormat.Trim(node.Error, 160)}");
            }
        }

        return builder.ToString().TrimEnd();
    }

    private static string FormatTaskOutput(TaskOutputResult output, bool mobileHandoff = false)
    {
        if (mobileHandoff)
        {
            var rawOutput = BuildRawTaskOutputText(output);
            if (TelegramCommandHandoffPolicy.ShouldUseCommandHandoff(rawOutput))
            {
                return TelegramCommandHandoffPolicy.BuildCommandHandoffText(
                    "작업 출력",
                    $"graph={output.GraphId} task={output.TaskId}",
                    rawOutput,
                    new[]
                    {
                        $"/task status {output.GraphId}",
                        $"/task output {output.GraphId} {output.TaskId}",
                        "/handoff"
                    }
                );
            }
        }

        var builder = new StringBuilder();
        builder.AppendLine($"graph={output.GraphId} task={output.TaskId}");
        if (output.Execution != null)
        {
            builder.AppendLine(
                $"status={output.Execution.Status} executor={output.Execution.ExecutorKind} started={output.Execution.StartedAtUtc:O}"
            );
        }

        if (!string.IsNullOrWhiteSpace(output.StdOut))
        {
            builder.AppendLine("[stdout]");
            builder.AppendLine(SlashCommandTextFormat.Trim(output.StdOut, 1200));
        }

        if (!string.IsNullOrWhiteSpace(output.StdErr))
        {
            builder.AppendLine("[stderr]");
            builder.AppendLine(SlashCommandTextFormat.Trim(output.StdErr, 1200));
        }

        if (!string.IsNullOrWhiteSpace(output.ResultJson))
        {
            builder.AppendLine("[result]");
            builder.AppendLine(SlashCommandTextFormat.Trim(output.ResultJson, 1200));
        }

        return builder.ToString().TrimEnd();
    }

    private static string BuildRawTaskOutputText(TaskOutputResult output)
    {
        var builder = new StringBuilder();
        builder.AppendLine($"graph={output.GraphId} task={output.TaskId}");
        if (output.Execution != null)
        {
            builder.AppendLine(
                $"status={output.Execution.Status} executor={output.Execution.ExecutorKind} started={output.Execution.StartedAtUtc:O}"
            );
        }

        if (!string.IsNullOrWhiteSpace(output.StdOut))
        {
            builder.AppendLine("[stdout]");
            builder.AppendLine(output.StdOut.Trim());
        }

        if (!string.IsNullOrWhiteSpace(output.StdErr))
        {
            builder.AppendLine("[stderr]");
            builder.AppendLine(output.StdErr.Trim());
        }

        if (!string.IsNullOrWhiteSpace(output.ResultJson))
        {
            builder.AppendLine("[result]");
            builder.AppendLine(output.ResultJson.Trim());
        }

        return builder.ToString().TrimEnd();
    }
}
