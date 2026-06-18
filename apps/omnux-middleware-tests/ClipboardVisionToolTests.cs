using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class ClipboardVisionToolTests
{
    private static readonly DateTimeOffset FixedNow = DateTimeOffset.Parse("2026-06-04T00:00:00Z");

    [Fact]
    public void BuildPreflightReturnsReadyForValidImageAndSupportedProvider()
    {
        var snapshot = new ClipboardVisionTool(() => FixedNow).BuildPreflight(new ClipboardVisionPreflightInput(
            new[] { new InputAttachment("screen.png", "image/png", "iVBORw0KGgo=", 8, true) },
            Provider: "gemini",
            Model: "gemini-3.1-pro",
            GroqModel: null,
            GeminiModel: "gemini-3.1-pro",
            Text: "이 UI를 분석해줘"
        ));

        Assert.Equal("ready_for_vision_prompt", snapshot.Status);
        Assert.True(snapshot.ReadOnly);
        Assert.False(snapshot.ClipboardWatcherEnabled);
        Assert.True(snapshot.BackendVisionRouteAvailable);
        Assert.False(snapshot.VisionCallEnabled);
        Assert.False(snapshot.ScaffoldingExecutionEnabled);
        Assert.Equal(1, snapshot.ImageCount);
        Assert.Equal("ready", snapshot.Images[0].Status);
        Assert.True(snapshot.Images[0].Supported);
        Assert.Contains(snapshot.ProviderCandidates, candidate => candidate.Provider == "gemini" && candidate.Selected);
        Assert.Contains(snapshot.Checks, check => check.Name == "vision_api_call" && check.Status == "skipped");
        Assert.NotEmpty(snapshot.SuggestedPrompt);
        Assert.Equal(FixedNow, snapshot.ScannedAtUtc);
    }

    [Fact]
    public void BuildPreflightBlocksWhenNoImageAttachmentExists()
    {
        var snapshot = new ClipboardVisionTool(() => FixedNow).BuildPreflight(new ClipboardVisionPreflightInput(
            new[] { new InputAttachment("note.txt", "text/plain", Convert.ToBase64String("hello"u8.ToArray())) },
            Provider: null,
            Model: null,
            GroqModel: null,
            GeminiModel: null,
            Text: null
        ));

        Assert.Equal("blocked", snapshot.Status);
        Assert.Equal(1, snapshot.AttachmentCount);
        Assert.Equal(0, snapshot.ImageCount);
        Assert.True(snapshot.BackendVisionRouteAvailable);
        Assert.Contains(snapshot.Checks, check => check.Name == "image_payload" && check.Status == "failed");
        Assert.Empty(snapshot.SuggestedPrompt);
    }

    [Fact]
    public void BuildPreflightBlocksInvalidBase64Image()
    {
        var snapshot = new ClipboardVisionTool(() => FixedNow).BuildPreflight(new ClipboardVisionPreflightInput(
            new[] { new InputAttachment("screen.png", "image/png", "not-base64", 10, true) },
            Provider: "groq",
            Model: "meta-llama/llama-4-scout-17b-16e-instruct",
            GroqModel: "meta-llama/llama-4-scout-17b-16e-instruct",
            GeminiModel: null,
            Text: null
        ));

        Assert.Equal("blocked", snapshot.Status);
        Assert.Equal(1, snapshot.ImageCount);
        Assert.Equal("invalid_base64", snapshot.Images[0].Status);
        Assert.Contains(snapshot.Warnings, warning => warning.Contains("invalid base64", StringComparison.Ordinal));
    }

    [Fact]
    public void BuildPreflightRequiresManualRoutingForUnsupportedSelectedProvider()
    {
        var snapshot = new ClipboardVisionTool(() => FixedNow).BuildPreflight(new ClipboardVisionPreflightInput(
            new[] { new InputAttachment("screen.jpg", "image/jpeg", "iVBORw0KGgo=", 8, true) },
            Provider: "codex",
            Model: "codex-cli",
            GroqModel: null,
            GeminiModel: null,
            Text: null
        ));

        Assert.Equal("manual_routing_required", snapshot.Status);
        Assert.True(snapshot.BackendVisionRouteAvailable);
        Assert.Contains(snapshot.ProviderCandidates, candidate =>
            candidate.Provider == "codex"
            && candidate.Selected
            && !candidate.BackendSupported
            && candidate.Status == "unsupported_selected");
        Assert.Contains(snapshot.Checks, check => check.Name == "provider_route" && check.Status == "failed");
    }
}
