namespace Omnux.Middleware;

public sealed partial class CommandService
{
    private ConversationChatResult HandleNotebookAppendRequest(
        SessionContext session,
        ChatRequest request,
        string rawInput,
        AskNotebookAppendRequest appendRequest
    )
    {
        NotebookActionResult result;
        try
        {
            result = _notebookService.AppendEntry(
                request.Project,
                appendRequest.Kind,
                appendRequest.Content
            );
        }
        catch (Exception ex)
        {
            _auditLogger.Log(
                request.Source,
                "ask_notebook_append",
                "exception",
                ex.Message
            );
            result = new NotebookActionResult(
                false,
                "노트북 저장 중 오류가 발생했습니다.",
                null
            );
        }

        var projectKey = result.Snapshot?.Notebook.ProjectKey ?? request.Project;
        var action = new AskNotebookAction(
            result.Ok,
            appendRequest.Kind,
            result.Message,
            projectKey
        );
        var responseText = result.Ok
            ? $"노트북의 {ResolveNotebookKindLabel(appendRequest.Kind)} 항목에 기록했습니다."
            : $"노트북에 기록하지 못했습니다. {result.Message}";

        _conversationStore.AppendMessage(
            session.Thread.Id,
            "user",
            rawInput,
            "local:notebook_append"
        );
        _conversationStore.AppendMessage(
            session.Thread.Id,
            "assistant",
            responseText,
            "local:notebook_append"
        );
        _auditLogger.Log(
            request.Source,
            "ask_notebook_append",
            result.Ok ? "ok" : "error",
            $"kind={appendRequest.Kind} project={projectKey ?? "-"}"
        );

        var updated = _conversationStore.Get(session.Thread.Id) ?? session.Thread;
        return new ConversationChatResult(
            "single",
            updated.Id,
            "local",
            "notebook",
            responseText,
            "local:notebook_append",
            updated,
            null,
            RequestId: request.RequestId,
            NotebookAction: action
        );
    }

    private static string ResolveNotebookKindLabel(string kind)
    {
        return kind switch
        {
            "decision" => "결정",
            "verification" => "검증",
            _ => "학습"
        };
    }
}
