namespace Omnux.Middleware;

internal sealed record McpDiscoverySnapshot(
    IReadOnlyList<McpConfigFileDiscovery> ConfigFiles,
    IReadOnlyList<McpServerDiscovery> Servers,
    IReadOnlyList<McpDiscoveryError> Errors,
    int TotalServers,
    DateTimeOffset ScannedAtUtc
);

internal sealed record McpConfigFileDiscovery(
    string Source,
    string Path,
    bool Exists,
    string Status,
    int ServerCount,
    string? Error
);

internal sealed record McpServerDiscovery(
    string ServerId,
    string Name,
    string Source,
    string ConfigPath,
    string Transport,
    string Command,
    IReadOnlyList<string> ArgsPreview,
    int ArgumentCount,
    string Url,
    string WorkingDirectory,
    IReadOnlyList<string> EnvKeys,
    int EnvKeyCount,
    bool Enabled,
    string Status,
    string Message
);

internal sealed record McpDiscoveryError(
    string Source,
    string Path,
    string Code,
    string Message
);
