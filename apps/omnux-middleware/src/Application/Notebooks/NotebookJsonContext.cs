using System.Text.Json.Serialization;

namespace Omnux.Middleware;

[JsonSerializable(typeof(ProjectNotebook))]
[JsonSerializable(typeof(NotebookDocumentSnapshot))]
[JsonSerializable(typeof(ProjectNotebookSnapshot))]
[JsonSerializable(typeof(NotebookActionResult))]
internal partial class NotebookJsonContext : JsonSerializerContext
{
}
