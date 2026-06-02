using System.Text.Json.Serialization;

namespace Omnux.Middleware;

internal record GuardedErrorWsResponse(
    string Type,
    string Message,
    string GuardCategory,
    string GuardReason,
    string GuardDetail,
    bool RetryRequired,
    string RetryAction,
    string RetryScope,
    string RetryReason
);

internal record ChatResultWsResponse(
    string Type,
    string Mode,
    string ConversationId,
    string Provider,
    string Model,
    string Route,
    string RequestId,
    string Text,
    ConversationThreadView Conversation,
    MemoryNoteSaveResult? AutoMemoryNote,
    IReadOnlyList<SearchCitationReference>? Citations,
    IReadOnlyList<SearchCitationSentenceMapping>? CitationMappings,
    SearchCitationValidationSummary? CitationValidation,
    string GuardCategory,
    string GuardReason,
    string GuardDetail,
    bool RetryRequired,
    string RetryAction,
    string RetryScope,
    string RetryReason,
    int RetryAttempt,
    int RetryMaxAttempts,
    string RetryStopReason,
    ChatLatencyMetrics? Latency
);

internal record ChatStreamChunkWsResponse(
    string Type,
    string Scope,
    string Mode,
    string Provider,
    string Model,
    string Route,
    string RequestId,
    string Delta,
    string ConversationId,
    int ChunkIndex
);

internal record CodingResultWsResponse(
    string Type,
    string Mode,
    string ConversationId,
    string Provider,
    string Model,
    string Language,
    string Code,
    CodeExecutionResult Execution,
    IReadOnlyList<CodingWorkerResult> Workers,
    IReadOnlyList<string> ChangedFiles,
    string Summary,
    ConversationThreadView Conversation,
    MemoryNoteSaveResult? AutoMemoryNote,
    IReadOnlyList<SearchCitationReference>? Citations,
    IReadOnlyList<SearchCitationSentenceMapping>? CitationMappings,
    SearchCitationValidationSummary? CitationValidation,
    string GuardCategory,
    string GuardReason,
    string GuardDetail,
    bool RetryRequired,
    string RetryAction,
    string RetryScope,
    string RetryReason,
    int RetryAttempt,
    int RetryMaxAttempts,
    string RetryStopReason,
    string CommonSummary,
    string CommonPoints,
    string Differences,
    string Recommendation,
    CodingEvidencePack? Evidence
);

internal record CodingExecutionResultWsResponse(
    string Type,
    bool Ok,
    string ConversationId,
    string Language,
    string RunMode,
    string Message,
    string TargetProvider,
    string TargetModel,
    string PreviewUrl,
    string PreviewEntry,
    CodeExecutionResult? Execution,
    CodingEvidencePack? Evidence
);

internal record CodingProgressWsResponse(
    string Type,
    string Scope,
    string Mode,
    string Provider,
    string Model,
    string Phase,
    string Message,
    int Iteration,
    int MaxIterations,
    int Percent,
    bool Done,
    string StageKey,
    string StageTitle,
    string StageDetail,
    int StageIndex,
    int StageTotal
);

internal record ChatMultiResultWsResponse(
    string Type,
    string ConversationId,
    string Groq,
    string Gemini,
    string Cerebras,
    string Nvidia,
    string Copilot,
    string Codex,
    string Summary,
    string CommonSummary,
    string CommonCore,
    string Differences,
    string GroqModel,
    string GeminiModel,
    string CerebrasModel,
    string NvidiaModel,
    string CopilotModel,
    string CodexModel,
    string RequestedSummaryProvider,
    string ResolvedSummaryProvider,
    ConversationThreadView Conversation,
    MemoryNoteSaveResult? AutoMemoryNote,
    IReadOnlyList<SearchCitationReference>? Citations,
    IReadOnlyList<SearchCitationSentenceMapping>? CitationMappings,
    SearchCitationValidationSummary? CitationValidation,
    string GuardCategory,
    string GuardReason,
    string GuardDetail,
    bool RetryRequired,
    string RetryAction,
    string RetryScope,
    string RetryReason
);

[JsonSourceGenerationOptions(
    PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
)]
[JsonSerializable(typeof(GuardedErrorWsResponse))]
[JsonSerializable(typeof(ChatResultWsResponse))]
[JsonSerializable(typeof(ChatStreamChunkWsResponse))]
[JsonSerializable(typeof(CodingResultWsResponse))]
[JsonSerializable(typeof(CodingExecutionResultWsResponse))]
[JsonSerializable(typeof(CodingProgressWsResponse))]
[JsonSerializable(typeof(ChatMultiResultWsResponse))]
internal partial class WsAiJsonContext : JsonSerializerContext
{
}
