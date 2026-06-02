using System.Text.RegularExpressions;

namespace Omnux.Middleware;

public sealed partial class CommandService
{
    private async Task<string?> TryHandleTelegramUrlFastPathAsync(
        string requestText,
        string effectiveTopicInput,
        IReadOnlyList<string> resolvedWebUrls,
        SessionContext session,
        string? telegramStateKey,
        bool thinkPlusActiveForTelegram,
        string snapshotMode,
        Action<ChatStreamUpdate>? telegramChatStream,
        CancellationToken cancellationToken
    )
    {
        if (resolvedWebUrls.Count == 0
            || snapshotMode != "single"
            || !_llmRouter.HasGeminiApiKey()
            || thinkPlusActiveForTelegram)
        {
            return null;
        }

        var isSkillContextQuery = LooksLikeProjectContextRequest(requestText)
            || LooksLikeSkillCreationRequest(requestText)
            || LooksLikeSkillDeactivationRequest(requestText)
            || Regex.IsMatch(requestText, @"(?i)(스킬|skill|skills|skill\.md).*(목록|리스트|뭐|보여|알려|어떤|종류|있어|있니|돼)");
        if (isSkillContextQuery)
        {
            return null;
        }

        var allowMarkdownTable = SearchQueryPolicy.LooksLikeTableRenderRequest(effectiveTopicInput);
        var memoryHint = BuildSafeWebMemoryPreferenceHint(
            telegramStateKey ?? string.Empty,
            effectiveTopicInput,
            session.LinkedMemoryNotes
        );
        var urlSingle = await GenerateGeminiUrlContextAnswerDetailedAsync(
            effectiveTopicInput,
            resolvedWebUrls,
            memoryHint,
            allowMarkdownTable,
            enforceTelegramOutputStyle: true,
            streamCallback: telegramChatStream,
            scope: session.Scope,
            mode: session.Mode,
            conversationId: session.Thread.Id,
            decisionPath: "heuristic_url_context",
            decisionMs: 0,
            cancellationToken
        );
        var urlResponseText = AppendTelegramResponseFooter(
            FormatTelegramResponse(urlSingle.Response.Text, TelegramMaxResponseChars),
            urlSingle.Response.Provider,
            urlSingle.Response.Model,
            telegramStateKey,
            "url"
        );
        var urlAssistantMeta = $"telegram-single:{urlSingle.Response.Provider}:{urlSingle.Response.Model}:gemini-url-single";
        return await FinalizeTelegramChatResponseAsync(
            session,
            requestText,
            urlResponseText,
            urlAssistantMeta,
            urlSingle.Response.Provider,
            urlSingle.Response.Model,
            thinkPlusToggleNote: string.Empty,
            guardFailure: null,
            0,
            0,
            "-",
            cancellationToken
        );
    }
}
