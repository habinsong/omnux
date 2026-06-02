using System.Text.Json.Serialization;

namespace Omnux.Middleware;

[JsonSourceGenerationOptions(
    PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
)]
[JsonSerializable(typeof(AnchorLine))]
[JsonSerializable(typeof(AnchorReadResult))]
[JsonSerializable(typeof(AnchorEditRequest))]
[JsonSerializable(typeof(AnchorEditRequest[]))]
[JsonSerializable(typeof(AnchorEditIssue))]
[JsonSerializable(typeof(AnchorEditIssue[]))]
[JsonSerializable(typeof(RefactorPreviewFile))]
[JsonSerializable(typeof(RefactorPreviewFile[]))]
[JsonSerializable(typeof(RefactorPreview))]
[JsonSerializable(typeof(RefactorApplyOutcome))]
[JsonSerializable(typeof(RefactorRollbackOutcome))]
[JsonSerializable(typeof(RefactorToolInvocationResult))]
[JsonSerializable(typeof(RefactorActionResult))]
[JsonSerializable(typeof(RefactorPreviewRecord))]
[JsonSerializable(typeof(RefactorRollbackFile))]
[JsonSerializable(typeof(RefactorRollbackFile[]))]
[JsonSerializable(typeof(RefactorRollbackRecord))]
internal partial class RefactorJsonContext : JsonSerializerContext
{
}
