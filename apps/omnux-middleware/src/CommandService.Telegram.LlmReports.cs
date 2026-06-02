namespace Omnux.Middleware;

public sealed partial class CommandService
{
    private async Task<string> BuildTelegramLlmStatusAsync(CancellationToken cancellationToken)
    {
        TelegramLlmPreferences snapshot;
        lock (_telegramLlmLock)
        {
            snapshot = _telegramLlmPreferences.Clone();
        }

        var quota = GetTelegramUpgradeQuotaSnapshot();
        var copilotStatus = await _copilotWrapper.GetStatusAsync(cancellationToken);
        var toolSnapshot = _toolRegistry.GetAvailabilitySnapshot();
        var enabledTools = toolSnapshot
            .Where(item => item.Enabled)
            .Select(item => item.ToolId)
            .ToArray();
        var pendingTools = toolSnapshot
            .Where(item => !item.Enabled)
            .Select(item => $"{item.ToolId}({item.Reason})")
            .ToArray();

        var enabledText = enabledTools.Length == 0 ? "(none)" : string.Join(", ", enabledTools);
        var pendingText = pendingTools.Length == 0 ? "(none)" : string.Join(", ", pendingTools);

        var statusBody = $"""
                {BuildChannelModelStatus("telegram")}

                [부가 상태]
                프로필: {snapshot.Profile}
                thinking.talk: {snapshot.TalkThinkingLevel}
                thinking.code: {snapshot.CodeThinkingLevel}
                qwen 업그레이드 사용량: {quota.Used}/{quota.Cap} (day={quota.DayKey})
                Copilot 상태: {copilotStatus.Mode} / {(copilotStatus.Authenticated ? "authenticated" : "unauthenticated")}
                사용 가능 도구: {enabledText}
                대기 중 도구: {pendingText}
                """;

        // single chat provider 빠른 전환 버튼.
        return AppendTelegramInlineButtons(
            statusBody,
            ("/llm single provider groq", "Groq"),
            ("/llm single provider gemini", "Gemini"),
            ("/llm single provider cerebras", "Cerebras"),
            ("/llm single provider nvidia", "NVIDIA"),
            ("/llm single provider copilot", "Copilot")
        );
    }

    // /llm models·usage 리포트 본문은 LlmControlApplicationService로 이관됨(결함 4번 M4).
    // 텔레그램 LLM control 경로가 여전히 호출하므로 thin wrapper로 위임을 유지한다.
    private Task<string> BuildTelegramModelsReportAsync(string target, CancellationToken cancellationToken)
        => _llmControlApplicationService.BuildModelsReportAsync(target, cancellationToken);

    private Task<string> BuildTelegramUsageReportAsync(CancellationToken cancellationToken)
        => _llmControlApplicationService.BuildUsageReportAsync(cancellationToken);
}
