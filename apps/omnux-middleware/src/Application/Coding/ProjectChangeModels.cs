using System.Text.Json.Serialization;

namespace Omnux.Middleware;

public interface ICodingProjectChangeService
{
    Task<ProjectChangeResponse> PreviewAsync(string conversationId, string target, CancellationToken cancellationToken);
    Task<ProjectChangeResponse> ApplyAsync(string previewId, CancellationToken cancellationToken);
}

public sealed record ProjectFileChange(string Path, string Kind, string? BeforeHash, string? AfterHash, string Diff, bool Truncated, string? Conflict);
public sealed record ProjectChangePreview(string Id, string ConversationId, string Target, CodingProjectBinding Project, IReadOnlyList<ProjectFileChange> Files);
public sealed record ProjectChangeResponse(bool Ok, string Message, ProjectChangePreview? Preview = null, IReadOnlyList<string>? ChangedPaths = null);
internal sealed record ProjectChangeRecord(ProjectChangePreview Preview, string CandidateDirectory, string BaselineDirectory, DateTimeOffset CreatedUtc);

[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase, DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull)]
[JsonSerializable(typeof(ProjectChangeRecord))]
[JsonSerializable(typeof(ProjectChangeResponse))]
internal partial class ProjectChangeJsonContext : JsonSerializerContext { }
