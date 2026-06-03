using System.Text.Json.Serialization;

namespace Omnux.Middleware;

[JsonSourceGenerationOptions(
    PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
)]
[JsonSerializable(typeof(GitOperationPreviewRequest))]
[JsonSerializable(typeof(GitOperationApplyRequest))]
[JsonSerializable(typeof(GitOperationPreviewResult))]
[JsonSerializable(typeof(GitOperationApplyResult))]
[JsonSerializable(typeof(GitOperationCheck))]
[JsonSerializable(typeof(GitOperationPlannedCommand))]
[JsonSerializable(typeof(GitOperationExecutedCommand))]
[JsonSerializable(typeof(GitOperationAffectedFile))]
[JsonSerializable(typeof(GitOperationApprovalPayload))]
[JsonSerializable(typeof(GitOperationPreviewRecord))]
[JsonSerializable(typeof(GitOperationPreviewState))]
[JsonSerializable(typeof(GitOperationApplySnapshot))]
internal partial class GitOperationJsonContext : JsonSerializerContext
{
}
