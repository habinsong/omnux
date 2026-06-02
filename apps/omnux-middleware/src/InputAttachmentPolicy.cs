namespace Omnux.Middleware;

internal static class InputAttachmentPolicy
{
    private static readonly string[] AudioFileExtensions =
    {
        ".ogg",
        ".oga",
        ".mp3",
        ".m4a",
        ".wav"
    };

    public static IReadOnlyList<InputAttachment> Normalize(IReadOnlyList<InputAttachment>? attachments)
    {
        if (attachments == null || attachments.Count == 0)
        {
            return Array.Empty<InputAttachment>();
        }

        var list = new List<InputAttachment>(attachments.Count);
        foreach (var item in attachments)
        {
            var name = (item.Name ?? string.Empty).Trim();
            var mimeType = string.IsNullOrWhiteSpace(item.MimeType) ? "application/octet-stream" : item.MimeType.Trim();
            var base64 = (item.DataBase64 ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(base64))
            {
                continue;
            }

            list.Add(new InputAttachment(name, mimeType, base64, item.SizeBytes, item.IsImage));
            if (list.Count >= 6)
            {
                break;
            }
        }

        return list.ToArray();
    }

    public static bool TryGetAudioAttachment(
        IReadOnlyList<InputAttachment>? attachments,
        out InputAttachment attachment
    )
    {
        attachment = null!;
        if (attachments == null || attachments.Count == 0)
        {
            return false;
        }

        foreach (var item in attachments)
        {
            if (IsAudioAttachment(item))
            {
                attachment = item;
                return true;
            }
        }

        return false;
    }

    private static bool IsAudioAttachment(InputAttachment item)
    {
        var mime = (item.MimeType ?? string.Empty).Trim();
        if (mime.StartsWith("audio/", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        var name = (item.Name ?? string.Empty).Trim();
        return AudioFileExtensions.Any(extension => name.EndsWith(extension, StringComparison.OrdinalIgnoreCase));
    }
}
