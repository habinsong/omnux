using System.Text.Json;
using System.Text.Json.Serialization;

namespace Omnux.Middleware;

internal static class TelemetryTraceJson
{
    private static readonly TelemetryTraceJsonContext BaseContext = new(CreateOptions(indented: false));
    private static readonly TelemetryTraceJsonContext IndentedContext = new(CreateOptions(indented: true));

    public static string SerializeState(TelemetryTraceState state, bool indented = true)
    {
        return JsonSerializer.Serialize(state, (indented ? IndentedContext : BaseContext).TelemetryTraceState);
    }

    public static string SerializeSnapshot(TelemetrySnapshot snapshot, bool indented = false)
    {
        return JsonSerializer.Serialize(snapshot, (indented ? IndentedContext : BaseContext).TelemetrySnapshot);
    }

    public static string SerializeActionResult(TelemetryActionResult result, bool indented = false)
    {
        return JsonSerializer.Serialize(result, (indented ? IndentedContext : BaseContext).TelemetryActionResult);
    }

    public static TelemetryTraceState? DeserializeState(string json)
    {
        return JsonSerializer.Deserialize(json, BaseContext.TelemetryTraceState);
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
