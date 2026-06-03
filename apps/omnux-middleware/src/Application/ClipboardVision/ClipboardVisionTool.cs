namespace Omnux.Middleware;

internal sealed class ClipboardVisionTool
{
    private const long MaxImageBytes = 15 * 1024 * 1024;

    private readonly Func<DateTimeOffset> _utcNow;

    public ClipboardVisionTool(Func<DateTimeOffset>? utcNow = null)
    {
        _utcNow = utcNow ?? (() => DateTimeOffset.UtcNow);
    }

    public ClipboardVisionPreflightSnapshot BuildPreflight(ClipboardVisionPreflightInput input)
    {
        var attachments = InputAttachmentPolicy.Normalize(input.Attachments);
        var warnings = new List<string>();
        var images = attachments
            .Where(IsImageLike)
            .Select(item => InspectImage(item, warnings))
            .ToArray();
        var validImageCount = images.Count(image => image.Status == "ready");
        var providerCandidates = BuildProviderCandidates(input, warnings);
        var backendRouteAvailable = providerCandidates.Any(candidate => candidate.BackendSupported);
        var checks = BuildChecks(images, providerCandidates, backendRouteAvailable);
        var status = ResolveStatus(validImageCount, providerCandidates);

        return new ClipboardVisionPreflightSnapshot(
            status,
            ReadOnly: true,
            ClipboardWatcherEnabled: false,
            backendRouteAvailable,
            VisionCallEnabled: false,
            ScaffoldingExecutionEnabled: false,
            attachments.Count,
            images.Length,
            images,
            providerCandidates,
            checks,
            warnings,
            status == "blocked" ? string.Empty : BuildSuggestedPrompt(input.Text),
            _utcNow()
        );
    }

    private static IReadOnlyList<ClipboardVisionCheck> BuildChecks(
        IReadOnlyList<ClipboardVisionImage> images,
        IReadOnlyList<ClipboardVisionProviderCandidate> providerCandidates,
        bool backendRouteAvailable
    )
    {
        var validImageCount = images.Count(image => image.Status == "ready");
        var selectedProvider = providerCandidates.FirstOrDefault(candidate => candidate.Selected);
        var providerStatus = selectedProvider switch
        {
            { BackendSupported: true } => new ClipboardVisionCheck("provider_route", "ok", "selected provider has a backend vision route"),
            { BackendSupported: false } => new ClipboardVisionCheck("provider_route", "failed", "selected provider does not have a backend vision route"),
            _ when backendRouteAvailable => new ClipboardVisionCheck("provider_route", "warning", "no provider was selected; frontend should choose Gemini or Groq"),
            _ => new ClipboardVisionCheck("provider_route", "failed", "no backend vision route is available")
        };

        return new[]
        {
            validImageCount > 0
                ? new ClipboardVisionCheck("image_payload", "ok", "at least one image attachment is valid")
                : new ClipboardVisionCheck("image_payload", "failed", "no valid image attachment was provided"),
            providerStatus,
            new ClipboardVisionCheck("clipboard_watcher", "skipped", "desktop frontend clipboard watcher is not implemented in backend"),
            new ClipboardVisionCheck("vision_api_call", "skipped", "preflight does not call an LLM vision API"),
            new ClipboardVisionCheck("scaffolding_execution", "skipped", "code scaffolding is not executed by preflight"),
            new ClipboardVisionCheck("canvas_preview", "skipped", "CanvasTool preview integration is not enabled yet")
        };
    }

    private static ClipboardVisionImage InspectImage(InputAttachment attachment, ICollection<string> warnings)
    {
        var name = string.IsNullOrWhiteSpace(attachment.Name) ? "clipboard-image" : attachment.Name.Trim();
        var mimeType = NormalizeMimeType(attachment);
        if (!IsSupportedImageMime(mimeType))
        {
            warnings.Add($"unsupported image mime type: {name} ({mimeType})");
            return new ClipboardVisionImage(
                name,
                mimeType,
                attachment.SizeBytes,
                0,
                "unsupported",
                false,
                "image mime type is not supported"
            );
        }

        try
        {
            var bytes = Convert.FromBase64String(attachment.DataBase64);
            if (bytes.Length == 0)
            {
                warnings.Add($"empty image attachment: {name}");
                return new ClipboardVisionImage(name, mimeType, attachment.SizeBytes, 0, "empty", false, "image is empty");
            }

            if (bytes.LongLength > MaxImageBytes)
            {
                warnings.Add($"image attachment too large: {name}");
                return new ClipboardVisionImage(
                    name,
                    mimeType,
                    attachment.SizeBytes,
                    bytes.LongLength,
                    "too_large",
                    false,
                    "image exceeds backend attachment size limit"
                );
            }

            return new ClipboardVisionImage(
                name,
                mimeType,
                attachment.SizeBytes,
                bytes.LongLength,
                "ready",
                true,
                "image is ready for a vision prompt"
            );
        }
        catch (FormatException)
        {
            warnings.Add($"invalid base64 image attachment: {name}");
            return new ClipboardVisionImage(
                name,
                mimeType,
                attachment.SizeBytes,
                0,
                "invalid_base64",
                false,
                "image data is not valid base64"
            );
        }
    }

    private static IReadOnlyList<ClipboardVisionProviderCandidate> BuildProviderCandidates(
        ClipboardVisionPreflightInput input,
        ICollection<string> warnings
    )
    {
        var selectedProvider = ResolveSelectedProvider(input);
        var candidates = new List<ClipboardVisionProviderCandidate>
        {
            BuildKnownProvider("gemini", input.GeminiModel, input, selectedProvider),
            BuildKnownProvider("groq", input.GroqModel, input, selectedProvider)
        };

        if (!string.IsNullOrWhiteSpace(selectedProvider)
            && !IsBackendSupportedProvider(selectedProvider))
        {
            warnings.Add($"selected provider does not support backend vision route: {selectedProvider}");
            candidates.Insert(0, new ClipboardVisionProviderCandidate(
                selectedProvider,
                string.IsNullOrWhiteSpace(input.Model) ? string.Empty : input.Model.Trim(),
                "unsupported_selected",
                true,
                false,
                "selected provider is not wired for image vision in backend"
            ));
        }
        else if (string.IsNullOrWhiteSpace(selectedProvider))
        {
            warnings.Add("no provider selected; frontend should route clipboard vision to Gemini or Groq");
        }

        return candidates;
    }

    private static ClipboardVisionProviderCandidate BuildKnownProvider(
        string provider,
        string? providerModel,
        ClipboardVisionPreflightInput input,
        string selectedProvider
    )
    {
        var selected = provider.Equals(selectedProvider, StringComparison.OrdinalIgnoreCase);
        var model = selected && !string.IsNullOrWhiteSpace(input.Model)
            ? input.Model.Trim()
            : (providerModel ?? string.Empty).Trim();
        return new ClipboardVisionProviderCandidate(
            provider,
            model,
            selected ? "selected" : "fallback_candidate",
            selected,
            true,
            selected
                ? "selected provider can receive image attachments through backend multimodal chat"
                : "backend can route image attachments here if credentials and model are configured"
        );
    }

    private static string ResolveStatus(
        int validImageCount,
        IReadOnlyList<ClipboardVisionProviderCandidate> providerCandidates
    )
    {
        if (validImageCount <= 0)
        {
            return "blocked";
        }

        var selected = providerCandidates.FirstOrDefault(candidate => candidate.Selected);
        if (selected is { BackendSupported: false })
        {
            return "manual_routing_required";
        }

        return "ready_for_vision_prompt";
    }

    private static string ResolveSelectedProvider(ClipboardVisionPreflightInput input)
    {
        if (!string.IsNullOrWhiteSpace(input.Provider))
        {
            return input.Provider.Trim().ToLowerInvariant();
        }

        if (!string.IsNullOrWhiteSpace(input.GeminiModel))
        {
            return "gemini";
        }

        if (!string.IsNullOrWhiteSpace(input.GroqModel))
        {
            return "groq";
        }

        return string.Empty;
    }

    private static bool IsImageLike(InputAttachment attachment)
    {
        return attachment.IsImage
               || (attachment.MimeType ?? string.Empty).Trim().StartsWith("image/", StringComparison.OrdinalIgnoreCase)
               || HasImageExtension(attachment.Name);
    }

    private static string NormalizeMimeType(InputAttachment attachment)
    {
        var mime = (attachment.MimeType ?? string.Empty).Trim();
        if (!string.IsNullOrWhiteSpace(mime) && mime != "application/octet-stream")
        {
            return mime.ToLowerInvariant();
        }

        var name = (attachment.Name ?? string.Empty).Trim().ToLowerInvariant();
        if (name.EndsWith(".png", StringComparison.Ordinal))
        {
            return "image/png";
        }

        if (name.EndsWith(".jpg", StringComparison.Ordinal)
            || name.EndsWith(".jpeg", StringComparison.Ordinal))
        {
            return "image/jpeg";
        }

        if (name.EndsWith(".webp", StringComparison.Ordinal))
        {
            return "image/webp";
        }

        if (name.EndsWith(".gif", StringComparison.Ordinal))
        {
            return "image/gif";
        }

        return string.IsNullOrWhiteSpace(mime) ? "application/octet-stream" : mime.ToLowerInvariant();
    }

    private static bool IsSupportedImageMime(string mimeType)
    {
        return mimeType is "image/png" or "image/jpeg" or "image/webp" or "image/gif";
    }

    private static bool HasImageExtension(string name)
    {
        var normalized = (name ?? string.Empty).Trim().ToLowerInvariant();
        return normalized.EndsWith(".png", StringComparison.Ordinal)
               || normalized.EndsWith(".jpg", StringComparison.Ordinal)
               || normalized.EndsWith(".jpeg", StringComparison.Ordinal)
               || normalized.EndsWith(".webp", StringComparison.Ordinal)
               || normalized.EndsWith(".gif", StringComparison.Ordinal);
    }

    private static bool IsBackendSupportedProvider(string provider)
    {
        return provider.Equals("gemini", StringComparison.OrdinalIgnoreCase)
               || provider.Equals("groq", StringComparison.OrdinalIgnoreCase);
    }

    private static string BuildSuggestedPrompt(string? userText)
    {
        var intent = string.IsNullOrWhiteSpace(userText)
            ? "첨부된 UI 스크린샷을 분석해 레이아웃, 컴포넌트, 색상, 타이포그래피, 간격, 상호작용 단서를 구조화해 주세요."
            : userText.Trim();
        return intent
               + "\n\n출력은 구현자가 바로 사용할 수 있게 design tokens, layout tree, component list, copy text, uncertainty 순서로 정리해 주세요.";
    }
}
