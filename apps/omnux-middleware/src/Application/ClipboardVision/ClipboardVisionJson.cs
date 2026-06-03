using System.Text.Json;
using System.Text.Json.Serialization;

namespace Omnux.Middleware;

internal static class ClipboardVisionJson
{
    private static readonly ClipboardVisionJsonContext BaseContext = new(new JsonSerializerOptions(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    });

    public static string SerializeSnapshot(ClipboardVisionPreflightSnapshot snapshot)
    {
        return JsonSerializer.Serialize(snapshot, BaseContext.ClipboardVisionPreflightSnapshot);
    }
}
