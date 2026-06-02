using System.Globalization;
using System.Text;
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
        switch (command.Kind)
        {
            case TelegramLlmControlCommandKind.Help:
                return CommandHelpTextPolicy.BuildUnifiedLlmHelpText("telegram");

            case TelegramLlmControlCommandKind.Status:
                return await BuildTelegramLlmStatusAsync(cancellationToken);

            case TelegramLlmControlCommandKind.SetMode:
                return SetChannelMode("telegram", command.Primary);

            case TelegramLlmControlCommandKind.Models:
                return await BuildTelegramModelsReportAsync(command.Primary, cancellationToken);

            case TelegramLlmControlCommandKind.Usage:
                return await BuildTelegramUsageReportAsync(cancellationToken);

            case TelegramLlmControlCommandKind.SetGroqModel:
                return await SetGroqModelForTelegramAsync(command.Primary, cancellationToken);

            case TelegramLlmControlCommandKind.SetCopilotModel:
                return await SetCopilotModelForTelegramAsync(command.Primary, cancellationToken);

            case TelegramLlmControlCommandKind.SetSingleProviderThenModel:
            {
                var providerSet = SetChannelProvider("telegram", "single", command.Primary);
                if (providerSet.StartsWith("지원", StringComparison.OrdinalIgnoreCase)
                    || providerSet.StartsWith("invalid", StringComparison.OrdinalIgnoreCase))
                {
                    return providerSet;
                }

                return SetChannelModel("telegram", "single", command.Secondary);
            }

            case TelegramLlmControlCommandKind.SetSingleProvider:
                return SetChannelProvider("telegram", "single", command.Primary);

            case TelegramLlmControlCommandKind.SetSingleModel:
                return SetChannelModel("telegram", "single", command.Secondary);

            case TelegramLlmControlCommandKind.SetOrchestrationProvider:
                return SetChannelProvider("telegram", "orchestration", command.Primary);

            case TelegramLlmControlCommandKind.SetOrchestrationModel:
                return SetChannelModel("telegram", "orchestration", command.Secondary);

            case TelegramLlmControlCommandKind.SetMultiChannelModel:
                lock (_telegramLlmLock)
                {
                    return SetChannelModel("telegram", command.Primary, command.Secondary);
                }

            case TelegramLlmControlCommandKind.SetMultiSummaryProvider:
                lock (_telegramLlmLock)
                {
                    return SetChannelProvider("telegram", "summary", command.Primary);
                }

            case TelegramLlmControlCommandKind.UsageError:
            case TelegramLlmControlCommandKind.Unknown:
            default:
                return command.Message;
        }
    }

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

    private Task<string?> TryHandleTelegramQuickModelCommandAsync(string text, CancellationToken cancellationToken)
    {
        _ = cancellationToken;
        if (!text.StartsWith("/model", StringComparison.OrdinalIgnoreCase))
        {
            return Task.FromResult<string?>(null);
        }

        var tokens = text.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (tokens.Length < 2)
        {
            return Task.FromResult<string?>("사용법: /model <groq|gemini|copilot|cerebras|nvidia|codex>");
        }

        var key = tokens[1].Trim().ToLowerInvariant();
        lock (_telegramLlmLock)
        {
            var selection = TelegramLlmPreferencePolicy.ResolveQuickModelSelection(
                key,
                _providers.GroqModel,
                DefaultGroqPrimaryModel,
                _providers.GeminiModel,
                DefaultCopilotModel,
                _providers.CerebrasModel,
                _providers.NvidiaModel,
                _providers.CodexModel
            );
            if (selection != null)
            {
                _telegramLlmPreferences.Profile = "default";
                _telegramLlmPreferences.Mode = "single";
                _telegramLlmPreferences.SingleProvider = selection.Provider;
                _telegramLlmPreferences.SingleModel = selection.Model;
                _telegramLlmPreferences.AutoGroqComplexUpgrade = selection.AutoGroqComplexUpgrade;
                return Task.FromResult<string?>($"단일 제공자를 {selection.ProviderDisplayName}로 바꿨습니다. 현재 모델: {_telegramLlmPreferences.SingleModel}");
            }
        }

        return Task.FromResult<string?>("사용법: /model <groq|gemini|copilot|cerebras|nvidia|codex>");
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
                if (provider == "groq")
                {
                    return await SetGroqModelForTelegramAsync(modelId, cancellationToken);
                }

                if (provider == "copilot")
                {
                    return await SetCopilotModelForTelegramAsync(modelId, cancellationToken);
                }

                var providerMessage = SetChannelProvider("telegram", "single", provider);
                var modelMessage = SetChannelModel("telegram", "single", modelId);
                return providerMessage.Contains("실패", StringComparison.OrdinalIgnoreCase)
                    ? providerMessage
                    : modelMessage;
            }
        }

        var setGroq = Regex.Match(normalized, @"(?i)groq\s*모델\s*([a-zA-Z0-9._/\-]+)\s*(?:로|으로)?\s*(?:바꿔|변경|설정)");
        if (setGroq.Success)
        {
            return await SetGroqModelForTelegramAsync(setGroq.Groups[1].Value, cancellationToken);
        }

        var setCopilot = Regex.Match(normalized, @"(?i)(?:copilot|코파일럿)\s*모델\s*([a-zA-Z0-9._/\-]+)\s*(?:로|으로)?\s*(?:바꿔|변경|설정)");
        if (setCopilot.Success)
        {
            return await SetCopilotModelForTelegramAsync(setCopilot.Groups[1].Value, cancellationToken);
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

    private async Task<string?> TryHandleTelegramMemoryCommandAsync(string text, CancellationToken cancellationToken)
    {
        if (!text.StartsWith("/memory", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        var tokens = text.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (tokens.Length >= 2 && tokens[1].Equals("help", StringComparison.OrdinalIgnoreCase))
        {
            return BuildTelegramHelpText("memory");
        }

        if (tokens.Length >= 2 && tokens[1].Equals("clear", StringComparison.OrdinalIgnoreCase))
        {
            var result = ClearMemory("telegram", "telegram");
            return $"메모리를 비웠습니다. {result}";
        }

        if (tokens.Length >= 2 && tokens[1].Equals("create", StringComparison.OrdinalIgnoreCase))
        {
            var telegramThread = EnsureTelegramLinkedConversation();
            var compactConversation = tokens.Length >= 3 && tokens[2].Equals("compact", StringComparison.OrdinalIgnoreCase);
            var created = await CreateMemoryNoteAsync(
                telegramThread.Id,
                "telegram",
                compactConversation,
                cancellationToken
            );
            return created.Ok
                ? $"메모리 노트를 만들었습니다. {created.Message}"
                : $"메모리 노트 생성 실패: {created.Message}";
        }

        return BuildTelegramHelpText("memory");
    }

    private async Task<string> SetGroqModelForTelegramAsync(string modelId, CancellationToken cancellationToken)
    {
        var requested = (modelId ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(requested))
        {
            return "model-id를 입력하세요. 예: /llm set groq meta-llama/llama-4-scout-17b-16e-instruct";
        }

        var models = await _groqModelCatalog.GetModelsAsync(cancellationToken);
        if (!models.Any(x => x.Id.Equals(requested, StringComparison.OrdinalIgnoreCase)))
        {
            return $"알 수 없는 Groq 모델: {requested}";
        }

        _llmRouter.TrySetSelectedGroqModel(requested);
        lock (_telegramLlmLock)
        {
            _telegramLlmPreferences.SingleProvider = "groq";
            _telegramLlmPreferences.SingleModel = requested;
            _telegramLlmPreferences.AutoGroqComplexUpgrade = requested.Equals(DefaultGroqFastModel, StringComparison.OrdinalIgnoreCase);
        }

        return $"Groq 모델을 {requested}로 바꿨습니다.";
    }

    private Task<string> SetCopilotModelForTelegramAsync(string modelId, CancellationToken cancellationToken)
    {
        _ = cancellationToken;
        var requested = (modelId ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(requested))
        {
            return Task.FromResult("model-id를 입력하세요. 예: /llm set copilot gpt-5-mini");
        }

        if (!_copilotWrapper.TrySetSelectedModel(DefaultCopilotModel))
        {
            return Task.FromResult($"Copilot 모델 설정 실패: {DefaultCopilotModel}");
        }

        lock (_telegramLlmLock)
        {
            _telegramLlmPreferences.SingleProvider = "copilot";
            _telegramLlmPreferences.SingleModel = DefaultCopilotModel;
        }

        if (!requested.Equals(DefaultCopilotModel, StringComparison.OrdinalIgnoreCase))
        {
            return Task.FromResult($"Copilot 모델은 {DefaultCopilotModel}로 고정됩니다. 요청한 `{requested}` 대신 {DefaultCopilotModel}를 사용합니다.");
        }

        return Task.FromResult($"Copilot 모델을 {DefaultCopilotModel}로 설정했습니다.");
    }

    private async Task<string> BuildTelegramModelsReportAsync(string target, CancellationToken cancellationToken)
    {
        var selected = (target ?? "all").Trim().ToLowerInvariant();
        TelegramLlmPreferences snapshot;
        lock (_telegramLlmLock)
        {
            snapshot = _telegramLlmPreferences.Clone();
        }

        var builder = new StringBuilder();
        var hasSection = false;
        builder.AppendLine("[로컬 시간]");
        builder.AppendLine(LocalTimeTextPolicy.BuildLocalNowText());
        builder.AppendLine();
        if (selected == "all" || selected == "groq")
        {
            hasSection = true;
            var groqModels = await _groqModelCatalog.GetModelsAsync(cancellationToken);
            builder.AppendLine("[Groq 모델]");
            foreach (var model in groqModels.Take(16))
            {
                builder.AppendLine($"- {model.Id} | 속도={model.SpeedTokensPerSecond} tps | 컨텍스트={model.ContextWindow} | 출력={model.MaxCompletionTokens}");
            }
            if (groqModels.Count > 16)
            {
                builder.AppendLine($"... +{groqModels.Count - 16}개");
            }

            builder.AppendLine($"현재 단일 선택: {(snapshot.SingleProvider == "groq" ? snapshot.SingleModel : _llmRouter.GetSelectedGroqModel())}");
            builder.AppendLine($"현재 다중 선택: {snapshot.MultiGroqModel}");
            builder.AppendLine();
        }

        if (selected == "all" || selected == "gemini")
        {
            hasSection = true;
            builder.AppendLine("[Gemini 모델]");
            builder.AppendLine($"- 기본: {_providers.GeminiModel}");
            builder.AppendLine($"- 빠른 응답: {_providers.GeminiFlashModel}");
            builder.AppendLine($"- 검색/저비용: {_providers.GeminiSearchModel}");
            builder.AppendLine($"- 현재 단일 선택: {(snapshot.SingleProvider == "gemini" ? snapshot.SingleModel : _providers.GeminiModel)}");
            builder.AppendLine($"- 현재 다중 선택: {(string.IsNullOrWhiteSpace(snapshot.MultiGeminiModel) ? _providers.GeminiModel : snapshot.MultiGeminiModel)}");
            builder.AppendLine();
        }

        if (selected == "all" || selected == "copilot")
        {
            hasSection = true;
            var copilotModels = await _copilotWrapper.GetModelsAsync(cancellationToken);
            builder.AppendLine("[Copilot 모델]");
            foreach (var model in copilotModels.Take(16))
            {
                builder.AppendLine($"- {model.Id} | 공급자={model.Provider} | 속도={model.OutputTokensPerSecond} tps | 컨텍스트={model.ContextWindow}");
            }
            if (copilotModels.Count > 16)
            {
                builder.AppendLine($"... +{copilotModels.Count - 16}개");
            }

            builder.AppendLine($"현재 단일 선택: {(snapshot.SingleProvider == "copilot" ? snapshot.SingleModel : _copilotWrapper.GetSelectedModel())}");
            builder.AppendLine($"현재 다중 선택: {snapshot.MultiCopilotModel}");
            builder.AppendLine();
        }

        if (selected == "all" || selected == "cerebras")
        {
            hasSection = true;
            builder.AppendLine("[Cerebras 모델]");
            builder.AppendLine($"- 기본: {_providers.CerebrasModel}");
            builder.AppendLine($"- 현재 단일 선택: {(snapshot.SingleProvider == "cerebras" ? snapshot.SingleModel : _providers.CerebrasModel)}");
            builder.AppendLine($"- 현재 다중 선택: {snapshot.MultiCerebrasModel}");
            builder.AppendLine();
        }

        if (selected == "all" || selected == "nvidia" || selected == "nim" || selected == "nvidia-nim")
        {
            hasSection = true;
            builder.AppendLine("[NVIDIA NIM 모델]");
            builder.AppendLine($"- 기본: {_providers.NvidiaModel}");
            builder.AppendLine("- 대표 지원: meta/llama-3.3-70b-instruct");
            builder.AppendLine("- 대표 지원: nvidia/llama-3.3-nemotron-super-49b-v1.5");
            builder.AppendLine("- 대표 지원: nvidia/nemotron-3-super-120b-a12b");
            builder.AppendLine("- 대표 지원: openai/gpt-oss-120b");
            builder.AppendLine("- 대표 지원: qwen/qwen3-coder-480b-a35b-instruct");
            builder.AppendLine($"- 현재 단일 선택: {(snapshot.SingleProvider == "nvidia" ? snapshot.SingleModel : _providers.NvidiaModel)}");
            builder.AppendLine($"- 현재 다중 선택: {snapshot.MultiNvidiaModel}");
            builder.AppendLine();
        }

        if (selected == "all" || selected == "codex")
        {
            hasSection = true;
            builder.AppendLine("[Codex 모델]");
            builder.AppendLine($"- 기본: {_providers.CodexModel}");
            builder.AppendLine($"- 현재 단일 선택: {(snapshot.SingleProvider == "codex" ? snapshot.SingleModel : _providers.CodexModel)}");
            builder.AppendLine($"- 현재 다중 선택: {snapshot.MultiCodexModel}");
            builder.AppendLine();
        }

        if (!hasSection)
        {
            return "사용법: /llm models [groq|gemini|copilot|cerebras|nvidia|codex|all]";
        }

        builder.AppendLine("바꾸는 예시:");
        builder.AppendLine("/llm set groq meta-llama/llama-4-scout-17b-16e-instruct");
        builder.AppendLine("/llm set copilot gpt-5-mini");
        builder.AppendLine("/llm set codex gpt-5.4");
        builder.AppendLine("/llm single provider gemini");
        builder.AppendLine("/llm single model gemini-3.1-flash-lite");
        builder.AppendLine("/llm single provider cerebras");
        builder.AppendLine("/llm single model zai-glm-4.7");
        builder.AppendLine("/llm multi gemini gemini-3.1-flash-lite");
        builder.AppendLine("/llm multi cerebras zai-glm-4.7");
        builder.AppendLine("/llm multi codex gpt-5.4");
        return builder.ToString().Trim();
    }

    private async Task<string> BuildTelegramUsageReportAsync(CancellationToken cancellationToken)
    {
        var builder = new StringBuilder();
        var gemini = _llmRouter.GetGeminiUsageSnapshot();
        builder.AppendLine("[Gemini 사용량/추정 과금]");
        builder.AppendLine($"- requests={gemini.Requests}");
        builder.AppendLine($"- prompt_tokens={gemini.PromptTokens}, completion_tokens={gemini.CompletionTokens}, total_tokens={gemini.TotalTokens}");
        builder.AppendLine($"- input_price=${_providers.GeminiInputPricePerMillionUsd:F4}/1M, output_price=${_providers.GeminiOutputPricePerMillionUsd:F4}/1M");
        builder.AppendLine($"- estimated_cost_usd=${gemini.EstimatedCostUsd:F6}");
        builder.AppendLine();

        builder.AppendLine("[Copilot 사용량 - omnux 로컬]");
        builder.AppendLine($"- selected={_copilotWrapper.GetSelectedModel()}");
        var copilotUsage = _copilotWrapper.GetUsageSnapshot();
        var copilotLines = copilotUsage
            .OrderByDescending(x => x.Value.Requests)
            .Take(12)
            .Select(item => $"- {item.Key}: {item.Value.Requests} req")
            .ToArray();
        if (copilotLines.Length == 0)
        {
            builder.AppendLine("- usage 없음");
        }
        else
        {
            foreach (var line in copilotLines)
            {
                builder.AppendLine(line);
            }
        }
        builder.AppendLine();
        builder.AppendLine("[Copilot Premium Requests - GitHub 계정 월누적(모든 클라이언트 합산)]");
        var premium = await _copilotWrapper.GetPremiumUsageSnapshotAsync(cancellationToken, forceRefresh: true);
        if (!premium.Available)
        {
            builder.AppendLine($"- 상태={premium.Message}");
            if (premium.RequiresUserScope)
            {
                builder.AppendLine("- 조치=gh auth refresh -h github.com -s user");
            }
            builder.AppendLine($"- 확인 링크={premium.FeaturesUrl}");
            builder.AppendLine($"- 상세 링크={premium.BillingUrl}");
        }
        else
        {
            var quotaText = premium.MonthlyQuota > 0d
                ? premium.MonthlyQuota.ToString("F1", CultureInfo.InvariantCulture)
                : "-";
            builder.AppendLine($"- user={premium.Username}");
            builder.AppendLine($"- plan={premium.PlanName}");
            builder.AppendLine($"- used={premium.UsedRequests.ToString("F1", CultureInfo.InvariantCulture)}/{quotaText}");
            builder.AppendLine($"- percent={premium.PercentUsed.ToString("F1", CultureInfo.InvariantCulture)}%");
            builder.AppendLine($"- refreshed={premium.RefreshedLocal}");
            if (premium.Items.Count == 0)
            {
                builder.AppendLine("- 모델별 데이터 없음");
            }
            else
            {
                foreach (var item in premium.Items.Take(15))
                {
                    builder.AppendLine($"- {item.Model}: {item.Requests.ToString("F1", CultureInfo.InvariantCulture)} req ({item.Percent.ToString("F1", CultureInfo.InvariantCulture)}%)");
                }
            }
            builder.AppendLine($"- 확인 링크={premium.FeaturesUrl}");
            builder.AppendLine($"- 상세 링크={premium.BillingUrl}");
        }

        builder.AppendLine();
        builder.AppendLine("[Groq 제한량/사용량]");
        builder.AppendLine($"- selected={_llmRouter.GetSelectedGroqModel()}");
        var usageMap = _llmRouter.GetGroqUsageSnapshot();
        var rateMap = _llmRouter.GetGroqRateLimitSnapshot();
        var models = await _groqModelCatalog.GetModelsAsync(cancellationToken);
        foreach (var model in models.Take(12))
        {
            usageMap.TryGetValue(model.Id, out var usage);
            rateMap.TryGetValue(model.Id, out var rate);
            var usageText = $"{usage?.Requests ?? 0} req / {usage?.TotalTokens ?? 0} tok";
            var tokenLimitText = rate?.LimitTokens.HasValue == true
                ? $"{rate.RemainingTokens ?? 0}/{rate.LimitTokens.Value}"
                : "-";
            var reqLimitText = rate?.LimitRequests.HasValue == true
                ? $"{rate.RemainingRequests ?? 0}/{rate.LimitRequests.Value}"
                : "-";
            var cooldownText = rate?.CooldownUntilUtc.HasValue == true && rate.CooldownUntilUtc.Value > DateTimeOffset.UtcNow
                ? rate.CooldownUntilUtc.Value.ToLocalTime().ToString("yyyy-MM-dd HH:mm:ss")
                : "-";
            builder.AppendLine($"- {model.Id}: usage={usageText}, token 잔여/한도={tokenLimitText}, 요청 잔여/한도={reqLimitText}, cooldown_until={cooldownText}");
        }

        builder.AppendLine();
        builder.AppendLine("명령어:");
        builder.AppendLine("/llm models all");
        builder.AppendLine("/llm set groq <model-id>");
        builder.AppendLine("/llm set copilot <model-id>");
        return builder.ToString().Trim();
    }
}
