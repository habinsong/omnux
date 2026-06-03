using System.Text;

namespace Omnux.Middleware;

internal static class AgentSpawnWatchdogWsJson
{
    public static void Append(StringBuilder builder, AgentSpawnWatchdogSnapshot? watchdog)
    {
        if (watchdog == null)
        {
            builder.Append("null");
            return;
        }

        builder.Append("{");
        builder.Append($"\"activeCount\":{watchdog.ActiveCount},");
        builder.Append($"\"timedOutCount\":{watchdog.TimedOutCount},");
        builder.Append($"\"staleCount\":{watchdog.StaleCount},");
        builder.Append($"\"eventCount\":{watchdog.EventCount},");
        builder.Append($"\"checkedUtc\":\"{WebSocketGateway.EscapeJson(watchdog.CheckedUtc.ToUniversalTime().ToString("O"))}\",");
        builder.Append("\"events\":[");
        for (var i = 0; i < watchdog.Events.Count; i++)
        {
            if (i > 0)
            {
                builder.Append(",");
            }

            AppendEvent(builder, watchdog.Events[i]);
        }

        builder.Append("]}");
    }

    private static void AppendEvent(StringBuilder builder, AgentSpawnWatchdogEvent item)
    {
        builder.Append("{");
        AppendNullableJsonString(builder, "runId", item.RunId);
        builder.Append(",");
        AppendNullableJsonString(builder, "childSessionKey", item.ChildSessionKey);
        builder.Append(",");
        AppendNullableJsonString(builder, "runtime", item.Runtime);
        builder.Append(",");
        AppendNullableJsonString(builder, "mode", item.Mode);
        builder.Append(",");
        AppendNullableJsonString(builder, "backend", item.Backend);
        builder.Append(",");
        AppendNullableJsonString(builder, "previousState", item.PreviousState);
        builder.Append(",");
        AppendNullableJsonString(builder, "state", item.State);
        builder.Append(",");
        AppendNullableJsonString(builder, "reason", item.Reason);
        builder.Append(",");
        AppendNullableJsonString(builder, "message", item.Message);
        builder.Append($",\"startedUtc\":\"{WebSocketGateway.EscapeJson(item.StartedUtc.ToUniversalTime().ToString("O"))}\"");
        builder.Append($",\"completedUtc\":\"{WebSocketGateway.EscapeJson(item.CompletedUtc.ToUniversalTime().ToString("O"))}\"");
        builder.Append($",\"ageSeconds\":{item.AgeSeconds}");
        builder.Append($",\"heartbeatAgeSeconds\":{item.HeartbeatAgeSeconds}");
        builder.Append("}");
    }

    private static void AppendNullableJsonString(StringBuilder builder, string name, string? value)
    {
        builder.Append($"\"{name}\":");
        if (string.IsNullOrWhiteSpace(value))
        {
            builder.Append("null");
            return;
        }

        builder.Append($"\"{WebSocketGateway.EscapeJson(value)}\"");
    }
}
