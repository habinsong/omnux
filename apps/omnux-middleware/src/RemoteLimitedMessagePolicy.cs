namespace Omnux.Middleware;

internal static class RemoteLimitedMessagePolicy
{
    private static readonly HashSet<string> AllowedMessageTypes = new(StringComparer.Ordinal)
    {
        "list_conversations",
        "get_conversation",
        "list_memory_notes",
        "read_memory_note",
        "memory_search",
        "conversation_search",
        "memory_get",
        "context_scan",
        "skills_list",
        "commands_list",
        "notebook_get",
        "get_groq_models",
        "get_copilot_models",
        "get_gemini_models",
        "get_nvidia_models",
        "get_cerebras_models",
        "get_codex_models",
        "get_usage_stats",
        "get_settings",
        "get_setup_state",
        "routing_policy_get",
        "routing_decision_get_last",
        "projects_list",
        "get_routines",
        "get_metrics",
        "rules_get"
    };

    public static bool IsAllowed(string? messageType)
    {
        return !string.IsNullOrWhiteSpace(messageType)
               && AllowedMessageTypes.Contains(messageType);
    }
}
