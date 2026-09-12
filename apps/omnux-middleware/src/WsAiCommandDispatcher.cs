using System.Net.WebSockets;
using System.Text.Json;
using System.Diagnostics;

namespace Omnux.Middleware;

internal sealed class WsAiCommandDispatcher
{
    internal delegate Task SendConversationsDelegate(
        WebSocket socket,
        SemaphoreSlim sendLock,
        string scope,
        string mode,
        CancellationToken cancellationToken
    );

    internal delegate Task SendModelsDelegate(
        WebSocket socket,
        SemaphoreSlim sendLock,
        CancellationToken cancellationToken
    );

    internal delegate Task SendUsageStatsDelegate(
        WebSocket socket,
        SemaphoreSlim sendLock,
        CancellationToken cancellationToken,
        bool forceRefresh = false
    );

    internal delegate Task SendMetricsDelegate(
        WebSocket socket,
        SemaphoreSlim sendLock,
        string type,
        string metricsRaw,
        CancellationToken cancellationToken
    );

    private readonly IChatApplicationService _chatService;
    private readonly ICodingApplicationService _codingService;
    private readonly ISettingsApplicationService _settingsService;
    private readonly ICommandExecutionService _commandExecutionService;
    private readonly SendConversationsDelegate _sendConversationsAsync;
    private readonly SendModelsDelegate _sendGroqModelsAsync;
    private readonly SendModelsDelegate _sendCopilotModelsAsync;
    private readonly SendUsageStatsDelegate _sendUsageStatsAsync;
    private readonly SendMetricsDelegate _sendMetricsAsync;

    private readonly GuardRetryTimelineStore _guardRetryTimelineStore;
    private readonly ClipboardVisionTool _clipboardVisionTool = new();

    public WsAiCommandDispatcher(
        IChatApplicationService chatService,
        ICodingApplicationService codingService,
        ISettingsApplicationService settingsService,
        ICommandExecutionService commandExecutionService,
        GuardRetryTimelineStore guardRetryTimelineStore,
        SendConversationsDelegate sendConversationsAsync,
        SendModelsDelegate sendGroqModelsAsync,
        SendModelsDelegate sendCopilotModelsAsync,
        SendUsageStatsDelegate sendUsageStatsAsync,
        SendMetricsDelegate sendMetricsAsync
    )
    {
        _chatService = chatService;
        _codingService = codingService;
        _settingsService = settingsService;
        _commandExecutionService = commandExecutionService;
        _guardRetryTimelineStore = guardRetryTimelineStore;
        _sendConversationsAsync = sendConversationsAsync;
        _sendGroqModelsAsync = sendGroqModelsAsync;
        _sendCopilotModelsAsync = sendCopilotModelsAsync;
        _sendUsageStatsAsync = sendUsageStatsAsync;
        _sendMetricsAsync = sendMetricsAsync;
    }

    private static async Task FlushCodingProgressAsync(Task progressPipeline)
    {
        try
        {
            await progressPipeline;
        }
        catch
        {
        }
    }

    public async Task<bool> TryHandleAsync(
        WebSocketGateway.ClientMessage message,
        string sessionId,
        WebSocket socket,
        SemaphoreSlim sendLock,
        CancellationToken cancellationToken
    )
    {
        if (message.Type == "clipboard_vision_preflight")
        {
            var snapshot = _clipboardVisionTool.BuildPreflight(new ClipboardVisionPreflightInput(
                message.Attachments,
                message.Provider,
                message.Model,
                message.GroqModel,
                message.GeminiModel,
                message.Text
            ));
            await WebSocketGateway.SendTextAsync(
                socket,
                sendLock,
                "{"
                + "\"type\":\"clipboard_vision_preflight_result\","
                + $"\"payload\":{ClipboardVisionJson.SerializeSnapshot(snapshot)}"
                + "}",
                cancellationToken
            ).ConfigureAwait(false);
            return true;
        }

        // 사용자 프롬프트 제출 훅. 세 채팅 경로가 같은 규칙을 쓰도록 한 곳에서 판정한다.
        if (message.Type is "llm_chat_single" or "llm_chat_orchestration" or "llm_chat_multi"
            && !string.IsNullOrWhiteSpace(message.Text))
        {
            var promptGate = await ResolvePromptHookGate()
                .BeforePromptAsync(message.Text, message.ConversationId ?? string.Empty, cancellationToken)
                .ConfigureAwait(false);
            if (!promptGate.Allowed)
            {
                var blockedReason = promptGate.DecidedByHookId.Length > 0
                    ? $"훅 {promptGate.DecidedByHookId}이(가) 요청을 막았습니다: {promptGate.Reason}"
                    : $"훅이 요청을 막았습니다: {promptGate.Reason}";
                await SendGuardedErrorAsync(
                    socket,
                    sendLock,
                    blockedReason,
                    cancellationToken,
                    requestId: message.RequestId, requestType: message.Type
                );
                return true;
            }

            // 훅이 붙인 문맥은 사용자 본문을 바꾸지 않고 아래에 표시된 블록으로만 덧붙인다.
            message.Text = PromptContextComposer.Apply(message.Text, promptGate.AdditionalContext);
        }

        if (message.Type == "llm_chat_single")
        {
            if (string.IsNullOrWhiteSpace(message.Text))
            {
                await SendGuardedErrorAsync(
                    socket,
                    sendLock,
                    "empty message",
                    cancellationToken,
                    requestId: message.RequestId, requestType: message.Type
                );
                return true;
            }

            try
            {
                var scopeValue = message.Scope ?? "chat";
                var modeValue = message.Mode ?? "single";
                Action<ChatStreamUpdate> stream = update =>
                {
                    try
                    {
                        SendChatStreamChunkAsync(socket, sendLock, update, cancellationToken).GetAwaiter().GetResult();
                    }
                    catch
                    {
                    }
                };
                var result = await _chatService.ChatSingleWithStateAsync(
                    new ChatRequest(
                        Input: message.Text,
                        Source: "web",
                        Scope: scopeValue,
                        Mode: modeValue,
                        ConversationId: message.ConversationId,
                        ConversationTitle: message.ConversationTitle,
                        Project: message.Project,
                        Category: message.Category,
                        Tags: message.Tags,
                        Provider: message.Provider,
                        Model: message.Model,
                        LinkedMemoryNotes: message.MemoryNotes,
                        NvidiaModel: message.NvidiaModel,
                        DeepseekModel: message.DeepseekModel,
                        Attachments: message.Attachments,
                        WebUrls: message.WebUrls,
                        WebSearchEnabled: message.WebSearchEnabled,
                        CodexModel: message.CodexModel,
                        GrokModel: message.GrokModel ?? "none",
                        RequestId: message.RequestId,
                        SkillName: message.SkillName,
                        SkillScope: message.SkillScope,
                        ThinkPlusEnabled: message.ThinkPlus == true,
                        ReasoningEffort: message.ReasoningEffort,
                        ContextBudget: message.ContextBudget
                    ),
                    cancellationToken,
                    stream
                );

                await SendChatResultAsync(socket, sendLock, result, cancellationToken, message.RequestId);
                await NotifyResponseCompleteAsync(message, modeValue, cancellationToken).ConfigureAwait(false);
                await _sendGroqModelsAsync(socket, sendLock, cancellationToken);
                await _sendCopilotModelsAsync(socket, sendLock, cancellationToken);
                await _sendUsageStatsAsync(socket, sendLock, cancellationToken);
                await _sendConversationsAsync(socket, sendLock, scopeValue, modeValue, cancellationToken);
            }
            catch (Exception ex)
            {
                await SendGuardedErrorAsync(
                    socket,
                    sendLock,
                    "chat_single failed: " + ex.Message,
                    cancellationToken,
                    requestId: message.RequestId, requestType: message.Type
                );
            }

            return true;
        }

        if (message.Type == "llm_chat_orchestration")
        {
            if (string.IsNullOrWhiteSpace(message.Text))
            {
                await SendGuardedErrorAsync(
                    socket,
                    sendLock,
                    "empty message",
                    cancellationToken,
                    requestId: message.RequestId, requestType: message.Type
                );
                return true;
            }

            try
            {
                var scopeValue = message.Scope ?? "chat";
                var modeValue = message.Mode ?? "orchestration";
                var result = await _chatService.ChatOrchestrationWithStateAsync(
                    new ChatRequest(
                        Input: message.Text,
                        Source: "web",
                        Scope: scopeValue,
                        Mode: modeValue,
                        ConversationId: message.ConversationId,
                        ConversationTitle: message.ConversationTitle,
                        Project: message.Project,
                        Category: message.Category,
                        Tags: message.Tags,
                        Provider: message.Provider,
                        Model: message.Model,
                        LinkedMemoryNotes: message.MemoryNotes,
                        GroqModel: message.GroqModel,
                        GeminiModel: message.GeminiModel,
                        CopilotModel: message.CopilotModel,
                        CerebrasModel: message.CerebrasModel,
                        NvidiaModel: message.NvidiaModel,
                        DeepseekModel: message.DeepseekModel,
                        Attachments: message.Attachments,
                        WebUrls: message.WebUrls,
                        WebSearchEnabled: message.WebSearchEnabled,
                        CodexModel: message.CodexModel,
                        GrokModel: message.GrokModel ?? "none",
                        RequestId: message.RequestId,
                        ThinkPlusEnabled: message.ThinkPlus == true,
                        SkillName: message.SkillName,
                        SkillScope: message.SkillScope,
                        ReasoningEffort: message.ReasoningEffort,
                        ContextBudget: message.ContextBudget
                    ),
                    cancellationToken
                );
                await SendChatResultAsync(socket, sendLock, result, cancellationToken, message.RequestId);
                await NotifyResponseCompleteAsync(message, modeValue, cancellationToken).ConfigureAwait(false);
                await _sendUsageStatsAsync(socket, sendLock, cancellationToken);
                await _sendConversationsAsync(socket, sendLock, scopeValue, modeValue, cancellationToken);
            }
            catch (Exception ex)
            {
                await SendGuardedErrorAsync(
                    socket,
                    sendLock,
                    "chat_orchestration failed: " + ex.Message,
                    cancellationToken,
                    requestId: message.RequestId, requestType: message.Type
                );
            }

            return true;
        }

        if (message.Type == "llm_chat_multi")
        {
            if (string.IsNullOrWhiteSpace(message.Text))
            {
                await SendGuardedErrorAsync(
                    socket,
                    sendLock,
                    "empty message",
                    cancellationToken,
                    requestId: message.RequestId, requestType: message.Type
                );
                return true;
            }

            try
            {
                var scopeValue = message.Scope ?? "chat";
                var modeValue = message.Mode ?? "multi";
                var result = await _chatService.ChatMultiWithStateAsync(
                    new MultiChatRequest(
                        Input: message.Text,
                        Source: "web",
                        Scope: scopeValue,
                        Mode: modeValue,
                        ConversationId: message.ConversationId,
                        ConversationTitle: message.ConversationTitle,
                        Project: message.Project,
                        Category: message.Category,
                        Tags: message.Tags,
                        GroqModel: message.GroqModel,
                        GeminiModel: message.GeminiModel,
                        CopilotModel: message.CopilotModel,
                        CerebrasModel: message.CerebrasModel,
                        NvidiaModel: message.NvidiaModel,
                        DeepseekModel: message.DeepseekModel,
                        SummaryProvider: message.SummaryProvider,
                        LinkedMemoryNotes: message.MemoryNotes,
                        Attachments: message.Attachments,
                        WebUrls: message.WebUrls,
                        WebSearchEnabled: message.WebSearchEnabled,
                        CodexModel: message.CodexModel,
                        GrokModel: message.GrokModel ?? "none",
                        ThinkPlusEnabled: message.ThinkPlus == true,
                        SkillName: message.SkillName,
                        SkillScope: message.SkillScope
                    ),
                    cancellationToken
                );

                var retryDirective = WebSocketGateway.ResolveRetryDirective(result.GuardFailure);
                var multiResponse = new ChatMultiResultWsResponse(
                    "llm_chat_multi_result",
                    result.ConversationId,
                    result.GroqText,
                    result.GeminiText,
                    result.CerebrasText,
                    result.NvidiaText,
                    result.CopilotText,
                    result.CodexText,
                    result.Summary,
                    result.Summary,
                    result.CommonCore,
                    result.Differences,
                    result.GroqModel,
                    result.GeminiModel,
                    result.CerebrasModel,
                    result.NvidiaModel,
                    result.CopilotModel,
                    result.CodexModel,
                    result.RequestedSummaryProvider,
                    result.ResolvedSummaryProvider,
                    result.Conversation,
                    result.AutoMemoryNote,
                    result.Citations,
                    result.CitationMappings,
                    result.CitationValidation,
                    WebSocketGateway.NormalizeWebSearchGuardCategory(result.GuardFailure),
                    WebSocketGateway.NormalizeWebSearchGuardReason(result.GuardFailure),
                    WebSocketGateway.NormalizeWebSearchGuardDetail(result.GuardFailure),
                    retryDirective.RetryRequired,
                    retryDirective.RetryAction,
                    retryDirective.RetryScope,
                    retryDirective.RetryReason,
                    Grok: result.GrokText,
                    GrokModel: result.GrokModel,
                    Deepseek: result.DeepseekText,
                    DeepseekModel: result.DeepseekModel,
                    RequestId: message.RequestId
                );
                var multiJson = JsonSerializer.Serialize(multiResponse, WsAiJsonContext.Default.ChatMultiResultWsResponse);
                await WebSocketGateway.SendTextAsync(
                    socket,
                    sendLock,
                    multiJson,
                    cancellationToken
                );
                await NotifyResponseCompleteAsync(message, modeValue, cancellationToken).ConfigureAwait(false);
                await _sendGroqModelsAsync(socket, sendLock, cancellationToken);
                await _sendCopilotModelsAsync(socket, sendLock, cancellationToken);
                await _sendUsageStatsAsync(socket, sendLock, cancellationToken);
                await _sendConversationsAsync(socket, sendLock, scopeValue, modeValue, cancellationToken);
            }
            catch (Exception ex)
            {
                await SendGuardedErrorAsync(
                    socket,
                    sendLock,
                    "chat_multi failed: " + ex.Message,
                    cancellationToken,
                    requestId: message.RequestId, requestType: message.Type
                );
            }

            return true;
        }

        if (message.Type is "coding_run_single" or "coding_run_orchestration" or "coding_run_multi")
        {
            if (string.IsNullOrWhiteSpace(message.Text))
            {
                await SendGuardedErrorAsync(socket, sendLock, "empty coding input", cancellationToken,
                    requestId: message.RequestId, requestType: message.Type);
                return true;
            }

            var scopeValue = message.Scope ?? "coding";
            var modeValue = message.Mode ?? message.Type["coding_run_".Length..];
            var progressLock = new object();
            var progressPipeline = Task.CompletedTask;
            Action<CodingProgressUpdate> progress = update =>
            {
                lock (progressLock)
                {
                    if (!string.IsNullOrEmpty(update.ConversationId)) message.ConversationId = update.ConversationId;
                    progressPipeline = progressPipeline.ContinueWith(
                        _ => SendCodingProgressAsync(socket, sendLock, scopeValue, modeValue, update, cancellationToken, message.RequestId),
                        cancellationToken, TaskContinuationOptions.None, TaskScheduler.Default
                    ).Unwrap();
                }
            };
            try
            {
                var request = new CodingRunRequest(
                    Input: message.Text,
                    Source: "web",
                    Scope: scopeValue,
                    Mode: modeValue,
                    ConversationId: message.ConversationId,
                    ConversationTitle: message.ConversationTitle,
                    Project: message.Project,
                    ProjectKey: message.ProjectKey,
                    Category: message.Category,
                    Tags: message.Tags,
                    Provider: message.Provider,
                    Model: message.Model,
                    Language: message.Language ?? "auto",
                    LinkedMemoryNotes: message.MemoryNotes,
                    GroqModel: message.GroqModel,
                    GeminiModel: message.GeminiModel,
                    CerebrasModel: message.CerebrasModel,
                    NvidiaModel: message.NvidiaModel,
                    DeepseekModel: message.DeepseekModel,
                    CopilotModel: message.CopilotModel,
                    CodexModel: message.CodexModel,
                    GrokModel: message.GrokModel ?? "none",
                    Attachments: message.Attachments,
                    WebUrls: message.WebUrls,
                    WebSearchEnabled: message.WebSearchEnabled,
                    ThinkPlusEnabled: message.ThinkPlus == true,
                    SkillName: message.SkillName,
                    SkillScope: message.SkillScope,
                    ReasoningEffort: message.ReasoningEffort,
                    ContextBudget: message.ContextBudget
                );
                var result = message.Type switch
                {
                    "coding_run_orchestration" => await _codingService.RunCodingOrchestrationAsync(request, cancellationToken, progress),
                    "coding_run_multi" => await _codingService.RunCodingMultiAsync(request, cancellationToken, progress),
                    _ => await _codingService.RunCodingSingleAsync(request, cancellationToken, progress)
                };
                await FlushCodingProgressAsync(progressPipeline);
                cancellationToken.ThrowIfCancellationRequested();
                await SendCodingResultAsync(socket, sendLock, result, cancellationToken, message.RequestId);
                await _sendConversationsAsync(socket, sendLock, scopeValue, modeValue, cancellationToken);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception ex)
            {
                await SendGuardedErrorAsync(socket, sendLock, $"coding_{modeValue} failed: " + ex.Message,
                    cancellationToken, requestId: message.RequestId, requestType: message.Type);
            }
            finally
            {
                // 연결 자원을 정리하기 전에 취소된 워커의 진행 메시지까지 관찰한다.
                await FlushCodingProgressAsync(progressPipeline);
            }
            return true;
        }

        if (message.Type == "coding_execute_result")
        {
            if (string.IsNullOrWhiteSpace(message.ConversationId))
            {
                await WebSocketGateway.SendTextAsync(
                    socket,
                    sendLock,
                    "{\"type\":\"coding_execute_result\",\"ok\":false,"
                    + $"\"requestId\":\"{WebSocketGateway.EscapeJson(message.RequestId ?? string.Empty)}\","
                    + "\"message\":\"conversationId가 필요합니다.\"}",
                    cancellationToken
                );
                return true;
            }

            try
            {
                var executionResult = await _codingService.ExecuteLatestCodingResultAsync(
                    message.ConversationId,
                    message.StandardInput,
                    cancellationToken,
                    message.Target
                );
                await SendCodingExecutionResultAsync(socket, sendLock, executionResult, cancellationToken, message.RequestId);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception ex)
            {
                await WebSocketGateway.SendTextAsync(
                    socket,
                    sendLock,
                    "{"
                    + "\"type\":\"coding_execute_result\","
                    + "\"ok\":false,"
                    + $"\"requestId\":\"{WebSocketGateway.EscapeJson(message.RequestId ?? string.Empty)}\","
                    + $"\"conversationId\":\"{WebSocketGateway.EscapeJson(message.ConversationId ?? string.Empty)}\","
                    + $"\"message\":\"{WebSocketGateway.EscapeJson(ex.Message)}\""
                    + "}",
                    cancellationToken
                );
            }

            return true;
        }

        if (message.Type == "get_metrics")
        {
            var metricsRaw = await _settingsService.GetMetricsAsync(cancellationToken);
            await _sendMetricsAsync(socket, sendLock, "metrics", metricsRaw, cancellationToken);
            return true;
        }

        if (message.Type == "command")
        {
            if (string.IsNullOrWhiteSpace(message.Text))
            {
                await WebSocketGateway.SendTextAsync(socket, sendLock, "{\"type\":\"error\",\"message\":\"empty command\"}", cancellationToken);
                return true;
            }

            var result = await _commandExecutionService.ExecuteAsync(
                message.Text.Trim(),
                "web",
                cancellationToken,
                message.Attachments,
                message.WebUrls,
                message.WebSearchEnabled
            );
            await WebSocketGateway.SendTextAsync(
                socket,
                sendLock,
                $"{{\"type\":\"command_result\",\"text\":\"{WebSocketGateway.EscapeJson(result)}\"}}",
                cancellationToken
            );
            return true;
        }

        return false;
    }

    private void TrackGuardRetryTimelineEntry(
        string channel,
        bool retryRequired,
        int retryAttempt,
        int retryMaxAttempts,
        string? retryStopReason
    )
    {
        try
        {
            _guardRetryTimelineStore.Add(
                channel: channel,
                retryRequired: retryRequired,
                retryAttempt: retryAttempt,
                retryMaxAttempts: retryMaxAttempts,
                retryStopReason: retryStopReason
            );
        }
        catch
        {
            // Ignore
        }
    }

    /// <summary>확장 계층을 읽지 못하면 훅 없이 진행한다. 훅 오류로 채팅 전체를 막지 않는다.</summary>
    private static IPromptHookGate ResolvePromptHookGate()
    {
        try
        {
            return new ExtensionPromptHookGate(
                new HookDispatcher(SharedExtensionServices.Service),
                SharedExtensionServices.Approvals
            );
        }
        catch (Exception)
        {
            return NullPromptHookGate.Instance;
        }
    }

    /// <summary>응답이 끝난 뒤 알린다. 차단할 수 없는 이벤트라 판정을 읽지 않는다.</summary>
    private static Task NotifyResponseCompleteAsync(
        WebSocketGateway.ClientMessage message,
        string mode,
        CancellationToken cancellationToken
    )
    {
        return ExtensionLifecycleHookNotifier.Resolve().NotifyAsync(
            HookEventCatalog.ResponseComplete,
            message.ConversationId ?? string.Empty,
            mode,
            cancellationToken
        );
    }

    private async Task SendGuardedErrorAsync(WebSocket socket, SemaphoreSlim sendLock, string message, CancellationToken cancellationToken, SearchAnswerGuardFailure? guardFailure = null, string? requestId = null, string? requestType = null)
    {
        var effectiveGuardFailure = guardFailure ?? WebSocketGateway.TryParseGuardFailureFromMessage(message);
        var retryDirective = WebSocketGateway.ResolveRetryDirective(effectiveGuardFailure);
        var response = new GuardedErrorWsResponse(
            "error",
            message,
            WebSocketGateway.NormalizeWebSearchGuardCategory(effectiveGuardFailure),
            WebSocketGateway.NormalizeWebSearchGuardReason(effectiveGuardFailure),
            WebSocketGateway.NormalizeWebSearchGuardDetail(effectiveGuardFailure),
            retryDirective.RetryRequired,
            retryDirective.RetryAction,
            retryDirective.RetryScope,
            retryDirective.RetryReason,
            requestId,
            requestType
        );
        var json = JsonSerializer.Serialize(response, WsAiJsonContext.Default.GuardedErrorWsResponse);
        await WebSocketGateway.SendTextAsync(socket, sendLock, json, cancellationToken);
    }

    private async Task SendChatResultAsync(WebSocket socket, SemaphoreSlim sendLock, ConversationChatResult result, CancellationToken cancellationToken, string? requestId = null)
    {
        var retryDirective = WebSocketGateway.ResolveRetryDirective(result.GuardFailure);
        var normalizedRetryStopReason = WebSocketGateway.NormalizeWebSearchRetryStopReason(result.RetryStopReason);
        TrackGuardRetryTimelineEntry("chat", retryDirective.RetryRequired, result.RetryAttempt, result.RetryMaxAttempts, normalizedRetryStopReason);

        var response = new ChatResultWsResponse(
            "llm_chat_result",
            result.Mode,
            result.ConversationId,
            result.Provider,
            result.Model,
            result.Route,
            requestId ?? result.RequestId ?? string.Empty,
            result.Text,
            result.Conversation,
            result.AutoMemoryNote,
            result.Citations,
            result.CitationMappings,
            result.CitationValidation,
            WebSocketGateway.NormalizeWebSearchGuardCategory(result.GuardFailure),
            WebSocketGateway.NormalizeWebSearchGuardReason(result.GuardFailure),
            WebSocketGateway.NormalizeWebSearchGuardDetail(result.GuardFailure),
            retryDirective.RetryRequired,
            retryDirective.RetryAction,
            retryDirective.RetryScope,
            retryDirective.RetryReason,
            Math.Max(0, result.RetryAttempt),
            Math.Max(0, result.RetryMaxAttempts),
            normalizedRetryStopReason,
            result.Latency,
            result.ActionSuggestions,
            result.NotebookAction,
            result.RetrievalTrace
        );
        var json = JsonSerializer.Serialize(response, WsAiJsonContext.Default.ChatResultWsResponse);
        await WebSocketGateway.SendTextAsync(socket, sendLock, json, cancellationToken);
    }

    private async Task SendChatStreamChunkAsync(WebSocket socket, SemaphoreSlim sendLock, ChatStreamUpdate update, CancellationToken cancellationToken)
    {
        var response = new ChatStreamChunkWsResponse(
            "llm_chat_stream",
            update.Scope,
            update.Mode,
            update.Provider,
            update.Model,
            update.Route,
            update.RequestId ?? string.Empty,
            update.Delta,
            update.ConversationId,
            Math.Max(0, update.ChunkIndex)
        );
        var json = JsonSerializer.Serialize(response, WsAiJsonContext.Default.ChatStreamChunkWsResponse);
        await WebSocketGateway.SendTextAsync(socket, sendLock, json, cancellationToken);
    }

    private async Task SendCodingResultAsync(WebSocket socket, SemaphoreSlim sendLock, CodingRunResult result, CancellationToken cancellationToken, string? requestId)
    {
        var retryDirective = WebSocketGateway.ResolveRetryDirective(result.GuardFailure);
        var normalizedRetryStopReason = WebSocketGateway.NormalizeWebSearchRetryStopReason(result.RetryStopReason);
        TrackGuardRetryTimelineEntry("coding", retryDirective.RetryRequired, result.RetryAttempt, result.RetryMaxAttempts, normalizedRetryStopReason);

        var response = new CodingResultWsResponse(
            "coding_result",
            result.Mode,
            result.ConversationId,
            result.Provider,
            result.Model,
            result.Language,
            result.Code,
            result.Execution,
            result.Workers,
            result.ChangedFiles,
            result.Summary,
            result.Conversation,
            result.AutoMemoryNote,
            result.Citations,
            result.CitationMappings,
            result.CitationValidation,
            WebSocketGateway.NormalizeWebSearchGuardCategory(result.GuardFailure),
            WebSocketGateway.NormalizeWebSearchGuardReason(result.GuardFailure),
            WebSocketGateway.NormalizeWebSearchGuardDetail(result.GuardFailure),
            retryDirective.RetryRequired,
            retryDirective.RetryAction,
            retryDirective.RetryScope,
            retryDirective.RetryReason,
            Math.Max(0, result.RetryAttempt),
            Math.Max(0, result.RetryMaxAttempts),
            normalizedRetryStopReason,
            result.CommonSummary,
            result.CommonPoints,
            result.Differences,
            result.Recommendation,
            result.Evidence,
            result.RetrievalLabel,
            requestId
        );
        var json = JsonSerializer.Serialize(response, WsAiJsonContext.Default.CodingResultWsResponse);
        await WebSocketGateway.SendTextAsync(socket, sendLock, json, cancellationToken);
    }

    private async Task SendCodingExecutionResultAsync(WebSocket socket, SemaphoreSlim sendLock, CodingResultExecutionResult result, CancellationToken cancellationToken, string? requestId)
    {
        var response = new CodingExecutionResultWsResponse(
            "coding_execute_result",
            result.Ok,
            result.ConversationId,
            result.Language,
            result.RunMode,
            result.Message,
            result.TargetProvider,
            result.TargetModel,
            result.PreviewUrl,
            result.PreviewEntry,
            result.Execution,
            result.Evidence,
            requestId
        );
        var json = JsonSerializer.Serialize(response, WsAiJsonContext.Default.CodingExecutionResultWsResponse);
        await WebSocketGateway.SendTextAsync(socket, sendLock, json, cancellationToken);
    }

    private async Task SendCodingProgressAsync(WebSocket socket, SemaphoreSlim sendLock, string scope, string mode, CodingProgressUpdate update, CancellationToken cancellationToken, string? requestId)
    {
        var effectiveMode = string.IsNullOrWhiteSpace(update.Mode) ? mode : update.Mode;
        var response = new CodingProgressWsResponse(
            "coding_progress",
            scope,
            effectiveMode,
            update.Provider,
            update.Model,
            update.Phase,
            update.Message,
            update.Iteration,
            update.MaxIterations,
            update.Percent,
            update.Done,
            update.StageKey,
            update.StageTitle,
            update.StageDetail,
            update.StageIndex,
            update.StageTotal,
            requestId,
            update.ConversationId
        );
        var json = JsonSerializer.Serialize(response, WsAiJsonContext.Default.CodingProgressWsResponse);
        await WebSocketGateway.SendTextAsync(socket, sendLock, json, cancellationToken);
    }
}
