namespace Omnux.Middleware;

internal static class TelegramCommandHandoffPolicy
{
    private const int DefaultHeavyChars = 1800;
    private const int DefaultHeavyLines = 36;
    private const int DefaultPreviewChars = 900;
    private const string HandoffMarker = "...(telegram_command_output_handoff)";

    public static bool ShouldUseCommandHandoff(
        string? text,
        int heavyChars = DefaultHeavyChars,
        int heavyLines = DefaultHeavyLines
    )
    {
        var normalized = Normalize(text);
        if (normalized.Length == 0)
        {
            return false;
        }

        return normalized.Length >= Math.Max(1, heavyChars)
               || CountNonEmptyLines(normalized) >= Math.Max(1, heavyLines);
    }

    public static string BuildCommandHandoffText(
        string heading,
        string subject,
        string? text,
        IReadOnlyList<string> nextActions,
        int previewChars = DefaultPreviewChars
    )
    {
        var normalized = Normalize(text);
        var safeHeading = string.IsNullOrWhiteSpace(heading) ? "텔레그램 명령 결과" : heading.Trim();
        var safeSubject = string.IsNullOrWhiteSpace(subject) ? "-" : subject.Trim();
        var lineCount = CountNonEmptyLines(normalized);
        var preview = BuildPreview(normalized, previewChars);
        var lines = new List<string>
        {
            $"[{safeHeading}]",
            "출력이 커서 텔레그램에는 요약과 짧은 프리뷰만 표시합니다. 전체 diff/로그/파일/JSON은 데스크톱에서 이어보거나 /handoff로 넘기세요.",
            $"대상: {safeSubject}",
            $"크기: {normalized.Length:N0} chars, {lineCount:N0} lines",
        };

        if (!string.IsNullOrWhiteSpace(preview))
        {
            lines.Add(string.Empty);
            lines.Add("프리뷰:");
            lines.Add(preview);
        }

        var actions = (nextActions ?? Array.Empty<string>())
            .Where(action => !string.IsNullOrWhiteSpace(action))
            .Select(action => action.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(6)
            .ToArray();
        if (actions.Length > 0)
        {
            lines.Add(string.Empty);
            lines.Add("다음 작업:");
            foreach (var action in actions)
            {
                lines.Add($"- {action}");
            }
        }

        lines.Add(string.Empty);
        lines.Add(HandoffMarker);
        return string.Join('\n', lines).Trim();
    }

    private static string BuildPreview(string text, int previewChars)
    {
        var normalized = Normalize(text);
        var safeLimit = Math.Max(0, previewChars);
        if (safeLimit == 0 || normalized.Length == 0)
        {
            return string.Empty;
        }

        if (normalized.Length <= safeLimit)
        {
            return normalized;
        }

        var preview = normalized[..safeLimit].TrimEnd();
        var lastLineBreak = preview.LastIndexOf('\n');
        if (lastLineBreak >= Math.Min(120, preview.Length / 2))
        {
            preview = preview[..lastLineBreak].TrimEnd();
        }

        return preview + "\n...(프리뷰 생략)";
    }

    private static string Normalize(string? text)
    {
        return (text ?? string.Empty)
            .Replace("\r\n", "\n", StringComparison.Ordinal)
            .Replace("\r", "\n", StringComparison.Ordinal)
            .Trim();
    }

    private static int CountNonEmptyLines(string text)
    {
        return Normalize(text)
            .Split('\n', StringSplitOptions.None)
            .Count(line => !string.IsNullOrWhiteSpace(line));
    }
}
