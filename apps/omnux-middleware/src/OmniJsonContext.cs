using System.Text.Json.Serialization;

namespace Omnux.Middleware;

[JsonSourceGenerationOptions(WriteIndented = false)]
[JsonSerializable(typeof(Dictionary<string, string>))]
[JsonSerializable(typeof(CopilotState))]
[JsonSerializable(typeof(LlmUsageState))]
[JsonSerializable(typeof(ConversationState))]
[JsonSerializable(typeof(AuthSessionState))]
[JsonSerializable(typeof(RoutineState))]
[JsonSerializable(typeof(AgentSpawnDailyCostLedgerState))]
[JsonSerializable(typeof(AgentSpawnRunBreakerState))]
[JsonSerializable(typeof(BackupPackageManifest))]
internal partial class OmniJsonContext : JsonSerializerContext
{
}
