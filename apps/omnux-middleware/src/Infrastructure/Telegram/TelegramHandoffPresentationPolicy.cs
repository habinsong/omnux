namespace Omnux.Middleware;

internal static class TelegramHandoffPresentationPolicy
{
    public static string BuildTelegramHandoffResult(NotebookActionResult result)
    {
        if (!result.Ok)
        {
            return $"error: {result.Message}";
        }

        if (result.Snapshot == null)
        {
            return result.Message;
        }

        var snapshot = result.Snapshot;
        var handoffPath = string.IsNullOrWhiteSpace(snapshot.Handoff.Path) ? "-" : snapshot.Handoff.Path;
        var lines = new List<string>
        {
            "[데스크톱 handoff 생성]",
            result.Message,
            $"projectKey={snapshot.Notebook.ProjectKey}",
            $"rootPath={snapshot.Notebook.RootPath}",
            $"handoffPath={handoffPath}",
            $"updated={snapshot.Handoff.UpdatedAtUtc}",
            string.Empty,
            "데스크톱에서 이어보기:",
            "- Notebooks 화면의 Handoff 패널을 엽니다.",
            $"- 로컬 문서: {handoffPath}",
            string.Empty,
            "텔레그램에서는 요약과 트리거만 확인하고, 큰 작업은 데스크톱에서 이어가세요."
        };

        if (!string.IsNullOrWhiteSpace(snapshot.Handoff.Preview))
        {
            lines.Add(string.Empty);
            lines.Add("프리뷰:");
            lines.Add(TrimPreview(snapshot.Handoff.Preview, 420));
        }

        return string.Join('\n', lines).Trim();
    }

    private static string TrimPreview(string text, int maxChars)
    {
        var normalized = (text ?? string.Empty).Replace("\r\n", "\n", StringComparison.Ordinal).Trim();
        if (normalized.Length <= maxChars)
        {
            return normalized;
        }

        return normalized[..Math.Max(0, maxChars - 12)].TrimEnd() + "\n...(생략)";
    }
}
