namespace Omnux.Middleware;

internal sealed record LocalLlmEndpointConfig(
    string Name,
    string Kind,
    string BaseUrl
);

internal sealed record LocalLlmDiscoverySnapshot(
    IReadOnlyList<LocalLlmEndpointSnapshot> Endpoints,
    int AvailableEndpointCount,
    int TotalModelCount,
    bool OfflineReady,
    LocalLlmOfflineModeReadiness OfflineMode,
    IReadOnlyList<string> Warnings,
    DateTimeOffset ScannedAtUtc
);

internal sealed record LocalLlmOfflineModeReadiness(
    bool Requested,
    string Status,
    IReadOnlyList<string> RequestedBy,
    IReadOnlyList<string> CloudProviderKeysPresent,
    IReadOnlyList<LocalLlmOfflineModeCheck> Checks
);

internal sealed record LocalLlmOfflineModeCheck(
    string Name,
    string Status,
    string Message
);

internal sealed record LocalLlmEndpointSnapshot(
    string Name,
    string Kind,
    string BaseUrl,
    string Status,
    int ModelCount,
    IReadOnlyList<LocalLlmModelInfo> Models,
    string Error,
    long ElapsedMs
);

internal sealed record LocalLlmModelInfo(
    string Id,
    string OwnedBy,
    string Family,
    string ParameterSize,
    string Quantization,
    long? SizeBytes,
    DateTimeOffset? ModifiedAtUtc
);
