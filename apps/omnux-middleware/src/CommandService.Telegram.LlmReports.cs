using System.Globalization;
using System.Text;

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
