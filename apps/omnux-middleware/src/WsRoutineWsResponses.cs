using System.Text.Json.Serialization;

namespace Omnux.Middleware;

internal record RoutinesStateWsResponse(
    string Type,
    IReadOnlyList<RoutineSummary> Items
);

internal record RoutineActionResultWsResponse(
    string Type,
    bool Ok,
    string Message,
    RoutineSummary? Routine
);

internal record RoutineProgressWsResponse(
    string Type,
    string Operation,
    string Message,
    int Percent,
    bool Done,
    bool? Ok,
    string StageKey,
    string StageTitle,
    string StageDetail,
    int StageIndex
);

internal record RoutineRunDetailWsResponse(
    string Type,
    bool Ok,
    string RoutineId,
    long Ts,
    string RunAtLocal,
    string Title,
    string Status,
    string Source,
    int AttemptCount,
    string? TelegramStatus,
    string? ArtifactPath,
    string? AgentSessionId,
    string? AgentRunId,
    string? AgentProvider,
    string? AgentModel,
    string? ToolProfile,
    string? StartUrl,
    string? FinalUrl,
    string? PageTitle,
    string? ScreenshotPath,
    IReadOnlyList<string> DownloadPaths,
    string? Error,
    string Content
);

internal record RoutineExecutionPreviewWsResponse(
    string Type,
    string Request,
    string ScheduleSourceMode,
    string ScheduleText,
    string ScheduleKind,
    string TimezoneId,
    string ResolvedExecutionMode,
    string ExecutionRoute,
    IReadOnlyList<string> Warnings
);

internal record RoutineSchedulerStatusWsResponse(
    string Type,
    bool Enabled,
    int TotalRoutines,
    int EnabledRoutines,
    int RunningRoutines,
    int DueRoutines,
    long? NextRunAtMs,
    string? LastError
);

[JsonSourceGenerationOptions(
    PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
)]
[JsonSerializable(typeof(RoutinesStateWsResponse))]
[JsonSerializable(typeof(RoutineActionResultWsResponse))]
[JsonSerializable(typeof(RoutineProgressWsResponse))]
[JsonSerializable(typeof(RoutineRunDetailWsResponse))]
[JsonSerializable(typeof(RoutineExecutionPreviewWsResponse))]
[JsonSerializable(typeof(RoutineSchedulerStatusWsResponse))]
internal partial class WsRoutineJsonContext : JsonSerializerContext
{
}
