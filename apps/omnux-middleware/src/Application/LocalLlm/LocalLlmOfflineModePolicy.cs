namespace Omnux.Middleware;

internal static class LocalLlmOfflineModePolicy
{
    private static readonly string[] OfflineModeFlagKeys =
    {
        "OMNUX_OFFLINE_MODE",
        "OMNUX_LOCAL_LLM_ONLY",
        "OMNUX_DISABLE_CLOUD_LLM"
    };

    private static readonly string[] CloudProviderSecretKeys =
    {
        "OMNUX_GROQ_API_KEY",
        "OMNUX_GROQ_API_KEY_FILE",
        "OMNUX_GEMINI_API_KEY",
        "OMNUX_GEMINI_API_KEY_FILE",
        "OMNUX_CEREBRAS_API_KEY",
        "OMNUX_CEREBRAS_API_KEY_FILE",
        "OMNUX_NVIDIA_API_KEY",
        "OMNUX_NVIDIA_API_KEY_FILE",
        "OMNUX_CODEX_API_KEY",
        "OMNUX_CODEX_API_KEY_FILE"
    };

    public static LocalLlmOfflineModeReadiness Evaluate(
        IReadOnlyList<LocalLlmEndpointSnapshot> endpoints,
        Func<string, string?> envGet
    )
    {
        var offlineReady = endpoints.Any(item => item.Status == "available" && item.ModelCount > 0);
        var requestedBy = OfflineModeFlagKeys
            .Where(key => IsTruthy(envGet(key)))
            .ToArray();
        var requested = requestedBy.Length > 0;
        var cloudKeysPresent = CloudProviderSecretKeys
            .Where(key => !string.IsNullOrWhiteSpace(envGet(key)))
            .ToArray();
        var checks = new List<LocalLlmOfflineModeCheck>
        {
            requested
                ? new LocalLlmOfflineModeCheck("offline_flag", "ok", "offline mode was requested")
                : new LocalLlmOfflineModeCheck("offline_flag", "skipped", "offline mode was not requested"),
            offlineReady
                ? new LocalLlmOfflineModeCheck("local_models", "ok", "at least one local model is available")
                : new LocalLlmOfflineModeCheck("local_models", "failed", "no available local model was discovered"),
            cloudKeysPresent.Length == 0
                ? new LocalLlmOfflineModeCheck("cloud_credentials", "ok", "no cloud provider key env vars were detected")
                : new LocalLlmOfflineModeCheck("cloud_credentials", "warning", "cloud provider key env vars are configured"),
            new("provider_routing", "skipped", "LocalLlmProvider routing is not enabled yet"),
            new("traffic_guard", "skipped", "external HTTP traffic blocking is not enabled yet")
        };

        var status = requested
            ? offlineReady ? "ready_for_manual_routing" : "blocked"
            : "not_requested";
        return new LocalLlmOfflineModeReadiness(
            requested,
            status,
            requestedBy,
            cloudKeysPresent,
            checks
        );
    }

    private static bool IsTruthy(string? value)
    {
        var normalized = (value ?? string.Empty).Trim().ToLowerInvariant();
        return normalized is "1" or "true" or "yes" or "on" or "enabled" or "local" or "local_only";
    }
}
