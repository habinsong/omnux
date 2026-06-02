namespace Omnux.Middleware.Tests;

public sealed class InputAttachmentPolicyTests
{
    [Fact]
    public void Normalize_DropsEmptyPayloadsAndDefaultsMimeType()
    {
        var normalized = InputAttachmentPolicy.Normalize(new[]
        {
            new InputAttachment(" empty.txt ", " text/plain ", "   "),
            new InputAttachment(" note.txt ", "   ", " abc ", 10, true)
        });

        var item = Assert.Single(normalized);
        Assert.Equal("note.txt", item.Name);
        Assert.Equal("application/octet-stream", item.MimeType);
        Assert.Equal("abc", item.DataBase64);
        Assert.Equal(10, item.SizeBytes);
        Assert.True(item.IsImage);
    }

    [Fact]
    public void Normalize_LimitsAttachmentsToSixItems()
    {
        var input = Enumerable.Range(0, 8)
            .Select(index => new InputAttachment($"file{index}.txt", "text/plain", $"data{index}"))
            .ToArray();

        var normalized = InputAttachmentPolicy.Normalize(input);

        Assert.Equal(6, normalized.Count);
        Assert.Equal("file0.txt", normalized[0].Name);
        Assert.Equal("file5.txt", normalized[5].Name);
    }

    [Theory]
    [InlineData("voice.bin", "audio/ogg")]
    [InlineData("VOICE.OGA", "application/octet-stream")]
    [InlineData("voice.mp3", "application/octet-stream")]
    [InlineData("voice.m4a", "application/octet-stream")]
    [InlineData("voice.wav", "application/octet-stream")]
    public void TryGetAudioAttachment_AcceptsAudioMimeTypeOrKnownExtensions(string name, string mimeType)
    {
        var ok = InputAttachmentPolicy.TryGetAudioAttachment(
            new[] { new InputAttachment(name, mimeType, "abc") },
            out var attachment
        );

        Assert.True(ok);
        Assert.Equal(name, attachment.Name);
    }

    [Fact]
    public void TryGetAudioAttachment_RejectsNonAudioAttachments()
    {
        var ok = InputAttachmentPolicy.TryGetAudioAttachment(
            new[] { new InputAttachment("image.png", "image/png", "abc") },
            out _
        );

        Assert.False(ok);
    }
}
