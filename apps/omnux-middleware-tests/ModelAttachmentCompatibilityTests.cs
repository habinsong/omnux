using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class ModelAttachmentCompatibilityTests
{
    [Theory]
    [InlineData("qwen/qwen3.8-27b", 3, true)]
    [InlineData("qwen/qwen3.8-27b", 4, false)]
    [InlineData("qwen/qwen3.6-27b", 1, true)]
    [InlineData("openai/gpt-oss-120b", 1, false)]
    public void GroqAttachmentRoutingRespectsModelImageSupport(string model, int count, bool expected)
    {
        var attachments = Enumerable.Range(0, count)
            .Select(index => new InputAttachment($"image-{index}.png", "image/png", "", 1, true))
            .ToArray();
        Assert.Equal(expected, CommandService.CanProviderHandleAttachments("groq", model, attachments));
    }

    [Fact]
    public void GroqVisionDoesNotAcceptPdfAsAnImage()
    {
        var file = new InputAttachment("document.pdf", "application/pdf", "", 1);
        Assert.False(CommandService.CanProviderHandleAttachments("groq", "qwen/qwen3.8-27b", new[] { file }));
    }
}
