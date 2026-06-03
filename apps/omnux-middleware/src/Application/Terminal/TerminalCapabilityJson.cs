using System.Text.Json;

namespace Omnux.Middleware;

internal static class TerminalCapabilityJson
{
    private static readonly TerminalCapabilityJsonContext BaseContext = new(new JsonSerializerOptions(JsonSerializerDefaults.Web)
    {
        WriteIndented = false
    });

    public static string SerializeSnapshot(TerminalCapabilitySnapshot snapshot)
    {
        return JsonSerializer.Serialize(snapshot, BaseContext.TerminalCapabilitySnapshot);
    }
}
