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

        if (message.Type == "llm_chat_single")
        {
            if (string.IsNullOrWhiteSpace(message.Text))
            {
                await SendGuardedErrorAsync(
                    socket,
                    sendLock,
                    "empty message",
                    cancellationToken
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
                        Attachments: message.Attachments,
                        WebUrls: message.WebUrls,
                        WebSearchEnabled: message.WebSearchEnabled,
                        CodexModel: message.CodexModel,
                        RequestId: message.RequestId,
                        SkillName: message.SkillName,
                        SkillScope: message.SkillScope,
                        ThinkPlusEnabled: message.ThinkPlus == true
                    ),
                    cancellationToken,
                    stream
                );

                await SendChatResultAsync(socket, sendLock, result, cancellationToken);
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
                    cancellationToken
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
                    cancellationToken
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
                        Attachments: message.Attachments,
                        WebUrls: message.WebUrls,
                        WebSearchEnabled: message.WebSearchEnabled,
                        CodexModel: message.CodexModel,
                        ThinkPlusEnabled: message.ThinkPlus == true,
                        SkillName: message.SkillName,
                        SkillScope: message.SkillScope
                    ),
                    cancellationToken
                );
                await SendChatResultAsync(socket, sendLock, result, cancellationToken);
                await _sendUsageStatsAsync(socket, sendLock, cancellationToken);
                await _sendConversationsAsync(socket, sendLock, scopeValue, modeValue, cancellationToken);
            }
            catch (Exception ex)
            {
                await SendGuardedErrorAsync(
                    socket,
                    sendLock,
                    "chat_orchestration failed: " + ex.Message,
                    cancellationToken
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
                    cancellationToken
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
                        SummaryProvider: message.SummaryProvider,
                        LinkedMemoryNotes: message.MemoryNotes,
                        Attachments: message.Attachments,
                        WebUrls: message.WebUrls,
                        WebSearchEnabled: message.WebSearchEnabled,
                        CodexModel: message.CodexModel,
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
                    retryDirective.RetryReason
                );
                var multiJson = JsonSerializer.Serialize(multiResponse, WsAiJsonContext.Default.ChatMultiResultWsResponse);
                await WebSocketGateway.SendTextAsync(
                    socket,
                    sendLock,
                    multiJson,
                    cancellationToken
                );
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
                    cancellationToken
                );
            }

            return true;
        }

        if (message.Type == "coding_run_single")
        {
            if (string.IsNullOrWhiteSpace(message.Text))
            {
                await SendGuardedErrorAsync(
                    socket,
                    sendLock,
                    "empty coding input",
                    cancellationToken
                );
                return true;
            }

            try
            {
                var scopeValue = message.Scope ?? "coding";
                var modeValue = message.Mode ?? "single";
                var progressPipeline = Task.CompletedTask;
                Action<CodingProgressUpdate> progress = update =>
                {
                    progressPipeline = progressPipeline.ContinueWith(
                        _ => SendCodingProgressAsync(socket, sendLock, scopeValue, modeValue, update, cancellationToken),
                        cancellationToken,
                        TaskContinuationOptions.None,
                        TaskScheduler.Default
                    ).Unwrap();
                };
                var result = await _codingService.RunCodingSingleAsync(
                    new CodingRunRequest(
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
                        Language: message.Language ?? "auto",
                        LinkedMemoryNotes: message.MemoryNotes,
                        NvidiaModel: message.NvidiaModel,
                        Attachments: message.Attachments,
                        WebUrls: message.WebUrls,
                        WebSearchEnabled: message.WebSearchEnabled,
                        ThinkPlusEnabled: message.ThinkPlus == true,
                        SkillName: message.SkillName,
                        SkillScope: message.SkillScope
                    ),
                    cancellationToken,
                    progress
                );
                await FlushCodingProgressAsync(progressPipeline);
                await SendCodingResultAsync(socket, sendLock, result, cancellationToken);
                await _sendConversationsAsync(socket, sendLock, scopeValue, modeValue, cancellationToken);
            }
            catch (Exception ex)
            {
                await SendGuardedErrorAsync(
                    socket,
                    sendLock,
                    "coding_single failed: " + ex.Message,
                    cancellationToken
                );
            }

            return true;
        }

        if (message.Type == "coding_run_orchestration")
        {
            try
            {
                var scopeValue = message.Scope ?? "coding";
                var modeValue = message.Mode ?? "orchestration";
                var progressPipeline = Task.CompletedTask;
                Action<CodingProgressUpdate> progress = update =>
                {
                    progressPipeline = progressPipeline.ContinueWith(
                        _ => SendCodingProgressAsync(socket, sendLock, scopeValue, modeValue, update, cancellationToken),
                        cancellationToken,
                        TaskContinuationOptions.None,
                        TaskScheduler.Default
                    ).Unwrap();
                };
                var result = await _codingService.RunCodingOrchestrationAsync(
                    new CodingRunRequest(
                        Input: message.Text ?? string.Empty,
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
                        Language: message.Language ?? "auto",
                        LinkedMemoryNotes: message.MemoryNotes,
                        GroqModel: message.GroqModel,
                        GeminiModel: message.GeminiModel,
                        CerebrasModel: message.CerebrasModel,
                        NvidiaModel: message.NvidiaModel,
                        CopilotModel: message.CopilotModel,
                        Attachments: message.Attachments,
                        WebUrls: message.WebUrls,
                        WebSearchEnabled: message.WebSearchEnabled,
                        CodexModel: message.CodexModel,
                        ThinkPlusEnabled: message.ThinkPlus == true,
                        SkillName: message.SkillName,
                        SkillScope: message.SkillScope
                    ),
                    cancellationToken,
                    progress
                );
                await FlushCodingProgressAsync(progressPipeline);
                await SendCodingResultAsync(socket, sendLock, result, cancellationToken);
                await _sendConversationsAsync(socket, sendLock, scopeValue, modeValue, cancellationToken);
            }
            catch (Exception ex)
            {
                await SendGuardedErrorAsync(
                    socket,
                    sendLock,
                    "coding_orchestration failed: " + ex.Message,
                    cancellationToken
                );
            }

            return true;
        }

        if (message.Type == "coding_run_multi")
        {
            if (string.IsNullOrWhiteSpace(message.Text))
            {
                await SendGuardedErrorAsync(
                    socket,
                    sendLock,
                    "empty coding input",
                    cancellationToken
                );
                return true;
            }

            try
            {
                var scopeValue = message.Scope ?? "coding";
                var modeValue = message.Mode ?? "multi";
                var progressPipeline = Task.CompletedTask;
                Action<CodingProgressUpdate> progress = update =>
                {
                    progressPipeline = progressPipeline.ContinueWith(
                        _ => SendCodingProgressAsync(socket, sendLock, scopeValue, modeValue, update, cancellationToken),
                        cancellationToken,
                        TaskContinuationOptions.None,
                        TaskScheduler.Default
                    ).Unwrap();
                };
                var result = await _codingService.RunCodingMultiAsync(
                    new CodingRunRequest(
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
                        Language: message.Language ?? "auto",
                        LinkedMemoryNotes: message.MemoryNotes,
                        GroqModel: message.GroqModel,
                        GeminiModel: message.GeminiModel,
                        CerebrasModel: message.CerebrasModel,
                        NvidiaModel: message.NvidiaModel,
                        CopilotModel: message.CopilotModel,
                        Attachments: message.Attachments,
                        WebUrls: message.WebUrls,
                        WebSearchEnabled: message.WebSearchEnabled,
                        CodexModel: message.CodexModel,
                        ThinkPlusEnabled: message.ThinkPlus == true,
                        SkillName: message.SkillName,
                        SkillScope: message.SkillScope
                    ),
                    cancellationToken,
                    progress
                );
                await FlushCodingProgressAsync(progressPipeline);
                await SendCodingResultAsync(socket, sendLock, result, cancellationToken);
                await _sendConversationsAsync(socket, sendLock, scopeValue, modeValue, cancellationToken);
            }
            catch (Exception ex)
            {
                await SendGuardedErrorAsync(
                    socket,
                    sendLock,
                    "coding_multi failed: " + ex.Message,
                    cancellationToken
                );
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
                    "{\"type\":\"coding_execute_result\",\"ok\":false,\"message\":\"conversationId가 필요합니다.\"}",
                    cancellationToken
                );
                return true;
            }

            try
            {
                var executionResult = await _codingService.ExecuteLatestCodingResultAsync(
                    message.ConversationId,
                    message.StandardInput,
                    cancellationToken
                );
                await SendCodingExecutionResultAsync(socket, sendLock, executionResult, cancellationToken);
            }
            catch (Exception ex)
            {
                await WebSocketGateway.SendTextAsync(
                    socket,
                    sendLock,
                    "{"
                    + "\"type\":\"coding_execute_result\","
                    + "\"ok\":false,"
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

    private async Task SendGuardedErrorAsync(WebSocket socket, SemaphoreSlim sendLock, string message, CancellationToken cancellationToken, SearchAnswerGuardFailure? guardFailure = null)
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
            retryDirective.RetryReason
        );
        var json = JsonSerializer.Serialize(response, WsAiJsonContext.Default.GuardedErrorWsResponse);
        await WebSocketGateway.SendTextAsync(socket, sendLock, json, cancellationToken);
    }

    private async Task SendChatResultAsync(WebSocket socket, SemaphoreSlim sendLock, ConversationChatResult result, CancellationToken cancellationToken)
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
            result.RequestId ?? string.Empty,
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
            result.Latency
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

    private async Task SendCodingResultAsync(WebSocket socket, SemaphoreSlim sendLock, CodingRunResult result, CancellationToken cancellationToken)
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
            result.Evidence
        );
        var json = JsonSerializer.Serialize(response, WsAiJsonContext.Default.CodingResultWsResponse);
        await WebSocketGateway.SendTextAsync(socket, sendLock, json, cancellationToken);
    }

    private async Task SendCodingExecutionResultAsync(WebSocket socket, SemaphoreSlim sendLock, CodingResultExecutionResult result, CancellationToken cancellationToken)
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
            result.Evidence
        );
        var json = JsonSerializer.Serialize(response, WsAiJsonContext.Default.CodingExecutionResultWsResponse);
        await WebSocketGateway.SendTextAsync(socket, sendLock, json, cancellationToken);
    }

    private async Task SendCodingProgressAsync(WebSocket socket, SemaphoreSlim sendLock, string scope, string mode, CodingProgressUpdate update, CancellationToken cancellationToken)
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
            update.StageTotal
        );
        var json = JsonSerializer.Serialize(response, WsAiJsonContext.Default.CodingProgressWsResponse);
        await WebSocketGateway.SendTextAsync(socket, sendLock, json, cancellationToken);
    }
}
