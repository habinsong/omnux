namespace Omnux.Middleware;

public sealed partial class CommandService
{
    private readonly record struct TelegramThinkPlusToggleResult(
        string RequestText,
        string ToggleNote,
        string? ImmediateResponse
    );

    private async Task<TelegramThinkPlusToggleResult> ApplyTelegramThinkPlusToggleAsync(
        string requestText,
        SessionContext session,
        string telegramStateKey,
        CancellationToken cancellationToken
    )
    {
        var rawIncomingText = requestText ?? string.Empty;
        var thinkPlusToggleNote = string.Empty;
        var hasActivationKeyword = LooksLikeThinkPlusActivation(rawIncomingText);
        var hasDeactivationKeyword = LooksLikeThinkPlusDeactivation(rawIncomingText);

        if (hasActivationKeyword && !hasDeactivationKeyword)
        {
            if (!IsThinkPlusActiveForThread(telegramStateKey))
            {
                SetThinkPlusForThread(telegramStateKey, true);
                thinkPlusToggleNote = "[추론 모드 활성화] 지금부터 모든 메시지에 대해 최신 웹 검색 결과를 참고해 답변합니다. 끄려면 \"추론 모드 꺼\"라고 말하세요.";
            }
        }
        else if (hasDeactivationKeyword)
        {
            if (IsThinkPlusActiveForThread(telegramStateKey))
            {
                SetThinkPlusForThread(telegramStateKey, false);
                thinkPlusToggleNote = "[추론 모드 비활성화] 일반 모드로 돌아갑니다.";
            }
        }

        if (string.IsNullOrEmpty(thinkPlusToggleNote))
        {
            return new TelegramThinkPlusToggleResult(rawIncomingText, string.Empty, null);
        }

        var stripped = ThinkPlusActivationRegex.Replace(rawIncomingText, " ");
        stripped = ThinkPlusDeactivationRegex.Replace(stripped, " ");
        stripped = System.Text.RegularExpressions.Regex.Replace(stripped, @"\s+", " ").Trim();
        if (stripped.Length >= 6)
        {
            return new TelegramThinkPlusToggleResult(stripped, thinkPlusToggleNote, null);
        }

        _conversationStore.AppendMessage(session.Thread.Id, "user", rawIncomingText, "telegram:user");
        _conversationStore.AppendMessage(session.Thread.Id, "assistant", thinkPlusToggleNote, "telegram:think_plus_toggle");
        await EnsureConversationTitleFromFirstTurnAsync(session.Thread.Id, "system", "-", cancellationToken);
        SetCurrentTelegramExecutionMetadata(null, 0, 0, "-");
        _auditLogger.Log(
            "telegram",
            "think_plus_toggle",
            IsThinkPlusActiveForThread(telegramStateKey) ? "on" : "off",
            $"thread={session.Thread.Id} stateKey={telegramStateKey} bare_toggle=true"
        );

        return new TelegramThinkPlusToggleResult(rawIncomingText, thinkPlusToggleNote, thinkPlusToggleNote);
    }
}
