using System.Text;

namespace Omnux.Middleware;

/// <summary>
/// <c>/notebook</c> 텍스트 명령 핸들러. <see cref="INotebookApplicationService"/>와 순수 포맷터만
/// 의존하며 CommandService private state에 의존하지 않는다(결함 4번 탈결합).
/// </summary>
internal sealed class NotebookSlashCommandHandler : ISlashCommandHandler
{
    private const string HelpText =
        """
        [노트북 명령]
        자연어 예시:
        - "노트북 보여줘"
        - "노트북에 decision 계획은 task graph로 실행한다고 기록해줘"
        - "인수인계 문서 만들어줘"

        정확히 제어할 때:
        /notebook show [project-key]
        /notebook append <learning|decision|verification> <내용>
        /handoff [project-key]
        """;

    private readonly INotebookApplicationService _notebookService;

    public NotebookSlashCommandHandler(INotebookApplicationService notebookService)
    {
        _notebookService = notebookService;
    }

    public bool CanHandle(SlashCommandContext context)
    {
        return UnifiedSlashCommandPolicy.Parse(context.Text)?.Kind == UnifiedSlashCommandKind.Notebook;
    }

    public async Task<string> HandleAsync(SlashCommandContext context, CancellationToken cancellationToken)
    {
        var tokens = (context.Text ?? string.Empty)
            .Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        if (tokens.Length <= 1 || tokens[1].Equals("help", StringComparison.OrdinalIgnoreCase))
        {
            return HelpText;
        }

        var action = tokens[1].Trim().ToLowerInvariant();
        if (action is "show" or "get")
        {
            var result = await _notebookService.GetNotebookAsync(tokens.Length >= 3 ? tokens[2] : null, cancellationToken);
            return FormatNotebookActionResult(result);
        }

        if (action == "append")
        {
            if (tokens.Length < 4)
            {
                return "사용법: /notebook append <learning|decision|verification> <내용>";
            }

            var kind = tokens[2].Trim().ToLowerInvariant();
            var content = string.Join(' ', tokens.Skip(3)).Trim();
            NotebookActionResult result = kind switch
            {
                "learning" => await _notebookService.AppendLearningAsync(null, content, cancellationToken),
                "decision" => await _notebookService.AppendDecisionAsync(null, content, cancellationToken),
                "verification" => await _notebookService.AppendVerificationAsync(null, content, cancellationToken),
                _ => new NotebookActionResult(false, "kind는 learning, decision, verification 중 하나여야 합니다.", null)
            };
            return FormatNotebookActionResult(result);
        }

        return "알 수 없는 /notebook 명령입니다. /notebook help를 확인하세요.";
    }

    internal static string FormatNotebookActionResult(NotebookActionResult result)
    {
        if (!result.Ok)
        {
            return $"error: {result.Message}";
        }

        if (result.Snapshot == null)
        {
            return result.Message;
        }

        return $"{result.Message}\n{FormatNotebookSnapshot(result.Snapshot)}";
    }

    private static string FormatNotebookSnapshot(ProjectNotebookSnapshot snapshot)
    {
        var builder = new StringBuilder();
        builder.AppendLine($"projectKey={snapshot.Notebook.ProjectKey}");
        builder.AppendLine($"rootPath={snapshot.Notebook.RootPath}");
        builder.AppendLine($"readAt={snapshot.ReadAtUtc}");
        AppendDocumentSummary(builder, "learnings", snapshot.Learnings);
        AppendDocumentSummary(builder, "decisions", snapshot.Decisions);
        AppendDocumentSummary(builder, "verification", snapshot.Verification);
        AppendDocumentSummary(builder, "handoff", snapshot.Handoff);
        return builder.ToString().TrimEnd();
    }

    private static void AppendDocumentSummary(StringBuilder builder, string label, NotebookDocumentSnapshot document)
    {
        builder.AppendLine(
            $"- {label}: exists={(document.Exists ? "yes" : "no")} size={document.SizeBytes} updated={document.UpdatedAtUtc}"
        );
        if (!string.IsNullOrWhiteSpace(document.Preview))
        {
            builder.AppendLine($"  preview: {SlashCommandTextFormat.Trim(document.Preview.Replace('\n', ' '), 220)}");
        }
    }
}
