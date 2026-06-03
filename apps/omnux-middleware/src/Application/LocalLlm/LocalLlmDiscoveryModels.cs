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
    IReadOnlyList<string> Warnings,
    DateTimeOffset ScannedAtUtc
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
