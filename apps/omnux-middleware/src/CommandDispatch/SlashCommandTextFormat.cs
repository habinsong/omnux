namespace Omnux.Middleware;

/// <summary>
/// 텍스트 명령 핸들러들이 공유하는 순수 포맷 헬퍼. CommandService의 TrimPlanText와 동일 동작.
/// (레거시 CommandService 포맷터가 M5에서 제거되면 이 헬퍼가 단일 출처가 된다.)
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
