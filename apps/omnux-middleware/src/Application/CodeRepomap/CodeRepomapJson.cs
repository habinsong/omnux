using System.Text.Json;

namespace Omnux.Middleware;

internal static class CodeRepomapJson
{
    private static readonly CodeRepomapJsonContext BaseContext = new(new JsonSerializerOptions(JsonSerializerDefaults.Web)
    {
        WriteIndented = false
    });

    public static string SerializeSnapshot(CodeRepomapSnapshot snapshot)
    {
        return JsonSerializer.Serialize(snapshot, BaseContext.CodeRepomapSnapshot);
    }
}
