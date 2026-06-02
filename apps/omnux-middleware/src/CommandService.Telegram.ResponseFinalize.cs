namespace Omnux.Middleware;

public sealed partial class CommandService
{
    private async Task<string> FinalizeTelegramChatResponseAsync(
        SessionContext session,
        string requestText,
        string responseText,
        string assistantMeta,
        string providerForMemory,
        string modelForMemory,
        string? thinkPlusToggleNote,
        SearchAnswerGuardFailure? guardFailure,
        int retryAttempt,
        int retryMaxAttempts,
        string retryStopReason,
        CancellationToken cancellationToken
    )
    {
        responseText = ApplyThinkPlusToggleNoteIfAny(thinkPlusToggleNote, responseText);
        _conversationStore.AppendMessage(session.Thread.Id, "user", requestText, "telegram:user");
        _conversationStore.AppendMessage(session.Thread.Id, "assistant", responseText, assistantMeta);
        await EnsureConversationTitleFromFirstTurnAsync(session.Thread.Id, providerForMemory, modelForMemory, cancellationToken);
        _ = await MaybeCompressConversationAsync(session.Thread.Id, "chat-single", providerForMemory, modelForMemory, cancellationToken);

        var guardCategory = NormalizeForcedGuardCategory(guardFailure?.Category.ToString());
        var guardReason = NormalizeForcedGuardReason(guardFailure?.ReasonCode);
        var guardDetail = NormalizeForcedToolValue(guardFailure?.Detail, "-");
        _auditLogger.Log(
            "telegram",
            "telegram_guard_meta",
            guardFailure is null ? "ok" : "blocked",
            $"route={NormalizeAuditToken(assistantMeta, "-")} guardCategory={guardCategory} guardReason={guardReason} guardDetail={guardDetail}"
        );
        SetCurrentTelegramExecutionMetadata(
            guardFailure,
            retryAttempt,
            retryMaxAttempts,
            retryStopReason
        );
        return responseText;
    }
}
