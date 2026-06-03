using System.Text.Json;
using System.Text.Json.Serialization;

namespace Omnux.Middleware;

internal static class AgentWorktreeSnapshotJson
{
    private static readonly AgentWorktreeSnapshotJsonContext BaseContext = new(new JsonSerializerOptions(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    });

    public static string SerializeSnapshot(AgentWorktreeSnapshot snapshot)
    {
        return JsonSerializer.Serialize(snapshot, BaseContext.AgentWorktreeSnapshot);
    }
}
