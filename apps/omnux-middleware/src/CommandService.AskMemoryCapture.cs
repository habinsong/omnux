namespace Omnux.Middleware;

public sealed partial class CommandService
{
    private static readonly object MemoryCaptureLock = new();
    private static string _memoryCaptureDayKey = string.Empty;
    private static int _memoryCaptureDayCount;
    private static readonly Queue<string> _recentMemoryTitleKeys = new();
    private static DateTimeOffset _lastMemoryIndexSyncUtc = DateTimeOffset.MinValue;

    /// <summary>
    /// 턴 종료 후 "기억할 사실" 자동 적재 (P1-3) — ScheduleConversationMaintenance 에서
    /// 백그라운드로 호출된다. 휴리스틱 게이트 → 경량 LLM 추출 → 중복/일일한도 가드 →
    /// 메모리 노트 저장 → 인덱스 증분 sync(1분 스로틀). 어떤 실패도 대화 흐름에 영향 없음.
    /// UI 에는 표시하지 않고 감사로그(ask_auto_memory)에만 기록한다(소음 금지).
    /// </summary>
    private async Task TryCaptureMemoryFromTurnAsync(
        string conversationId,
        string modeKey,
        string provider,
        string model,
        CancellationToken cancellationToken
    )
    {
        if (AskMemoryCapturePolicy.IsDisabledByEnv() || !_llmRouter.HasGroqApiKey())
        {
            return;
        }

        string userText;
        string assistantText;
        try
        {
            var view = _conversationStore.Get(conversationId);
            if (view == null || view.Messages.Count == 0)
            {
                return;
            }

            userText = view.Messages.LastOrDefault(message =>
                string.Equals(message.Role, "user", StringComparison.OrdinalIgnoreCase))?.Text ?? string.Empty;
            assistantText = view.Messages.LastOrDefault(message =>
                string.Equals(message.Role, "assistant", StringComparison.OrdinalIgnoreCase))?.Text ?? string.Empty;
        }
        catch
        {
            return;
        }

        if (!AskMemoryCapturePolicy.LooksLikeMemorableUserInput(userText))
        {
            return;
        }

        // 일일 한도 선체크(저장 직전에 한 번 더 — LLM 비용 낭비 방지용 선차단).
        if (IsMemoryCaptureDailyLimitReached())
        {
            _auditLogger.Log("conversation", "ask_auto_memory", "limit", $"dailyLimit={AskMemoryCapturePolicy.DailyLimit}");
            return;
        }

        AskMemoryExtraction? extraction;
        try
        {
            using var llmCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            llmCts.CancelAfter(TimeSpan.FromSeconds(AskMemoryCapturePolicy.LlmTimeoutSeconds));
            var llmOutput = await _llmRouter.GenerateGroqChatAsync(
                AskMemoryCapturePolicy.BuildExtractionPrompt(userText, assistantText),
                null,
                220,
                llmCts.Token
            ).ConfigureAwait(false);
            extraction = AskMemoryCapturePolicy.TryParseExtraction(llmOutput);
        }
        catch (Exception ex)
        {
            _auditLogger.Log("conversation", "ask_auto_memory", "error", $"stage=llm message={TrimForAudit(ex.Message, 120)}");
            return;
        }

        if (extraction == null)
        {
            _auditLogger.Log("conversation", "ask_auto_memory", "skip", "reason=parse_failed");
            return;
        }

        if (!extraction.Memorable)
        {
            _auditLogger.Log("conversation", "ask_auto_memory", "skip", "reason=not_memorable");
            return;
        }

        var titleKey = AskMemoryCapturePolicy.NormalizeTitleKey(extraction.Title);
        if (titleKey.Length == 0 || IsDuplicateMemoryTitle(titleKey))
        {
            _auditLogger.Log("conversation", "ask_auto_memory", "dup", $"title={TrimForAudit(extraction.Title, 60)}");
            return;
        }

        if (!TryConsumeMemoryCaptureQuota(titleKey))
        {
            _auditLogger.Log("conversation", "ask_auto_memory", "limit", $"dailyLimit={AskMemoryCapturePolicy.DailyLimit}");
            return;
        }

        try
        {
            var saved = _memoryNoteStore.Save(
                "auto-memory",
                conversationId,
                extraction.Title,
                provider,
                model,
                extraction.Fact
            );
            _auditLogger.Log(
                "conversation",
                "ask_auto_memory",
                "ok",
                $"note={NormalizeAuditToken(saved.Name, "-")} mode={modeKey}"
            );
        }
        catch (Exception ex)
        {
            _auditLogger.Log("conversation", "ask_auto_memory", "error", $"stage=save message={TrimForAudit(ex.Message, 120)}");
            return;
        }

        TrySyncMemoryIndexThrottled();
    }

    private static bool IsMemoryCaptureDailyLimitReached()
    {
        lock (MemoryCaptureLock)
        {
            var today = DateTimeOffset.UtcNow.ToString("yyyy-MM-dd");
            if (!string.Equals(_memoryCaptureDayKey, today, StringComparison.Ordinal))
            {
                return false;
            }

            return _memoryCaptureDayCount >= AskMemoryCapturePolicy.DailyLimit;
        }
    }

    private static bool IsDuplicateMemoryTitle(string titleKey)
    {
        lock (MemoryCaptureLock)
        {
            return _recentMemoryTitleKeys.Contains(titleKey, StringComparer.Ordinal);
        }
    }

    private static bool TryConsumeMemoryCaptureQuota(string titleKey)
    {
        lock (MemoryCaptureLock)
        {
            var today = DateTimeOffset.UtcNow.ToString("yyyy-MM-dd");
            if (!string.Equals(_memoryCaptureDayKey, today, StringComparison.Ordinal))
            {
                _memoryCaptureDayKey = today;
                _memoryCaptureDayCount = 0;
            }

            if (_memoryCaptureDayCount >= AskMemoryCapturePolicy.DailyLimit)
            {
                return false;
            }

            _memoryCaptureDayCount += 1;
            _recentMemoryTitleKeys.Enqueue(titleKey);
            while (_recentMemoryTitleKeys.Count > 32)
            {
                _recentMemoryTitleKeys.Dequeue();
            }

            return true;
        }
    }

    /// <summary>노트 저장 직후 memory_search 인덱스에 반영 — 1분 스로틀, 실패 무시.</summary>
    private void TrySyncMemoryIndexThrottled()
    {
        lock (MemoryCaptureLock)
        {
            if (DateTimeOffset.UtcNow - _lastMemoryIndexSyncUtc < TimeSpan.FromMinutes(1))
            {
                return;
            }

            _lastMemoryIndexSyncUtc = DateTimeOffset.UtcNow;
        }

        try
        {
            var schema = new MemoryIndexSchemaBootstrap(_paths).EnsureInitialized();
            _ = new MemoryIndexDocumentSync(_paths, schema).SyncOnce();
        }
        catch (Exception ex)
        {
            _auditLogger.Log("conversation", "ask_auto_memory", "error", $"stage=index_sync message={TrimForAudit(ex.Message, 120)}");
        }
    }
}
