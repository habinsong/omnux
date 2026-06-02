namespace Omnux.Middleware;

public sealed partial class CommandService
{
    private async Task<string> ExecuteNormalizedCommandRoutingAsync(
        string text,
        string source,
        CancellationToken cancellationToken,
        IReadOnlyList<InputAttachment>? attachments = null,
        IReadOnlyList<string>? webUrls = null,
        bool webSearchEnabled = true,
        Action<string>? streamCallback = null
    )
    {
        RecordEvent($"{source}:user:{text}");
        _auditLogger.Log(source, "command_received", "ok", text);

        // 텔레그램에서 등록한 스킬 별명을 슬래시 명령으로 받았을 때 자연어 호출로 rewrite.
        // 예: "/e 디지털 카메라" + alias e→eli5  =>  "eli5 스킬 사용해서 디지털 카메라"
        if (source.Equals("telegram", StringComparison.OrdinalIgnoreCase) && text.StartsWith("/", StringComparison.Ordinal))
        {
            var rewritten = TryRewriteSlashAliasToSkillInvocation(text);
            if (!string.IsNullOrWhiteSpace(rewritten))
            {
                text = rewritten!;
            }
        }

        if (text.StartsWith("/help", StringComparison.OrdinalIgnoreCase)
            || text.Equals("/start", StringComparison.OrdinalIgnoreCase))
        {
            if (source.Equals("telegram", StringComparison.OrdinalIgnoreCase))
            {
                var helpTopic = ParseHelpTopicFromInput(text);
                return BuildTelegramHelpText(helpTopic);
            }

            return """
                   omnux commands
                   /metrics
                   /doctor
                   /doctor json
                   /plan list
                   /plan create <요청>
                   /plan review <plan-id>
                   /plan approve <plan-id>
                   /plan run <plan-id>
                   /task list
                   /task create <plan-id>
                   /task status <graph-id>
                   /task run <graph-id>
                   /task cancel <graph-id> <task-id>
                   /notebook show [project-key]
                   /notebook append <learning|decision|verification> <내용>
                   /handoff [project-key]
                   /kill <pid>
                   /code <instruction>
                   /profile <talk|code> [low|high]
                   /mode <single|orchestration|multi>
                   /provider <single|orchestration|summary> <groq|gemini|copilot|cerebras|nvidia|codex|auto>
                   /model <single|orchestration|multi.groq|multi.gemini|multi.copilot|multi.cerebras|multi.nvidia|multi.codex> <model-id>
                   /status model
                   /llm status
                   /llm mode <single|orchestration|multi>
                   /llm single provider <groq|gemini|copilot|cerebras|nvidia|codex>
                   /llm single model <model-id>
                   /llm orchestration provider <auto|groq|gemini|copilot|cerebras|nvidia|codex>
                   /llm orchestration model <model-id>
                   /llm multi groq <model-id>
                   /llm multi gemini <model-id>
                   /llm multi copilot <model-id>
                   /llm multi cerebras <model-id>
                   /llm multi nvidia <model-id>
                   /llm multi codex <model-id>
                   /llm multi summary <auto|groq|gemini|copilot|cerebras|nvidia|codex>
                   /help
                   """;
        }

        var telegramDirectResult = await TryHandleTelegramDirectCommandsAsync(
            source,
            text,
            attachments,
            webUrls,
            webSearchEnabled,
            cancellationToken
        );
        if (telegramDirectResult != null)
        {
            return telegramDirectResult;
        }

        // 결함 4번 탈결합: 텔레그램 direct(텔레그램 전용 동작 보존) 다음, 레거시 unified slash 앞에서 consult한다.
        // 텔레그램은 위 direct 경로가 먼저 처리하므로 회귀가 없고, 웹 경로에서만 이관 핸들러가 적용된다.
        // 소유 핸들러가 없으면 null → 아래 레거시 unified slash로 fall-through(strangler-fig).
        var slashRouterResult = await TryHandleViaSlashRouterAsync(text, source, cancellationToken);
        if (slashRouterResult != null)
        {
            return slashRouterResult;
        }

        var unifiedSlashResult = await TryHandleUnifiedSlashCommandAsync(text, source, cancellationToken);
        if (unifiedSlashResult != null)
        {
            return unifiedSlashResult;
        }

        return await ExecutePostUnifiedRoutingAsync(
            source,
            text,
            attachments,
            webUrls,
            webSearchEnabled,
            streamCallback,
            cancellationToken
        );
    }
}
