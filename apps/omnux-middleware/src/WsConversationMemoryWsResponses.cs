using System.Text.Json.Serialization;

namespace Omnux.Middleware;

internal record MemoryIndexRebuildWsResponse(
    string Type,
    bool Ok,
    string Message,
    string? Error,
    MemoryIndexSyncSnapshot? Snapshot
);

internal record ConversationSearchWsResponse(
    string Type,
    string Query,
    bool Disabled,
    IReadOnlyList<ConversationSearchHit> Results,
    string? Error
);

internal record BackupExportWsResponse(
    string Type,
    bool Ok,
    string FileName,
    string ContentBase64,
    long SizeBytes,
    IReadOnlyList<string> Scope,
    IReadOnlyList<string> Included,
    IReadOnlyList<string> Excluded,
    string? Error
);

internal record BackupImportPreviewWsResponse(
    string Type,
    bool Ok,
    string PreviewId,
    string FileName,
    int ConversationCount,
    int ConversationConflictCount,
    int FileConflictCount,
    int FileCount,
    IReadOnlyList<string> Conflicts,
    IReadOnlyList<string> FileConflicts,
    string SyncMode,
    string SyncConflictPolicy,
    string? Error
);

internal record BackupImportApplyWsResponse(
    string Type,
    bool Ok,
    int ImportedConversations,
    int SkippedConversations,
    int OverwrittenConversations,
    int ImportedFiles,
    int SkippedFiles,
    string? Error
);

[JsonSourceGenerationOptions(
    PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
)]
[JsonSerializable(typeof(MemoryIndexRebuildWsResponse))]
[JsonSerializable(typeof(ConversationSearchWsResponse))]
[JsonSerializable(typeof(BackupExportWsResponse))]
[JsonSerializable(typeof(BackupImportPreviewWsResponse))]
[JsonSerializable(typeof(BackupImportApplyWsResponse))]
internal partial class WsConversationMemoryJsonContext : JsonSerializerContext
{
}
