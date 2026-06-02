using System.Text.RegularExpressions;
using Omnux.Middleware.Infrastructure.Telegram;

namespace Omnux.Middleware;

public sealed partial class CommandService
{
    private async Task<string?> TryHandleTelegramLlmControlCommandAsync(string text, CancellationToken cancellationToken)
    {
        if (!TelegramLlmControlCommandParser.IsControlCommand(text))
        {
            return null;
        }

        var command = TelegramLlmControlCommandParser.Parse(text);
        return await ExecuteTelegramLlmControlCommandBoundaryAsync(new TelegramLlmControlCommandRequest(command), cancellationToken);
    }

    private async Task<string?> TryHandleTelegramNaturalControlCommandAsync(
        string text,
        IReadOnlyList<InputAttachment>? attachments,
        IReadOnlyList<string>? webUrls,
        bool webSearchEnabled,
        CancellationToken cancellationToken
    )
    {
        var normalized = (text ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return null;
        }

        var lowered = normalized.ToLowerInvariant();
        if (ContainsAny(lowered, "최근 답변 노트북", "마지막 답변 노트북", "최근 응답 노트북", "save last answer to notebook"))
        {
            var latest = TryBuildLastTelegramAssistantNotebookAppend();
            return string.IsNullOrWhiteSpace(latest)
                ? "저장할 최근 텔레그램 답변이 없습니다."
                : await ExecuteTelegramPseudoCommandAsync(latest, attachments, webUrls, webSearchEnabled, cancellationToken);
        }

        if (ContainsAny(lowered, "최근 코딩 결과 노트북", "코딩 결과 노트북", "save coding result to notebook"))
        {
            var latestCoding = TryBuildLatestTelegramCodingNotebookAppend();
            return string.IsNullOrWhiteSpace(latestCoding)
                ? "저장할 최근 텔레그램 코딩 결과가 없습니다."
                : await ExecuteTelegramPseudoCommandAsync(latestCoding, attachments, webUrls, webSearchEnabled, cancellationToken);
        }

        if (ContainsAny(lowered, "최근 답변 계획", "마지막 답변 계획", "최근 응답 계획", "최근 답변으로 계획", "마지막 답변으로 계획", "plan from last answer"))
        {
            var latestPlan = TryBuildLastTelegramAssistantPlanCreate();
            return string.IsNullOrWhiteSpace(latestPlan)
                ? "계획으로 만들 최근 텔레그램 답변이 없습니다."
                : await ExecuteTelegramPseudoCommandAsync(latestPlan, attachments, webUrls, webSearchEnabled, cancellationToken);
        }

        if (ContainsAny(lowered, "최근 코딩 결과 계획", "코딩 결과 계획", "최근 코딩 결과로 계획", "plan from coding result"))
        {
            var latestCodingPlan = TryBuildLatestTelegramCodingPlanCreate();
            return string.IsNullOrWhiteSpace(latestCodingPlan)
                ? "계획으로 만들 최근 텔레그램 코딩 결과가 없습니다."
                : await ExecuteTelegramPseudoCommandAsync(latestCodingPlan, attachments, webUrls, webSearchEnabled, cancellationToken);
        }

        var pseudoCommand = TelegramNaturalCommandPolicy.TryBuildNaturalPseudoCommand(normalized, lowered);
        if (!string.IsNullOrWhiteSpace(pseudoCommand))
        {
            var pseudoResult = await ExecuteTelegramPseudoCommandAsync(
                pseudoCommand,
                attachments,
                webUrls,
                webSearchEnabled,
                cancellationToken
            );
            if (!string.IsNullOrWhiteSpace(pseudoResult))
            {
                return pseudoResult;
            }
        }

        if (ContainsAny(lowered, "모델 목록", "모델 보여", "모델 리스트"))
        {
            var target = ContainsAny(lowered, "groq", "그록")
                ? "groq"
                : ContainsAny(lowered, "gemini", "제미니")
                    ? "gemini"
                : ContainsAny(lowered, "copilot", "코파일럿")
                    ? "copilot"
                    : ContainsAny(lowered, "cerebras", "세레브라스", "세레브라")
                        ? "cerebras"
                        : ContainsAny(lowered, "codex", "코덱스")
                            ? "codex"
                        : "all";
            return await BuildTelegramModelsReportAsync(target, cancellationToken);
        }

        if (ContainsAny(lowered, "사용량", "과금", "quota", "한도", "토큰 잔여", "요청 잔여"))
        {
            return await BuildTelegramUsageReportAsync(cancellationToken);
        }

        var helpTopic = TelegramNaturalCommandPolicy.ExtractHelpTopic(lowered);
        if (helpTopic != null)
        {
            return BuildTelegramHelpText(helpTopic);
        }

        var setProviderModel = Regex.Match(normalized, @"(?i)(groq|그록|gemini|제미니|copilot|코파일럿|cerebras|세레브라스|세레브라|nvidia|nvidia-nim|nim|엔비디아|codex|코덱스)\s*모델\s*([a-zA-Z0-9._/\-]+)\s*(?:로|으로)?\s*(?:바꿔|변경|설정)");
        if (setProviderModel.Success)
        {
            var provider = TelegramNaturalCommandPolicy.ExtractProviderAlias(setProviderModel.Groups[1].Value, allowAuto: false);
            var modelId = setProviderModel.Groups[2].Value.Trim();
            if (!string.IsNullOrWhiteSpace(provider) && !string.IsNullOrWhiteSpace(modelId))
            {
                return await SetTelegramProviderModelForNaturalControlAsync(provider, modelId, cancellationToken);
            }
        }

        var setGroq = Regex.Match(normalized, @"(?i)groq\s*모델\s*([a-zA-Z0-9._/\-]+)\s*(?:로|으로)?\s*(?:바꿔|변경|설정)");
        if (setGroq.Success)
        {
            return await SetTelegramProviderModelForNaturalControlAsync("groq", setGroq.Groups[1].Value, cancellationToken);
        }

        var setCopilot = Regex.Match(normalized, @"(?i)(?:copilot|코파일럿)\s*모델\s*([a-zA-Z0-9._/\-]+)\s*(?:로|으로)?\s*(?:바꿔|변경|설정)");
        if (setCopilot.Success)
        {
            return await SetTelegramProviderModelForNaturalControlAsync("copilot", setCopilot.Groups[1].Value, cancellationToken);
        }

        return null;
    }

    private async Task<string?> ExecuteTelegramPseudoCommandAsync(
        string pseudoCommand,
        IReadOnlyList<InputAttachment>? attachments,
        IReadOnlyList<string>? webUrls,
        bool webSearchEnabled,
        CancellationToken cancellationToken
    )
    {
        return await TelegramPseudoCommandExecutor.ExecuteAsync(
            new TelegramPseudoCommandRequest(pseudoCommand, attachments, webUrls, webSearchEnabled),
            BuildTelegramPseudoCommandHandlers(),
            cancellationToken
        );
    }

    private TelegramPseudoCommandHandlers BuildTelegramPseudoCommandHandlers()
    {
        return new TelegramPseudoCommandHandlers(
            ParseHelpTopicFromInput,
            BuildTelegramHelpText,
            TryHandleTelegramProfileCommandAsync,
            TryHandleTelegramQuickModelCommandAsync,
            TryHandleTelegramLlmControlCommandAsync,
            TryHandleTelegramSkillCommandAsync,
            TryHandleTelegramCodingCommandAsync,
            TryHandleTelegramRefactorCommandAsync,
            TryHandleTelegramMemoryCommandAsync,
            TryHandleTelegramDoctorCommandAsync,
            TryHandleTelegramPlanCommandAsync,
            TryHandleTelegramTaskCommandAsync,
            TryHandleTelegramNotebookCommandAsync,
            (command, token) => TryHandleRoutineCommandAsync(command, "telegram", token),
            ExecuteTelegramMetricsPseudoCommandAsync,
            ExecuteTelegramKillPseudoCommandAsync
        );
    }

    private async Task<string?> ExecuteTelegramMetricsPseudoCommandAsync(string command, CancellationToken cancellationToken)
    {
        var metrics = await _coreClient.GetMetricsAsync(cancellationToken);
        RecordEvent($"telegram:natural:{command}");
        _auditLogger.Log("telegram", "metrics", "ok", "natural_control");
        return metrics;
    }

    private async Task<string?> ExecuteTelegramKillPseudoCommandAsync(string command, CancellationToken cancellationToken)
    {
        if (!KillCommandPolicy.TryParse(command, out var pid))
        {
            return null;
        }

        var guard = await ValidateKillTargetAsync(pid, "telegram", cancellationToken);
        if (!guard.Allowed)
        {
            _auditLogger.Log("telegram", "kill", "deny", $"pid={pid} reason={guard.Reason} natural_control");
            return $"kill denied: {guard.Reason}";
        }

        var result = await _coreClient.KillAsync(pid, cancellationToken);
        RecordEvent($"telegram:natural:{command}");
        _auditLogger.Log("telegram", "kill", "ok", $"pid={pid} natural_control");
        return result;
    }

}
