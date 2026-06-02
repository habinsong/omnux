using System.Diagnostics;
using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Omnux.Middleware;

public sealed partial class CommandService
{
    private void RecordEvent(string message)
    {
        lock (_eventLock)
        {
            _recentEvents.Enqueue($"{DateTimeOffset.UtcNow:O} {message}");
            while (_recentEvents.Count > 50)
            {
                _recentEvents.Dequeue();
            }
        }
    }

    internal void RecordRoutedEvent(string message)
    {
        RecordEvent(message);
    }

    private string BuildContextSnapshot(string latestMetrics)
    {
        List<string> events;
        lock (_eventLock)
        {
            events = _recentEvents.ToList();
        }

        var builder = new System.Text.StringBuilder();
        builder.AppendLine("latest_metrics:");
        builder.AppendLine(latestMetrics);
        builder.AppendLine("recent_events:");
        foreach (var item in events)
        {
            builder.AppendLine(item);
        }
        return builder.ToString().Trim();
    }

    private async Task<string> ChatFallbackForUnknownAsync(string text, CancellationToken cancellationToken)
    {
        if (IsCopilotResponseTestPrompt(text))
        {
            return BuildMockCopilotTestResponse(_copilotWrapper.GetSelectedModel());
        }

        if (_llmRouter.HasGeminiApiKey())
        {
            return await _llmRouter.GenerateGeminiChatAsync(text, cancellationToken);
        }

        if (_llmRouter.HasGroqApiKey())
        {
            return await _llmRouter.GenerateGroqChatAsync(text, _llmRouter.GetSelectedGroqModel(), cancellationToken);
        }

        var copilotStatus = await _copilotWrapper.GetStatusAsync(cancellationToken);
        if (copilotStatus.Installed && copilotStatus.Authenticated)
        {
            return await _copilotWrapper.GenerateChatAsync(text, _copilotWrapper.GetSelectedModel(), cancellationToken);
        }

        return "LLM API 키(Groq/Gemini) 또는 Copilot 인증이 없어 일반 대화를 처리할 수 없습니다.";
    }

    private ConversationThreadView PrepareConversation(
        string scope,
        string mode,
        string? conversationId,
        string? conversationTitle,
        string? project,
        string? category,
        IReadOnlyList<string>? tags,
        IReadOnlyList<string>? linkedMemoryNotes
    )
    {
        var safeConversationId = conversationId;
        if (!string.IsNullOrWhiteSpace(safeConversationId))
        {
            var existing = _conversationStore.Get(safeConversationId.Trim());
            if (existing != null
                && (!existing.Scope.Equals(scope, StringComparison.OrdinalIgnoreCase)
                    || !existing.Mode.Equals(mode, StringComparison.OrdinalIgnoreCase)))
            {
                safeConversationId = null;
            }
        }

        var thread = _conversationStore.Ensure(scope, mode, safeConversationId, conversationTitle, project, category, tags);
        var mergedNotes = MemoryNoteSelectionPolicy.MergeNames(thread.LinkedMemoryNotes, linkedMemoryNotes);
        if (mergedNotes.Count != thread.LinkedMemoryNotes.Count
            || mergedNotes.Except(thread.LinkedMemoryNotes, StringComparer.OrdinalIgnoreCase).Any())
        {
            thread = _conversationStore.SetLinkedMemoryNotes(thread.Id, mergedNotes);
        }

        return thread;
    }

    private SessionContext PrepareSessionContext(
        string scope,
        string mode,
        string? conversationId,
        string? conversationTitle,
        string? project,
        string? category,
        IReadOnlyList<string>? tags,
        IReadOnlyList<string>? linkedMemoryNotes,
        string? source
    )
    {
        var thread = PrepareConversation(
            scope,
            mode,
            conversationId,
            conversationTitle,
            project,
            category,
            tags,
            linkedMemoryNotes
        );
        return SessionContext.Create(thread, source);
    }

    private string BuildContextualInput(
        string conversationId,
        string input,
        IReadOnlyList<string>? requestMemoryNotes,
        bool includeLocalTimeHint = false,
        string? contextDecisionInput = null
    )
    {
        var contextDecisionText = contextDecisionInput ?? input;
        var suppressPriorContext = SearchQueryPolicy.LooksLikeStandaloneFreshGreeting(contextDecisionText);
        var includePriorContext = !suppressPriorContext && ShouldUsePriorConversationContext(conversationId, contextDecisionText);
        var explicitRequestNotes = MemoryNoteSelectionPolicy.NormalizeExplicitNames(requestMemoryNotes);
        // linked memory notes는 압축된 대화 맥락이므로 includePriorContext와 무관하게 항상 로드.
        // 그렇지 않으면 압축 직후 첫 질문에서 맥락이 단절됨.
        // 단독 인사는 새 대화 행위라서 이전 주제 메모리도 함께 붙이지 않는다.
        var autoLinkedNotes = suppressPriorContext
            ? Array.Empty<string>()
            : _conversationStore.Get(conversationId)?.LinkedMemoryNotes ?? Array.Empty<string>();
        var notes = MemoryNoteSelectionPolicy.MergeNames(
            autoLinkedNotes,
            explicitRequestNotes
        );
        var noteBlocks = new List<string>();
        foreach (var name in notes.Take(4))
        {
            var read = _memoryNoteStore.Read(name);
            if (read == null)
            {
                continue;
            }

            var content = read.Content.Length > 900 ? read.Content[..900] + "\n...(truncated)" : read.Content;
            noteBlocks.Add($"### {name}\n{content}");
        }

        var history = string.Empty;
        if (includePriorContext)
        {
            var historyRaw = _conversationStore.BuildHistoryText(conversationId, _context.ConversationHistoryMessages);
            history = ConversationHistoryPolicy.BuildBudgetedContextHistory(historyRaw, 5200);
        }

        var builder = new StringBuilder();
        builder.AppendLine("[컨텍스트 사용 규칙]");
        builder.AppendLine("- '새 요청'을 최우선으로 처리하세요.");
        builder.AppendLine("- 새 요청이 '왜/그럼/그래서/그건/이건/예시는/근거는/더 자세히/다시'처럼 짧은 후속 질문이면 [최근 대화]의 바로 직전 주제와 답변을 기준으로 해석하세요.");
        builder.AppendLine("- 새 요청에 자체 주제와 대상이 분명하면 [최근 대화]는 배경으로만 참고하고, 이전 주제를 끌고 오지 마세요.");
        builder.AppendLine("- 제공된 최근 대화/메모리와 새 요청이 충돌하면 새 요청을 따르세요.");
        builder.AppendLine("- 이전 답변 형식(예: 뉴스 N건 목록)을 관성으로 복사하지 마세요.");
        builder.AppendLine("- 절대 답변에 [user], [assistant], [system], [Single ...], [Multi ...], [Project Context], [Active Skill ...], [Think+ ...], [컨텍스트 ...], [최근 대화], [공유 메모리 노트], [새 요청], [로컬 시간] 같은 내부 마커/헤더를 출력하지 마세요. 이 마커들은 LLM 입력 구조용이며 사용자에게 보일 답변이 아닙니다.");
        builder.AppendLine("- '확인.', '준비되었습니다.', '질문해 주세요.' 같이 내용 없는 인사·확인 응답을 답변에 넣지 마세요. 사용자의 질문에 직접 답하세요.");
        builder.AppendLine();
        if (noteBlocks.Count > 0)
        {
            builder.AppendLine("[공유 메모리 노트]");
            builder.AppendLine(string.Join("\n\n", noteBlocks));
            builder.AppendLine();
        }

        if (!string.IsNullOrWhiteSpace(history))
        {
            builder.AppendLine("[최근 대화]");
            builder.AppendLine(history);
            builder.AppendLine();
        }

        if (includeLocalTimeHint && SearchQueryPolicy.LooksLikeLocalDateTimeQuestion(contextDecisionText))
        {
            builder.AppendLine("[로컬 시간]");
            builder.AppendLine(LocalTimeTextPolicy.BuildLocalNowText());
            builder.AppendLine("- 현재 시각/날짜/요일/타임존 관련 질문은 위 로컬 시간을 기준으로 답하세요.");
            builder.AppendLine();
        }

        builder.AppendLine("[새 요청]");
        builder.AppendLine(input.Trim());
        var contextual = builder.ToString().Trim();
        if (contextual.Length <= 8000)
        {
            return contextual;
        }

        // 8000자 초과 시 꼬리 잘림 대신: 규칙 블록 + 새 요청을 우선 보존하고
        // [최근 대화] 섹션만 축소.
        var requestMarker = "\n[새 요청]";
        var requestIdx = contextual.IndexOf(requestMarker, StringComparison.Ordinal);
        if (requestIdx < 0)
        {
            return $"[context_truncated]\n{contextual[^8000..]}";
        }

        var headerAndHistory = contextual[..requestIdx];
        var requestSection = contextual[requestIdx..];
        var availableForHeaderAndHistory = 8000 - requestSection.Length - 50;

        if (availableForHeaderAndHistory <= 200)
        {
            return $"[context_truncated]\n{requestSection.TrimStart()}";
        }

        if (headerAndHistory.Length <= availableForHeaderAndHistory)
        {
            return $"{headerAndHistory}{requestSection}";
        }

        // 규칙 블록(~400자)은 보존, 히스토리만 축소
        var historyMarker = "\n[최근 대화]";
        var historyIdx = headerAndHistory.IndexOf(historyMarker, StringComparison.Ordinal);
        if (historyIdx < 0)
        {
            return $"{headerAndHistory[^availableForHeaderAndHistory..]}{requestSection}";
        }

        var header = headerAndHistory[..historyIdx];
        var historySection = headerAndHistory[historyIdx..];
        var availableForHistory = availableForHeaderAndHistory - header.Length;

        if (availableForHistory <= 0)
        {
            return $"{header}[context_truncated]\n{requestSection}";
        }

        var trimmedHistory = historySection.Length <= availableForHistory
            ? historySection
            : historySection[^availableForHistory..];
        return $"{header}{trimmedHistory}{requestSection}";
    }

    private bool ShouldUsePriorConversationContext(string conversationId, string input)
    {
        if (SearchQueryPolicy.LooksLikeStandaloneFreshGreeting(input))
        {
            return false;
        }

        if (ConversationContextPolicy.ShouldUsePriorConversationContext(input, out var isAmbiguous))
        {
            var normalized = (input ?? string.Empty).Trim();
            if (ConversationContextPolicy.LooksLikeExplicitStandaloneQuestion(normalized))
            {
                return HasTopicalOverlapWithRecentConversation(conversationId, normalized);
            }

            // 모호 키워드("어때", "괜찮" 등)는 토픽 오버랩이 있어야 history 로드.
            // 단, 초단문(≤15자) 판단/의견 요청("잘 돌아갈까?", "어때?")은
            // 토큰 오버랩이 거의 없어도 직전 대화가 있으면 무조건 history 로드.
            if (isAmbiguous)
            {
                if (normalized.Length <= 15 && HasAnyRecentAssistantMessage(conversationId))
                {
                    return true;
                }
                return HasTopicalOverlapWithRecentConversation(conversationId, input ?? string.Empty);
            }
            return true;
        }

        return HasTopicalOverlapWithRecentConversation(conversationId, input ?? string.Empty);
    }

    private bool HasAnyRecentAssistantMessage(string conversationId)
    {
        var thread = _conversationStore.Get(conversationId);
        return thread != null
               && thread.Messages.Any(m => m.Role.Equals("assistant", StringComparison.OrdinalIgnoreCase));
    }

    private bool HasTopicalOverlapWithRecentConversation(string conversationId, string input)
    {
        var inputTokens = ConversationContextPolicy.ExtractContextTokens(input);
        if (inputTokens.Count == 0)
        {
            return false;
        }

        var thread = _conversationStore.Get(conversationId);
        if (thread == null || thread.Messages.Count == 0)
        {
            return false;
        }

        foreach (var message in thread.Messages
                     .OrderByDescending(item => item.CreatedUtc)
                     .Where(item => item.Role.Equals("user", StringComparison.OrdinalIgnoreCase))
                     .Take(8))
        {
            var messageText = (message.Text ?? string.Empty).Trim();
            if (messageText.Length == 0)
            {
                continue;
            }

            if (messageText.Equals((input ?? string.Empty).Trim(), StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }

            var messageTokens = ConversationContextPolicy.ExtractContextTokens(messageText);
            if (ConversationContextPolicy.HasMeaningfulTokenOverlap(inputTokens, messageTokens))
            {
                return true;
            }
        }

        return false;
    }

    private async Task EnsureConversationTitleFromFirstTurnAsync(
        string conversationId,
        string preferredProvider,
        string preferredModel,
        CancellationToken cancellationToken
    )
    {
        try
        {
            var thread = _conversationStore.Get(conversationId);
            if (thread == null || !ConversationTitlePolicy.ShouldAutoTitle(thread))
            {
                return;
            }

            var isCodingScope = thread.Scope.Equals("coding", StringComparison.OrdinalIgnoreCase);
            var titleLooksFailed = ConversationTitlePolicy.IsLikelyProviderFailureText(thread.Title);
            var selectedUser = titleLooksFailed
                ? thread.Messages.LastOrDefault(x => x.Role.Equals("user", StringComparison.OrdinalIgnoreCase))?.Text?.Trim()
                : thread.Messages.FirstOrDefault(x => x.Role.Equals("user", StringComparison.OrdinalIgnoreCase))?.Text?.Trim();
            var selectedAssistant = titleLooksFailed
                ? ConversationTitlePolicy.SelectAssistantTextForAutoTitle(thread, preferLatest: true)
                : ConversationTitlePolicy.SelectAssistantTextForAutoTitle(thread, preferLatest: false);

            if (isCodingScope)
            {
                var localTitle = !string.IsNullOrWhiteSpace(selectedUser)
                    ? ConversationTitlePolicy.BuildFallbackConversationTitle(selectedUser)
                    : string.Empty;
                if (string.IsNullOrWhiteSpace(localTitle))
                {
                    localTitle = ConversationTitlePolicy.BuildFallbackConversationTitleFromAssistant(selectedAssistant);
                }

                if (!string.IsNullOrWhiteSpace(localTitle))
                {
                    _conversationStore.UpdateTitle(conversationId, localTitle);
                }

                return;
            }

            if (string.IsNullOrWhiteSpace(selectedUser))
            {
                return;
            }

            var provider = NormalizeProvider(preferredProvider, allowAuto: true);
            if (provider == "auto")
            {
                provider = await ResolveAutoProviderAsync(cancellationToken);
            }

            var title = string.Empty;
            if (provider != "none" && !string.IsNullOrWhiteSpace(selectedAssistant))
            {
                var model = ResolveModel(provider, preferredModel);
                var prompt = $"""
                            아래 대화의 제목을 한국어 한 문장으로 만들어라.
                            조건:
                            - 최대 28자
                            - 불필요한 따옴표/머리말 금지
                            - 제목만 출력

                            [사용자]
                            {selectedUser}

                            [어시스턴트]
                            {ConversationTitlePolicy.TruncateForTitle(selectedAssistant)}
                            """;
                var generated = await GenerateByProviderAsync(provider, model, prompt, cancellationToken);
                if (!ConversationTitlePolicy.IsLikelyProviderFailureText(generated.Text))
                {
                    title = ConversationTitlePolicy.NormalizeConversationTitle(generated.Text);
                }
            }

            if (string.IsNullOrWhiteSpace(title))
            {
                title = ConversationTitlePolicy.BuildFallbackConversationTitleFromAssistant(selectedAssistant);
            }

            if (string.IsNullOrWhiteSpace(title))
            {
                title = ConversationTitlePolicy.BuildFallbackConversationTitle(selectedUser);
            }

            _conversationStore.UpdateTitle(conversationId, title);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[conversation] title auto-rename failed: {ex.Message}");
        }
    }

    private async Task<MemoryNoteSaveResult?> MaybeCompressConversationAsync(
        string conversationId,
        string modeKey,
        string preferredProvider,
        string preferredModel,
        CancellationToken cancellationToken
    )
    {
        var currentChars = _conversationStore.GetTotalCharacters(conversationId);
        if (currentChars < Math.Max(2000, _context.ConversationCompressChars))
        {
            return null;
        }

        var sourceText = _conversationStore.BuildCompressionSourceText(conversationId, _context.ConversationKeepRecentMessages);
        if (string.IsNullOrWhiteSpace(sourceText))
        {
            return null;
        }

        var provider = NormalizeProvider(preferredProvider, allowAuto: true);
        if (provider == "auto")
        {
            provider = await ResolveAutoProviderAsync(cancellationToken);
            if (provider == "none")
            {
                provider = "groq";
            }
        }

        var model = ResolveModel(provider, preferredModel);
        var summaryPrompt = $"""
                            다음은 길어진 대화의 이전 구간입니다.
                            이후 대화 이어가기에 필요한 핵심 맥락만 유지해서 한국어로 압축 요약하세요.
                            반드시 포함:
                            1) 사용자 목표
                            2) 결정된 기술 선택/제약
                            3) 아직 남은 작업
                            4) 파일/경로/명령 관련 중요 사실

                            [대화 로그]
                            {sourceText}
                            """;

        var summaryResult = await GenerateByProviderAsync(provider, model, summaryPrompt, cancellationToken);
        var summary = summaryResult.Text.Trim();
        if (string.IsNullOrWhiteSpace(summary))
        {
            summary = sourceText.Length > 2400 ? sourceText[..2400] + "\n...(truncated)" : sourceText;
        }

        var thread = _conversationStore.Get(conversationId);
        if (thread == null)
        {
            return null;
        }

        var saved = _memoryNoteStore.Save(
            modeKey,
            thread.Id,
            thread.Title,
            summaryResult.Provider,
            summaryResult.Model,
            summary
        );
        _conversationStore.AddLinkedMemoryNote(conversationId, saved.Name);
        _conversationStore.CompactWithSummary(
            conversationId,
            _context.ConversationKeepRecentMessages,
            $"자동 압축 완료. 메모리 노트 `{saved.Name}` 를 컨텍스트로 사용합니다."
        );
        return saved;
    }

    private void ScheduleConversationMaintenance(
        string conversationId,
        string modeKey,
        string preferredProvider,
        string preferredModel
    )
    {
        _ = Task.Run(async () =>
        {
            try
            {
                using var titleCts = new CancellationTokenSource(TimeSpan.FromSeconds(2));
                await EnsureConversationTitleFromFirstTurnAsync(
                    conversationId,
                    preferredProvider,
                    preferredModel,
                    titleCts.Token
                ).ConfigureAwait(false);

                using var compressCts = new CancellationTokenSource(TimeSpan.FromSeconds(30));
                _ = await MaybeCompressConversationAsync(
                    conversationId,
                    modeKey,
                    preferredProvider,
                    preferredModel,
                    compressCts.Token
                ).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"[conversation] maintenance failed: {ex.Message}");
            }
        });
    }

    private string ResolveModel(string provider, string? modelOverride)
    {
        var normalizedOverride = ProviderModelSelectionPolicy.NormalizePinnedProviderModelSelection(
            provider,
            modelOverride,
            DefaultCopilotModel,
            NormalizeModelSelection
        );
        if (!string.IsNullOrWhiteSpace(normalizedOverride))
        {
            return normalizedOverride;
        }

        return provider switch
        {
            "gemini" => _providers.GeminiModel,
            "cerebras" => _providers.CerebrasModel,
            "nvidia" => _providers.NvidiaModel,
            "copilot" => DefaultCopilotModel,
            "codex" => _providers.CodexModel,
            _ => _llmRouter.GetSelectedGroqModel()
        };
    }

    private async Task<LlmSingleChatResult?> TryFallbackFromGroqRateLimitAsync(string input, CancellationToken cancellationToken)
    {
        if (IsCopilotResponseTestPrompt(input))
        {
            var model = _copilotWrapper.GetSelectedModel();
            return new LlmSingleChatResult("copilot", model, BuildMockCopilotTestResponse(model));
        }

        if (_llmRouter.HasGeminiApiKey())
        {
            var gemini = await _llmRouter.GenerateGeminiChatAsync(input, cancellationToken);
            return new LlmSingleChatResult("gemini", _providers.GeminiModel, gemini);
        }

        var copilotStatus = await _copilotWrapper.GetStatusAsync(cancellationToken);
        if (copilotStatus.Installed && copilotStatus.Authenticated)
        {
            var model = _copilotWrapper.GetSelectedModel();
            var copilot = await _copilotWrapper.GenerateChatAsync(input, model, cancellationToken);
            return new LlmSingleChatResult("copilot", model, copilot);
        }

        return null;
    }

    private async Task<IReadOnlyList<string>> GetAvailableProvidersAsync(CancellationToken cancellationToken)
    {
        return await _providerRegistry.GetAvailableProvidersAsync(cancellationToken);
    }

}
