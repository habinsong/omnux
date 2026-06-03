namespace Omnux.Middleware;

internal sealed record CodeRepomapSnapshot(
    string Status,
    string WorkspaceRoot,
    IReadOnlyList<CodeRepomapFile> Files,
    int ScannedFileCount,
    int MappedFileCount,
    int SymbolCount,
    bool Truncated,
    IReadOnlyList<string> Warnings,
    DateTimeOffset ScannedAtUtc
);

internal sealed record CodeRepomapFile(
    string Path,
    string Language,
    int SymbolCount,
    IReadOnlyList<CodeRepomapSymbol> Symbols
);

internal sealed record CodeRepomapSymbol(
    string Name,
    string Kind,
    string Signature,
    int Line
);
