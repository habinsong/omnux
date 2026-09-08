using System.Text;

namespace Omnux.Middleware;

internal static class TaskExecutionContext
{
    public static CodingRunRequest CreateCodingRequest(TaskGraphSnapshot snapshot, TaskNode node, string source)
    {
        // 코딩 단계는 직렬 실행된다. 같은 그래프의 대화를 이어받아 이전 작업 폴더를 재사용한다.
        // 실행 기록에서 복원하므로 실패 후 재시도와 프로세스 재시작에서도 문맥이 이어진다.
        var conversationId = ResolveConversationId(snapshot, node);
        return new CodingRunRequest(
            BuildPrompt(snapshot, node), source, "coding", "orchestration", conversationId,
            $"[task] {snapshot.Graph.SourcePlanId}", "task-graph", node.Category,
            new[] { "task-graph", snapshot.Graph.GraphId, node.TaskId }, null, null, "auto", null,
            GrokModel: null
        );
    }

    public static string? ResolveConversationId(TaskGraphSnapshot snapshot, TaskNode node)
        => snapshot.Executions
            .Where(execution => execution.ExecutorKind == "coding_orchestration"
                && !string.IsNullOrWhiteSpace(execution.ConversationId))
            .OrderByDescending(execution => execution.TaskId == node.TaskId)
            .ThenByDescending(execution => execution.StartedAtUtc)
            .Select(execution => execution.ConversationId)
            .FirstOrDefault();

    public static string BuildPrompt(TaskGraphSnapshot snapshot, TaskNode node)
    {
        var prompt = new StringBuilder(node.Prompt);
        foreach (var dependency in snapshot.Graph.Nodes.Where(item => node.DependsOn.Contains(item.TaskId)))
        {
            prompt.AppendLine().AppendLine().AppendLine($"선행 작업: {dependency.Title}");
            if (!string.IsNullOrWhiteSpace(dependency.OutputSummary)) prompt.AppendLine(dependency.OutputSummary);
            if (!string.IsNullOrWhiteSpace(dependency.ArtifactPath)) prompt.AppendLine($"결과 파일: {dependency.ArtifactPath}");
        }
        return prompt.ToString();
    }
}
