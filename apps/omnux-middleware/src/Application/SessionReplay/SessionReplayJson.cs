using System.Text.Json;
using System.Text.Json.Serialization;

namespace Omnux.Middleware;

internal static class SessionReplayJson
{
    private static readonly SessionReplayJsonContext BaseContext = new(CreateOptions(indented: false));
    private static readonly SessionReplayJsonContext IndentedContext = new(CreateOptions(indented: true));

    public static string SerializeSnapshot(SessionReplaySnapshot snapshot, bool indented = false)
    {
        return JsonSerializer.Serialize(snapshot, (indented ? IndentedContext : BaseContext).SessionReplaySnapshot);
    }

    public static string SerializeActionResult(SessionReplayActionResult result, bool indented = false)
    {
        return JsonSerializer.Serialize(result, (indented ? IndentedContext : BaseContext).SessionReplayActionResult);
    }

    private static JsonSerializerOptions CreateOptions(bool indented)
    {
        return new JsonSerializerOptions(JsonSerializerDefaults.Web)
        {
            WriteIndented = indented,
            DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
        };
    }
}
