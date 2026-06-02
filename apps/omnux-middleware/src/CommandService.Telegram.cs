using System.Globalization;
using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Omnux.Middleware.Infrastructure.Telegram;

namespace Omnux.Middleware;

public sealed partial class CommandService
{
    private Task<string?> TryHandleTelegramProfileCommandAsync(string text, CancellationToken cancellationToken)
    {
        _ = cancellationToken;
        if (string.IsNullOrWhiteSpace(text))
        {
            return Task.FromResult<string?>(null);
        }

        var tokens = text.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (tokens.Length == 0)
        {
            return Task.FromResult<string?>(null);
        }

        var command = tokens[0].ToLowerInvariant();
        if (command != "/talk" && command != "/code")
        {
            return Task.FromResult<string?>(null);
        }

        if (command == "/code" && tokens.Length >= 2)
        {
            var second = tokens[1].Trim().ToLowerInvariant();
            if (second != "low" && second != "high" && second != "help")
            {
                return Task.FromResult<string?>(null);
            }
        }

        if (tokens.Length >= 2 && tokens[1].Equals("help", StringComparison.OrdinalIgnoreCase))
        {
            return Task.FromResult<string?>("""
                [빠른 프로필]
                - /talk [low|high] : 대화 위주로 맞춤
                - /code [low|high] : 코딩 위주로 맞춤

                예시:
                - /talk low
                - /code high
                - 그냥 "코딩용으로 바꿔" 라고 말해도 됩니다.
                """);
        }

        var requestedThinking = tokens.Length >= 2 ? TelegramLlmPreferencePolicy.NormalizeThinkingLevel(tokens[1], "auto") : "auto";
        var profile = command == "/talk" ? "talk" : "code";
        var message = ApplyTelegramProfileCommandMutation(new TelegramLlmProfileCommandMutationRequest(profile, requestedThinking));
        return Task.FromResult<string?>(message);
    }

    private async Task<string?> TryBuildInChatCopilotUsageResponseAsync(
        string input,
        string source,
        CancellationToken cancellationToken
    )
    {
        if (!source.Equals("web", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        if (!IsCopilotPremiumUsageQuery(input))
        {
            return null;
        }

        var premium = await _copilotWrapper.GetPremiumUsageSnapshotAsync(cancellationToken, forceRefresh: true);
        var builder = new StringBuilder();
        builder.AppendLine("[Copilot Premium Requests - GitHub 계정 월누적(모든 클라이언트 합산)]");
        if (!premium.Available)
        {
            builder.AppendLine($"상태: {premium.Message}");
            if (premium.RequiresUserScope)
            {
                builder.AppendLine("조치: gh auth refresh -h github.com -s user");
            }
            builder.AppendLine($"확인 링크: {premium.FeaturesUrl}");
            builder.AppendLine($"상세 링크: {premium.BillingUrl}");
            return builder.ToString().Trim();
        }

        var quotaText = premium.MonthlyQuota > 0d
            ? premium.MonthlyQuota.ToString("F1", CultureInfo.InvariantCulture)
            : "-";
        builder.AppendLine($"계정: {premium.Username}");
        builder.AppendLine($"플랜: {premium.PlanName}");
        builder.AppendLine($"사용량: {premium.UsedRequests.ToString("F1", CultureInfo.InvariantCulture)}/{quotaText}");
        builder.AppendLine($"사용률: {premium.PercentUsed.ToString("F1", CultureInfo.InvariantCulture)}%");
        builder.AppendLine($"갱신 시각(로컬): {premium.RefreshedLocal}");
        builder.AppendLine();
        builder.AppendLine("[모델별 사용]");
        if (premium.Items.Count == 0)
        {
            builder.AppendLine("- 데이터 없음");
        }
        else
        {
            foreach (var item in premium.Items.Take(12))
            {
                builder.AppendLine($"- {item.Model}: {item.Requests.ToString("F1", CultureInfo.InvariantCulture)}회 ({item.Percent.ToString("F1", CultureInfo.InvariantCulture)}%)");
            }
        }

        builder.AppendLine();
        builder.AppendLine($"설정 페이지: {premium.FeaturesUrl}");
        builder.AppendLine($"청구 페이지: {premium.BillingUrl}");
        builder.AppendLine("주의: 위 Premium 수치는 GitHub 계정 월누적이며, omnux 외 VS Code/Web/기타 Copilot 사용도 함께 집계됩니다.");
        return builder.ToString().Trim();
    }

    private static bool IsCopilotPremiumUsageQuery(string text)
    {
        var normalized = (text ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return false;
        }

        var lowered = normalized.ToLowerInvariant();
        if (lowered.StartsWith("/llm usage", StringComparison.OrdinalIgnoreCase)
            || lowered.StartsWith("/copilot usage", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        if (!ContainsAny(lowered,
                "copilot",
                "코파일럿",
                "깃허브 코파일럿",
                "github copilot",
                "premium request",
                "프리미엄 요청"))
        {
            return false;
        }

        return ContainsAny(lowered,
            "usage",
            "사용량",
            "퍼센트",
            "percent",
            "비율",
            "quota",
            "한도",
            "모델별");
    }

    public TelegramExecutionMetadata GetCurrentTelegramExecutionMetadata()
    {
        return _executionContext.GetTelegramExecutionMetadata();
    }

    private void SetCurrentTelegramExecutionMetadata(
        SearchAnswerGuardFailure? guardFailure = null,
        int retryAttempt = 0,
        int retryMaxAttempts = 0,
        string? retryStopReason = "-"
    )
    {
        _executionContext.SetTelegramExecutionMetadata(
            guardFailure,
            retryAttempt,
            retryMaxAttempts,
            retryStopReason
        );
    }

    private async Task<string> ExecuteTelegramLlmMessageAsync(
        string text,
        IReadOnlyList<InputAttachment>? attachments,
        IReadOnlyList<string>? webUrls,
        bool webSearchEnabled,
        Action<string>? streamCallback,
        CancellationToken cancellationToken
    )
    {
        Action<ChatStreamUpdate>? telegramChatStream = streamCallback == null
            ? null
            : update =>
            {
                if (!string.IsNullOrEmpty(update.Delta))
                {
                    streamCallback(update.Delta);
                }
            };
        var requestText = text ?? string.Empty;
        TelegramLlmPreferences snapshot;
        lock (_telegramLlmLock)
        {
            snapshot = _telegramLlmPreferences.Clone();
        }

        var telegramThread = EnsureTelegramLinkedConversation();
        var telegramStateKey = ResolveTelegramStateKey(telegramThread);
        var session = PrepareSessionContext(
            "chat",
            "single",
            telegramThread.Id,
            null,
            null,
            null,
            null,
            telegramThread.LinkedMemoryNotes,
            "telegram"
        );
        var snapshotSingleProvider = NormalizeProvider(snapshot.SingleProvider, allowAuto: true);
        if (snapshotSingleProvider is "auto" or "none")
        {
            snapshotSingleProvider = "gemini";
        }

        var snapshotSingleModel = ResolveModel(snapshotSingleProvider, snapshot.SingleModel);

        var thinkPlusToggle = await ApplyTelegramThinkPlusToggleAsync(
            requestText,
            session,
            telegramStateKey,
            cancellationToken
        );
        requestText = thinkPlusToggle.RequestText;
        var thinkPlusToggleNote = thinkPlusToggle.ToggleNote;
        if (thinkPlusToggle.ImmediateResponse != null)
        {
            return thinkPlusToggle.ImmediateResponse;
        }

        var effectiveTopicInput = BuildTelegramFollowupAwareInput(telegramThread, requestText);
        var requestedSkillName = TryExtractInlineSkillName(requestText);
        var skillQueryText = requestText;
        var hasStickyActiveSkillForTelegram = !string.IsNullOrWhiteSpace(telegramStateKey)
            && _activeSkillByThread.ContainsKey(telegramStateKey);
        var thinkPlusActiveForTelegram = IsThinkPlusActiveForThread(telegramStateKey);
        var isSkillContextQuery = LooksLikeProjectContextRequest(skillQueryText)
            || LooksLikeSkillCreationRequest(skillQueryText)
            || LooksLikeSkillDeactivationRequest(skillQueryText)
            || Regex.IsMatch(skillQueryText, @"(?i)(스킬|skill|skills|skill\.md).*(목록|리스트|뭐|보여|알려|어떤|종류|있어|있니|돼)")
            || hasStickyActiveSkillForTelegram;
        var resolvedWebUrls = ResolveWebUrls(effectiveTopicInput, webUrls, webSearchEnabled);
        var urlFastPath = await TryHandleTelegramUrlFastPathAsync(
            requestText,
            effectiveTopicInput,
            resolvedWebUrls,
            session,
            telegramStateKey,
            thinkPlusActiveForTelegram,
            snapshot.Mode,
            telegramChatStream,
            cancellationToken
        );
        if (urlFastPath != null)
        {
            return urlFastPath;
        }

        var shouldAllowFastWeb = webSearchEnabled
            && snapshot.Mode == "single"
            && !thinkPlusActiveForTelegram
            && !isSkillContextQuery;

        if (shouldAllowFastWeb)
        {
            var decisionPath = "heuristic_no_web";
            var shouldUseGeminiWeb = false;
            var shouldFallbackToGeminiWeb = false;

            if (SearchQueryPolicy.LooksLikeExplicitWebLookupQuestion(requestText))
            {
                decisionPath = "heuristic_explicit_web";
                shouldUseGeminiWeb = true;
            }
            else if (SearchQueryPolicy.LooksLikeRealtimeQuestion(effectiveTopicInput))
            {
                decisionPath = "heuristic_web";
                shouldUseGeminiWeb = true;
            }
            else if (!SearchQueryPolicy.LooksLikeClearlyNonWebQuestion(effectiveTopicInput))
            {
                var webDecision = await DecideNeedWebBySelectedProviderAsync(
                    effectiveTopicInput,
                    snapshotSingleProvider,
                    snapshotSingleModel,
                    cancellationToken
                );
                shouldFallbackToGeminiWeb = !webDecision.DecisionSucceeded && SearchQueryPolicy.LooksLikeRealtimeQuestion(effectiveTopicInput);
                shouldUseGeminiWeb = webDecision.NeedWeb || shouldFallbackToGeminiWeb;
                decisionPath = webDecision.DecisionSucceeded ? "llm" : "heuristic_fallback";
            }

            if (shouldUseGeminiWeb)
            {
                var allowMarkdownTable = SearchQueryPolicy.LooksLikeTableRenderRequest(effectiveTopicInput);
                var memoryHint = BuildSafeWebMemoryPreferenceHint(
                    telegramStateKey,
                    effectiveTopicInput,
                    session.LinkedMemoryNotes
                );
                var webSingle = await ComposeGroundedWebAnswerWithFallbackAsync(
                    effectiveTopicInput,
                    memoryHint,
                    shouldFallbackToGeminiWeb,
                    allowMarkdownTable,
                    true,
                    telegramChatStream,
                    session.Scope,
                    session.Mode,
                    session.Thread.Id,
                    decisionPath,
                    0,
                    "telegram",
                    cancellationToken
                );
                var webResponseText = AppendTelegramResponseFooter(
                    FormatTelegramResponse(webSingle.Response.Text, TelegramMaxResponseChars),
                    webSingle.Response.Provider,
                    webSingle.Response.Model,
                    telegramStateKey,
                    "web"
                );
                var webAssistantMeta = $"telegram-single:{webSingle.Response.Provider}:{webSingle.Response.Model}:{webSingle.Route}";
                _conversationStore.AppendMessage(session.Thread.Id, "user", requestText, "telegram:user");
                _conversationStore.AppendMessage(session.Thread.Id, "assistant", webResponseText, webAssistantMeta);
                await EnsureConversationTitleFromFirstTurnAsync(session.Thread.Id, webSingle.Response.Provider, webSingle.Response.Model, cancellationToken);
                _ = await MaybeCompressConversationAsync(session.Thread.Id, "chat-single", webSingle.Response.Provider, webSingle.Response.Model, cancellationToken);
                _auditLogger.Log("telegram", "telegram_guard_meta", "ok", $"route={webAssistantMeta} guardCategory=- guardReason=- guardDetail=-");
                SetCurrentTelegramExecutionMetadata(webSingle.GuardFailure, 0, 0, "-");
                return webResponseText;
            }
        }

        var effectiveWebSearchEnabled = snapshot.Mode == "single"
            ? webSearchEnabled && (thinkPlusActiveForTelegram || isSkillContextQuery || SearchQueryPolicy.LooksLikeExplicitWebLookupQuestion(effectiveTopicInput) || SearchQueryPolicy.LooksLikeRealtimeQuestion(effectiveTopicInput))
            : webSearchEnabled;
        var normalizedAttachments = InputAttachmentPolicy.Normalize(attachments);
        var sharedPrepared = await PrepareSharedInputAsync(
            effectiveTopicInput,
            normalizedAttachments,
            resolvedWebUrls,
            effectiveWebSearchEnabled,
            cancellationToken,
            "telegram",
            session.SessionKey,
            telegramStateKey,
            requestedSkillName,
            null
        );
        if (!string.IsNullOrWhiteSpace(sharedPrepared.UnsupportedMessage))
        {
            var blockedAssistantMeta = "telegram-forced-context:unsupported";
            var blockedResponseText = sharedPrepared.UnsupportedMessage;
            _conversationStore.AppendMessage(session.Thread.Id, "user", requestText, "telegram:user");
            _conversationStore.AppendMessage(session.Thread.Id, "assistant", blockedResponseText, blockedAssistantMeta);
            await EnsureConversationTitleFromFirstTurnAsync(session.Thread.Id, "gemini", "-", cancellationToken);
            var guardCategory = NormalizeForcedGuardCategory(sharedPrepared.GuardFailure?.Category.ToString());
            var guardReason = NormalizeForcedGuardReason(sharedPrepared.GuardFailure?.ReasonCode);
            var guardDetail = NormalizeForcedToolValue(sharedPrepared.GuardFailure?.Detail, "-");
            _auditLogger.Log(
                "telegram",
                "telegram_guard_meta",
                sharedPrepared.GuardFailure is null ? "ok" : "blocked",
                $"route={NormalizeAuditToken(blockedAssistantMeta, "-")} guardCategory={guardCategory} guardReason={guardReason} guardDetail={guardDetail}"
            );
            SetCurrentTelegramExecutionMetadata(
                sharedPrepared.GuardFailure,
                sharedPrepared.RetryAttempt,
                sharedPrepared.RetryMaxAttempts,
                sharedPrepared.RetryStopReason
            );
            return blockedResponseText;
        }

        var preparedInput = await PrepareTelegramInputAsync(
            sharedPrepared.Text,
            cancellationToken,
            preserveContext: isSkillContextQuery
                             || hasStickyActiveSkillForTelegram
                             || thinkPlusActiveForTelegram
                             || effectiveWebSearchEnabled
                             || normalizedAttachments.Count > 0
        );

        preparedInput = ApplySelectedSkillToPrompt(
            preparedInput,
            requestedSkillName,
            null
        );

        // Think+ 활성이면 sharedPrepared 앞에 web context prepend
        if (thinkPlusActiveForTelegram)
        {
            var effectiveSkillForThinkPlus = ResolveEffectiveSkillNameForThread(requestedSkillName, telegramStateKey);
            var thinkPlusContext = await BuildThinkPlusContextAsync(
                requestText,
                "telegram",
                cancellationToken,
                effectiveSkillForThinkPlus
            ).ConfigureAwait(false);
            if (!string.IsNullOrEmpty(thinkPlusContext))
            {
                preparedInput = thinkPlusContext + preparedInput;
            }
        }

        var thinkingLevel = TelegramPromptPolicy.ResolveThinkingLevel(snapshot, requestText);
        var profiledInput = BuildTelegramProfilePrompt(preparedInput, snapshot.Profile, thinkingLevel);
        var contextualProfiledInput = BuildContextualInput(
            session.SessionId,
            profiledInput,
            session.LinkedMemoryNotes,
            contextDecisionInput: effectiveTopicInput
        );
        var shouldSkipDriftRecovery = ShouldSkipTelegramDriftRecovery(contextualProfiledInput, effectiveTopicInput, preparedInput);

        string responseText;
        string providerForMemory;
        string modelForMemory;
        string assistantMeta;
        var effectiveGuardFailure = sharedPrepared.GuardFailure;

        void CaptureTelegramExecutionMeta()
        {
            SetCurrentTelegramExecutionMetadata(
                effectiveGuardFailure,
                sharedPrepared.RetryAttempt,
                sharedPrepared.RetryMaxAttempts,
                sharedPrepared.RetryStopReason
            );
        }

        void LogTelegramGuardMeta(string route)
        {
            var guardCategory = NormalizeForcedGuardCategory(effectiveGuardFailure?.Category.ToString());
            var guardReason = NormalizeForcedGuardReason(effectiveGuardFailure?.ReasonCode);
            var guardDetail = NormalizeForcedToolValue(effectiveGuardFailure?.Detail, "-");
            _auditLogger.Log(
                "telegram",
                "telegram_guard_meta",
                effectiveGuardFailure is null ? "ok" : "blocked",
                $"route={NormalizeAuditToken(route, "-")} guardCategory={guardCategory} guardReason={guardReason} guardDetail={guardDetail}"
            );
        }

        if (snapshot.Mode == "orchestration")
        {
            var orchestrated = await ChatOrchestrationAsync(
                contextualProfiledInput,
                "telegram",
                snapshot.OrchestrationProvider,
                snapshot.OrchestrationModel,
                null,
                null,
                null,
                null,
                null,
                null,
                normalizedAttachments,
                cancellationToken
            );
            var citationBundle = BuildAndLogCitationMappings(
                "telegram",
                "telegram-orchestration",
                sharedPrepared.Citations,
                ("text", orchestrated.Text)
            );
            effectiveGuardFailure = sharedPrepared.GuardFailure;
            var orchestratedValidated = ApplyListCountFallback(requestText, orchestrated.Text, sharedPrepared.Citations);
            orchestratedValidated = ApplySkillCreateDirective(orchestratedValidated, "telegram");
            orchestratedValidated = CleanLeakedSystemMarkers(orchestratedValidated);
            responseText = AppendTelegramResponseFooter(
                FormatTelegramResponse(orchestratedValidated, TelegramMaxResponseChars),
                "orchestration",
                orchestrated.Route,
                telegramStateKey
            );
            providerForMemory = NormalizeProvider(snapshot.OrchestrationProvider, allowAuto: true);
            if (providerForMemory is "auto" or "none")
            {
                providerForMemory = "gemini";
            }

            modelForMemory = string.IsNullOrWhiteSpace(snapshot.OrchestrationModel) ? "-" : snapshot.OrchestrationModel;
            assistantMeta = $"telegram-orchestration:{orchestrated.Route}";
            return await FinalizeTelegramChatResponseAsync(
                session,
                requestText,
                responseText,
                assistantMeta,
                providerForMemory,
                modelForMemory,
                thinkPlusToggleNote,
                effectiveGuardFailure,
                sharedPrepared.RetryAttempt,
                sharedPrepared.RetryMaxAttempts,
                sharedPrepared.RetryStopReason,
                cancellationToken
            );
        }

        if (snapshot.Mode == "multi")
        {
            var multi = await ChatMultiAsync(
                contextualProfiledInput,
                "telegram",
                snapshot.MultiGroqModel,
                snapshot.MultiGeminiModel,
                snapshot.MultiCopilotModel,
                snapshot.MultiCerebrasModel,
                snapshot.MultiSummaryProvider,
                snapshot.MultiCodexModel,
                snapshot.MultiNvidiaModel,
                normalizedAttachments,
                cancellationToken
            );
            var citationBundle = BuildAndLogCitationMappings(
                "telegram",
                "telegram-multi",
                sharedPrepared.Citations,
                ("groq", multi.GroqText),
                ("gemini", multi.GeminiText),
                ("cerebras", multi.CerebrasText),
                ("nvidia", multi.NvidiaText),
                ("copilot", multi.CopilotText),
                ("codex", multi.CodexText),
                ("summary", multi.Summary)
            );
            effectiveGuardFailure = sharedPrepared.GuardFailure;
            var multiSummaryValidated = ApplyListCountFallback(requestText, multi.Summary, sharedPrepared.Citations);
            multiSummaryValidated = ApplySkillCreateDirective(multiSummaryValidated, "telegram");
            multiSummaryValidated = CleanLeakedSystemMarkers(multiSummaryValidated);
            responseText = AppendTelegramResponseFooter(
                FormatTelegramResponse(multiSummaryValidated, TelegramMaxResponseChars),
                "multi",
                "summary",
                telegramStateKey
            );
            providerForMemory = NormalizeProvider(multi.ResolvedSummaryProvider, allowAuto: true);
            if (providerForMemory is "auto" or "none")
            {
                providerForMemory = "gemini";
            }

            modelForMemory = providerForMemory switch
            {
                "groq" => multi.GroqModel,
                "gemini" => multi.GeminiModel,
                "cerebras" => multi.CerebrasModel,
                "nvidia" => multi.NvidiaModel,
                "copilot" => multi.CopilotModel,
                "codex" => multi.CodexModel,
                _ => "-"
            };
            assistantMeta = $"telegram-multi:summary={multi.ResolvedSummaryProvider}";
            responseText = ApplyThinkPlusToggleNoteIfAny(thinkPlusToggleNote, responseText);
            _conversationStore.AppendMessage(session.Thread.Id, "user", requestText, "telegram:user");
            _conversationStore.AppendMessage(session.Thread.Id, "assistant", responseText, assistantMeta);
            await EnsureConversationTitleFromFirstTurnAsync(session.Thread.Id, providerForMemory, modelForMemory, cancellationToken);
            _ = await MaybeCompressConversationAsync(session.Thread.Id, "chat-single", providerForMemory, modelForMemory, cancellationToken);
            LogTelegramGuardMeta(assistantMeta);
            CaptureTelegramExecutionMeta();
            return responseText;
        }

        if (snapshot.SingleProvider == "groq")
        {
            var preferredModel = NormalizeModelSelection(snapshot.SingleModel)
                                 ?? NormalizeModelSelection(_providers.GroqModel)
                                 ?? DefaultGroqPrimaryModel;
            var providerPrepared = await PrepareInputForProviderAsync(
                contextualProfiledInput,
                "groq",
                preferredModel,
                normalizedAttachments,
                webUrls,
                effectiveWebSearchEnabled,
                false,
                cancellationToken
            );
            if (!string.IsNullOrWhiteSpace(providerPrepared.UnsupportedMessage))
            {
                responseText = AppendTelegramResponseFooter(
                    providerPrepared.UnsupportedMessage,
                    "groq",
                    preferredModel,
                    telegramStateKey
                );
                responseText = ApplyThinkPlusToggleNoteIfAny(thinkPlusToggleNote, responseText);
                providerForMemory = "groq";
                modelForMemory = preferredModel;
                assistantMeta = $"telegram-single:groq:{preferredModel}:unsupported";
                return await FinalizeTelegramChatResponseAsync(
                    session,
                    requestText,
                    responseText,
                    assistantMeta,
                    providerForMemory,
                    modelForMemory,
                    thinkPlusToggleNote,
                    effectiveGuardFailure,
                    sharedPrepared.RetryAttempt,
                    sharedPrepared.RetryMaxAttempts,
                    sharedPrepared.RetryStopReason,
                    cancellationToken
                );
            }

            var singleGroq = await ExecuteTelegramGroqSingleAsync(
                requestText,
                providerPrepared.Text,
                snapshot,
                thinkingLevel,
                streamCallback,
                cancellationToken
            );
            if (!shouldSkipDriftRecovery && !_context.EnableFastWebPipeline && ChatRetryGuardPolicy.ShouldRetryWithoutHistory(requestText, singleGroq.Text))
            {
                var historyBypassInput = ChatRetryGuardPolicy.BuildHistoryBypassInput(providerPrepared.Text);
                var recovered = await ExecuteTelegramGroqSingleAsync(
                    requestText,
                    historyBypassInput,
                    snapshot,
                    thinkingLevel,
                    streamCallback,
                    cancellationToken
                );
                if (!string.IsNullOrWhiteSpace(recovered.Text)
                    && !ChatRetryGuardPolicy.ShouldRetryWithoutHistory(requestText, recovered.Text))
                {
                    singleGroq = recovered;
                }
                else
                {
                    var originalRequestInput = ChatRetryGuardPolicy.BuildOriginalRequestRetryInput(requestText);
                    var originalRecovered = await ExecuteTelegramGroqSingleAsync(
                        requestText,
                        originalRequestInput,
                        snapshot,
                        thinkingLevel,
                        streamCallback,
                        cancellationToken
                    );
                    singleGroq = !string.IsNullOrWhiteSpace(originalRecovered.Text)
                                 && !ChatRetryGuardPolicy.ShouldRetryWithoutHistory(requestText, originalRecovered.Text)
                        ? originalRecovered
                        : new LlmSingleChatResult(singleGroq.Provider, singleGroq.Model, ChatRetryGuardPolicy.BuildOffTopicGuardMessage(requestText));
                }
            }
            var citationBundle = BuildAndLogCitationMappings(
                "telegram",
                "telegram-single-groq",
                sharedPrepared.Citations,
                ("text", singleGroq.Text)
            );
            effectiveGuardFailure = sharedPrepared.GuardFailure;
            var singleGroqText = ApplySkillCreateDirective(singleGroq.Text, "telegram");
            singleGroqText = CleanLeakedSystemMarkers(singleGroqText);
            responseText = AppendTelegramResponseFooter(
                FormatTelegramResponse(singleGroqText, TelegramMaxResponseChars),
                singleGroq.Provider,
                singleGroq.Model,
                telegramStateKey
            );
            responseText = ApplyThinkPlusToggleNoteIfAny(thinkPlusToggleNote, responseText);
            providerForMemory = singleGroq.Provider;
            modelForMemory = singleGroq.Model;
            assistantMeta = $"telegram-single:{singleGroq.Provider}:{singleGroq.Model}";
            return await FinalizeTelegramChatResponseAsync(
                session,
                requestText,
                responseText,
                assistantMeta,
                providerForMemory,
                modelForMemory,
                thinkPlusToggleNote,
                effectiveGuardFailure,
                sharedPrepared.RetryAttempt,
                sharedPrepared.RetryMaxAttempts,
                sharedPrepared.RetryStopReason,
                cancellationToken
            );
        }

        var singleModel = ResolveModel(snapshot.SingleProvider, snapshot.SingleModel);
        var providerInput = await PrepareInputForProviderAsync(
            contextualProfiledInput,
            snapshot.SingleProvider,
            singleModel,
            normalizedAttachments,
            resolvedWebUrls,
            effectiveWebSearchEnabled,
            false,
            cancellationToken
        );
        if (!string.IsNullOrWhiteSpace(providerInput.UnsupportedMessage))
        {
            responseText = AppendTelegramResponseFooter(
                providerInput.UnsupportedMessage,
                snapshot.SingleProvider,
                singleModel,
                telegramStateKey
            );
            responseText = ApplyThinkPlusToggleNoteIfAny(thinkPlusToggleNote, responseText);
            providerForMemory = snapshot.SingleProvider;
            modelForMemory = singleModel;
            assistantMeta = $"telegram-single:{snapshot.SingleProvider}:{singleModel}:unsupported";
            return await FinalizeTelegramChatResponseAsync(
                session,
                requestText,
                responseText,
                assistantMeta,
                providerForMemory,
                modelForMemory,
                thinkPlusToggleNote,
                effectiveGuardFailure,
                sharedPrepared.RetryAttempt,
                sharedPrepared.RetryMaxAttempts,
                sharedPrepared.RetryStopReason,
                cancellationToken
            );
        }

        var single = await ChatSingleAsync(
            providerInput.Text,
            snapshot.SingleProvider,
            snapshot.SingleModel,
            "telegram",
            cancellationToken,
            ChatRetryGuardPolicy.ResolveSingleChatMaxOutputTokens(requestText),
            streamCallback
        );
        if (!shouldSkipDriftRecovery && !_context.EnableFastWebPipeline && ChatRetryGuardPolicy.ShouldRetryWithoutHistory(requestText, single.Text))
        {
            var historyBypassInput = ChatRetryGuardPolicy.BuildHistoryBypassInput(providerInput.Text);
            var recovered = await ChatSingleAsync(
                historyBypassInput,
                snapshot.SingleProvider,
                snapshot.SingleModel,
                "telegram",
                cancellationToken,
                ChatRetryGuardPolicy.ResolveSingleChatMaxOutputTokens(requestText),
                streamCallback
            );
            if (!string.IsNullOrWhiteSpace(recovered.Text)
                && !ChatRetryGuardPolicy.ShouldRetryWithoutHistory(requestText, recovered.Text))
            {
                single = recovered;
            }
            else
            {
                var originalRequestInput = ChatRetryGuardPolicy.BuildOriginalRequestRetryInput(requestText);
                var originalRecovered = await ChatSingleAsync(
                    originalRequestInput,
                    snapshot.SingleProvider,
                    snapshot.SingleModel,
                    "telegram",
                    cancellationToken,
                    ChatRetryGuardPolicy.ResolveSingleChatMaxOutputTokens(requestText),
                    streamCallback
                );
                single = !string.IsNullOrWhiteSpace(originalRecovered.Text)
                         && !ChatRetryGuardPolicy.ShouldRetryWithoutHistory(requestText, originalRecovered.Text)
                    ? originalRecovered
                    : new LlmSingleChatResult(single.Provider, single.Model, ChatRetryGuardPolicy.BuildOffTopicGuardMessage(requestText));
            }
        }
        var singleCitationBundle = BuildAndLogCitationMappings(
            "telegram",
            "telegram-single",
            sharedPrepared.Citations,
            ("text", single.Text)
        );
        effectiveGuardFailure = sharedPrepared.GuardFailure;
        var singleText = ApplySkillCreateDirective(single.Text, "telegram");
        singleText = CleanLeakedSystemMarkers(singleText);
        responseText = AppendTelegramResponseFooter(
            FormatTelegramResponse(singleText, TelegramMaxResponseChars),
            single.Provider,
            single.Model,
            telegramStateKey
        );
        responseText = ApplyThinkPlusToggleNoteIfAny(thinkPlusToggleNote, responseText);
        providerForMemory = single.Provider;
        modelForMemory = single.Model;
        assistantMeta = $"telegram-single:{single.Provider}:{single.Model}";
        return await FinalizeTelegramChatResponseAsync(
            session,
            requestText,
            responseText,
            assistantMeta,
            providerForMemory,
            modelForMemory,
            thinkPlusToggleNote,
            effectiveGuardFailure,
            sharedPrepared.RetryAttempt,
            sharedPrepared.RetryMaxAttempts,
            sharedPrepared.RetryStopReason,
            cancellationToken
        );
    }

    // 응답 텍스트 끝에 inline keyboard 버튼 마커를 첨부. TelegramUpdateLoop이 이 마커를 파싱해
    // 본문에서 떼어낸 뒤 callback_data 버튼으로 변환해 전송한다. 마커가 없으면 일반 sendMessage.
    // 형식:
    //   __TG_BUTTONS__
    //   /skill off|🚫 끄기
    //   /skill list|📋 목록
    //   __/TG_BUTTONS__
    internal const string TelegramButtonsMarkerOpen = "__TG_BUTTONS__";
    internal const string TelegramButtonsMarkerClose = "__/TG_BUTTONS__";

    private static string AppendTelegramInlineButtons(string body, params (string Command, string Label)[] buttons)
    {
        if (buttons == null || buttons.Length == 0)
        {
            return body;
        }
        var sb = new StringBuilder();
        sb.Append(body?.TrimEnd() ?? string.Empty);
        sb.Append("\n\n");
        sb.Append(TelegramButtonsMarkerOpen);
        sb.Append('\n');
        foreach (var (cmd, label) in buttons)
        {
            if (string.IsNullOrWhiteSpace(cmd) || string.IsNullOrWhiteSpace(label))
            {
                continue;
            }
            sb.Append(cmd.Trim());
            sb.Append('|');
            sb.Append(label.Trim());
            sb.Append('\n');
        }
        sb.Append(TelegramButtonsMarkerClose);
        return sb.ToString();
    }

    private async Task<LlmSingleChatResult> ExecuteTelegramGroqSingleAsync(
        string rawUserInput,
        string profiledInput,
        TelegramLlmPreferences snapshot,
        string thinkingLevel,
        Action<string>? streamCallback,
        CancellationToken cancellationToken
    )
    {
        _ = rawUserInput;
        _ = snapshot;

        var selectedModel = NormalizeModelSelection(snapshot.SingleModel)
            ?? (string.IsNullOrWhiteSpace(_providers.GroqModel) ? DefaultGroqPrimaryModel : _providers.GroqModel);
        var maxTokens = thinkingLevel == "high"
            ? TelegramComplexModeMaxOutputTokens
            : TelegramFastModeMaxOutputTokens;
        var generated = await ExecuteGroqSingleChainAsync(
            profiledInput,
            selectedModel,
            cancellationToken,
            maxTokens,
            streamCallback
        );
        return new LlmSingleChatResult(generated.Provider, generated.Model, ChatOutputSanitizerPolicy.Sanitize(generated.Text));
    }

    private async Task<string> PrepareTelegramInputAsync(
        string input,
        CancellationToken cancellationToken,
        bool preserveContext = false
    )
    {
        var text = (input ?? string.Empty).Trim();
        if (preserveContext)
        {
            return BuildTelegramFullFidelityPrompt(text);
        }

        if (text.Length <= TelegramLongContextThresholdChars)
        {
            return BuildTelegramConcisePrompt(text);
        }

        var compressionPrompt = TelegramPromptPolicy.BuildCompressionPrompt(text);
        string compressed;
        if (_llmRouter.HasGroqApiKey())
        {
            var groq = await GenerateByProviderSafeAsync(
                "groq",
                string.IsNullOrWhiteSpace(_providers.GroqModel) ? DefaultGroqPrimaryModel : _providers.GroqModel,
                compressionPrompt,
                cancellationToken,
                700
            );
            compressed = ChatOutputSanitizerPolicy.Sanitize(groq.Text);
        }
        else if (_llmRouter.HasGeminiApiKey())
        {
            var gemini = await GenerateByProviderSafeAsync("gemini", _providers.GeminiModel, compressionPrompt, cancellationToken, 700);
            compressed = ChatOutputSanitizerPolicy.Sanitize(gemini.Text);
        }
        else
        {
            compressed = text.Length <= TelegramLongContextTargetChars
                ? text
                : text[..TelegramLongContextTargetChars] + "\n...(long_input_trimmed)";
        }

        if (string.IsNullOrWhiteSpace(compressed))
        {
            compressed = text.Length <= TelegramLongContextTargetChars
                ? text
                : text[..TelegramLongContextTargetChars] + "\n...(long_input_trimmed)";
        }

        return BuildTelegramConcisePrompt($"[긴 입력 자동 요약]\n{compressed}");
    }

    private static bool ShouldSkipTelegramDriftRecovery(
        string contextualInput,
        string effectiveTopicInput,
        string preparedInput
    )
    {
        var combined = $"{contextualInput}\n{effectiveTopicInput}\n{preparedInput}";
        return combined.Contains("[최근 대화]", StringComparison.Ordinal)
               || combined.Contains("[직전 주제]", StringComparison.Ordinal)
               || combined.Contains("[정정 요청]", StringComparison.Ordinal)
               || combined.Contains("[사용자 추가 피드백]", StringComparison.Ordinal)
               || combined.Contains("[Project Context]", StringComparison.Ordinal)
               || combined.Contains("[Active Skill", StringComparison.Ordinal)
               || combined.Contains("[Think+ 참고 자료", StringComparison.Ordinal)
               || combined.Contains("[첨부 텍스트 파일]", StringComparison.Ordinal)
               || combined.Contains("[첨부 이미지/파일 분석 요약]", StringComparison.Ordinal)
               || combined.Contains("[웹 컨텍스트]", StringComparison.Ordinal)
               || combined.Contains("[검색 컨텍스트]", StringComparison.Ordinal)
               || combined.Contains("[Forced", StringComparison.Ordinal);
    }

    private static string BuildTelegramProfilePrompt(string concisePrompt, string profile, string thinkingLevel)
    {
        return TelegramPromptPolicy.BuildProfilePrompt(concisePrompt, profile, thinkingLevel, LocalTimeTextPolicy.BuildLocalNowText());
    }

    private static string BuildOrchestrationPrompt(
        string userText,
        IReadOnlyList<LlmSingleChatResult> workerResults,
        IReadOnlyDictionary<string, string> roleByProvider
    )
    {
        return TelegramPromptPolicy.BuildOrchestrationPrompt(userText, workerResults, roleByProvider);
    }

    private static string TrimForOutput(string text, int limit = 3500) =>
        TextOutputTruncator.TruncateWithMin200(text, limit);

    private static string BuildTelegramConcisePrompt(string input)
    {
        return TelegramPromptPolicy.BuildConcisePrompt(input, LocalTimeTextPolicy.BuildLocalNowText());
    }

    private static string BuildTelegramFullFidelityPrompt(string input)
    {
        return TelegramPromptPolicy.BuildFullFidelityPrompt(input, LocalTimeTextPolicy.BuildLocalNowText());
    }

    // 응답 본문 끝에 provider·model·active skill 정보를 짧은 footer로 붙인다.
    // 기존의 `[Single groq:gpt-...]` 헤더 대신 본문이 먼저 보이도록 하단으로 이동.
    private string AppendTelegramResponseFooter(
        string body,
        string? provider,
        string? model,
        string? sessionId,
        string? extraLabel = null
    )
    {
        var bodyTrim = (body ?? string.Empty).TrimEnd();
        var parts = new List<string>(4);
        var providerLabel = string.IsNullOrWhiteSpace(provider) ? "—" : provider!.Trim();
        var modelLabel = string.IsNullOrWhiteSpace(model) ? "—" : model!.Trim();
        parts.Add($"{providerLabel}·{modelLabel}");
        if (!string.IsNullOrWhiteSpace(extraLabel))
        {
            parts.Add(extraLabel!.Trim());
        }
        if (!string.IsNullOrWhiteSpace(sessionId)
            && _activeSkillByThread.TryGetValue(sessionId!, out var activeSkill)
            && !string.IsNullOrWhiteSpace(activeSkill))
        {
            parts.Add($"🎯 {activeSkill}");
        }
        return bodyTrim + "\n\n— " + string.Join(" · ", parts);
    }

    private static string FormatTelegramResponse(string text, int maxChars)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return "응답이 비어 있습니다.";
        }

        const bool keepMarkdownTables = true;
        var sanitized = ChatOutputSanitizerPolicy.Sanitize(text, keepMarkdownTables: keepMarkdownTables);
        return TelegramResponseFormatterPolicy.FormatSanitizedResponse(
            sanitized,
            maxChars,
            ChatOutputSanitizerPolicy.NormalizeStructuredLabelBlocks,
            ChatOutputSanitizerPolicy.IsStandaloneNumberedHeadlineLine,
            ChatOutputSanitizerPolicy.IsMarkdownTableRow
        );
    }

    private static HttpClient CreateWebFetchClient()
    {
        var client = new HttpClient
        {
            Timeout = TimeSpan.FromSeconds(10)
        };
        client.DefaultRequestHeaders.TryAddWithoutValidation("User-Agent", "omnux/1.0");
        return client;
    }

    private static string ParseHelpTopicFromInput(string text)
    {
        var tokens = (text ?? string.Empty)
            .Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (tokens.Length < 2)
        {
            return string.Empty;
        }

        var topic = tokens[1].Trim().ToLowerInvariant();
        if (topic is "llm" or "model" or "models" or "모델")
        {
            return "llm";
        }

        if (topic is "routine" or "routines" or "루틴")
        {
            return "routine";
        }

        if (topic is "coding" or "code-run" or "코딩")
        {
            return "coding";
        }

        if (topic is "refactor" or "safe-refactor" or "safe_refactor" or "리팩터")
        {
            return "refactor";
        }

        if (topic is "plan" or "plans" or "planning" or "계획")
        {
            return "plan";
        }

        if (topic is "task" or "tasks" or "작업" or "태스크")
        {
            return "task";
        }

        if (topic is "doctor" or "진단" or "점검")
        {
            return "doctor";
        }

        if (topic is "notebook" or "노트북" or "handoff" or "인수인계")
        {
            return "notebook";
        }

        if (topic is "memory" or "메모리")
        {
            return "memory";
        }

        if (topic is "natural" or "대화" or "자연어")
        {
            return "natural";
        }

        return string.Empty;
    }

    private static string BuildTelegramHelpText(string? topic = null)
    {
        return TelegramHelpTextPolicy.Build(topic);
    }

    private string BuildTelegramUpgradeQuotaStatePath()
    {
        var baseDir = Path.GetDirectoryName(_paths.LlmUsageStatePath);
        if (string.IsNullOrWhiteSpace(baseDir))
        {
            var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            baseDir = string.IsNullOrWhiteSpace(home) ? Path.GetTempPath() : Path.Combine(home, ".omnux");
        }

        return Path.Combine(baseDir, "telegram_upgrade_quota.state");
    }

    private void LoadTelegramUpgradeQuotaState()
    {
        lock (_telegramUpgradeQuotaLock)
        {
            _telegramUpgradeQuotaDay = GetCurrentQuotaDayKey();
            _telegramUpgradeQuotaCount = 0;
            try
            {
                if (!File.Exists(_telegramUpgradeQuotaStatePath))
                {
                    return;
                }

                var text = File.ReadAllText(_telegramUpgradeQuotaStatePath, Encoding.UTF8).Trim();
                if (string.IsNullOrWhiteSpace(text))
                {
                    return;
                }

                var parts = text.Split('|', StringSplitOptions.TrimEntries);
                if (parts.Length < 2)
                {
                    return;
                }

                if (!int.TryParse(parts[1], NumberStyles.Integer, CultureInfo.InvariantCulture, out var count))
                {
                    return;
                }

                if (parts[0] == _telegramUpgradeQuotaDay)
                {
                    _telegramUpgradeQuotaCount = Math.Max(0, count);
                }
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"[telegram-quota] load failed: {ex.Message}");
            }
        }
    }

    private void SaveTelegramUpgradeQuotaState()
    {
        lock (_telegramUpgradeQuotaLock)
        {
            try
            {
                var dir = Path.GetDirectoryName(_telegramUpgradeQuotaStatePath);
                if (!string.IsNullOrWhiteSpace(dir))
                {
                    Directory.CreateDirectory(dir);
                }

                var content = $"{_telegramUpgradeQuotaDay}|{_telegramUpgradeQuotaCount.ToString(CultureInfo.InvariantCulture)}";
                AtomicFileStore.WriteAllText(_telegramUpgradeQuotaStatePath, content, ownerOnly: true);
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"[telegram-quota] save failed: {ex.Message}");
            }
        }
    }

    private void NormalizeTelegramQuotaDayLocked()
    {
        var day = GetCurrentQuotaDayKey();
        if (_telegramUpgradeQuotaDay == day)
        {
            return;
        }

        _telegramUpgradeQuotaDay = day;
        _telegramUpgradeQuotaCount = 0;
        SaveTelegramUpgradeQuotaState();
    }

    private bool TryConsumeTelegramUpgradeQuota()
    {
        lock (_telegramUpgradeQuotaLock)
        {
            NormalizeTelegramQuotaDayLocked();
            if (_telegramUpgradeQuotaCount >= TelegramUpgradeDailyCap)
            {
                return false;
            }

            _telegramUpgradeQuotaCount += 1;
            SaveTelegramUpgradeQuotaState();
            return true;
        }
    }

    private (string DayKey, int Used, int Cap) GetTelegramUpgradeQuotaSnapshot()
    {
        lock (_telegramUpgradeQuotaLock)
        {
            NormalizeTelegramQuotaDayLocked();
            return (_telegramUpgradeQuotaDay, _telegramUpgradeQuotaCount, TelegramUpgradeDailyCap);
        }
    }

    private static string GetCurrentQuotaDayKey()
    {
        return DateTimeOffset.Now.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
    }

}
