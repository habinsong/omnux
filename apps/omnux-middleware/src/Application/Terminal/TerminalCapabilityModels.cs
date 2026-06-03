namespace Omnux.Middleware;

internal sealed record TerminalCapabilitySnapshot(
    string Status,
    bool PtySessionEnabled,
    IReadOnlyList<TerminalCapabilityItem> Shells,
    IReadOnlyList<TerminalCapabilityItem> Toolchains,
    IReadOnlyList<TerminalCapabilityCheck> Checks,
    DateTimeOffset ScannedAtUtc
);

internal sealed record TerminalCapabilityItem(
    string Name,
    string Kind,
    string Command,
    string Status,
    string ResolvedPath,
    string Message
);

internal sealed record TerminalCapabilityCheck(
    string Name,
    string Status,
    string Message
);
