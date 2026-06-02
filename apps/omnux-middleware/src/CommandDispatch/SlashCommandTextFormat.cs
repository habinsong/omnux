namespace Omnux.Middleware;

/// <summary>
/// 텍스트 명령 핸들러들이 공유하는 순수 포맷 헬퍼.
/// </summary>
internal static class SlashCommandTextFormat
{
    public static string Trim(string? text, int maxLength)
    {
        var normalized = (text ?? string.Empty).Trim();
        if (normalized.Length <= maxLength)
        {
            return normalized;
        }

        return normalized[..Math.Max(0, maxLength - 3)] + "...";
    }
}
