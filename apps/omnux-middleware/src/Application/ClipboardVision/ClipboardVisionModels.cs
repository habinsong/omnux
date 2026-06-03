namespace Omnux.Middleware;

internal sealed record ClipboardVisionPreflightInput(
    IReadOnlyList<InputAttachment>? Attachments,
    string? Provider,
    string? Model,
    string? GroqModel,
    string? GeminiModel,
    string? Text
);

internal sealed record ClipboardVisionPreflightSnapshot(
    string Status,
    bool ReadOnly,
    bool ClipboardWatcherEnabled,
    bool BackendVisionRouteAvailable,
    bool VisionCallEnabled,
    bool ScaffoldingExecutionEnabled,
    int AttachmentCount,
    int ImageCount,
    IReadOnlyList<ClipboardVisionImage> Images,
    IReadOnlyList<ClipboardVisionProviderCandidate> ProviderCandidates,
    IReadOnlyList<ClipboardVisionCheck> Checks,
    IReadOnlyList<string> Warnings,
    string SuggestedPrompt,
    DateTimeOffset ScannedAtUtc
);

internal sealed record ClipboardVisionImage(
    string Name,
    string MimeType,
    long DeclaredSizeBytes,
    long DecodedSizeBytes,
    string Status,
    bool Supported,
    string Message
);

internal sealed record ClipboardVisionProviderCandidate(
    string Provider,
    string Model,
    string Status,
    bool Selected,
    bool BackendSupported,
    string Message
);

internal sealed record ClipboardVisionCheck(
    string Name,
    string Status,
    string Message
);
