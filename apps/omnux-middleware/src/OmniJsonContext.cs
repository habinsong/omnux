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
[JsonSerializable(typeof(BackupSyncPolicy))]
[JsonSerializable(typeof(SyncConfiguration))]
[JsonSerializable(typeof(GistCreateRequest))]
[JsonSerializable(typeof(GistUpdateRequest))]
[JsonSerializable(typeof(GistResponse))]
internal partial class OmniJsonContext : JsonSerializerContext
{
}
