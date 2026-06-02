namespace Omnux.Middleware;

internal static class TelegramCodingHandoffPolicy
{
    private const int HeavyChangedFileCount = 12;
    private const int HeavyWorkerCount = 4;
    private const int HeavySummaryChars = 1800;
    private const int HeavyCombinedTextChars = 2600;
    private const int MobileSummaryMaxChars = 520;

    public static bool ShouldUseMobileHandoff(ConversationCodingResultSnapshot result)
    {
        if (result == null)
        {
            return false;
        }

        if (result.ChangedFiles.Count >= HeavyChangedFileCount)
        {
            return true;
        }

        if (result.Workers.Count >= HeavyWorkerCount)
        {
            return true;
        }

        if (TextLength(result.Summary) >= HeavySummaryChars)
        {
            return true;
        }

        var combinedTextLength =
            TextLength(result.Summary)
            + TextLength(result.CommonSummary)
            + TextLength(result.CommonPoints)
            + TextLength(result.Differences)
            + TextLength(result.Recommendation)
            + result.Workers.Sum(worker => TextLength(worker.Summary));

        return combinedTextLength >= HeavyCombinedTextChars;
    }

    public static string BuildMobileHandoffText(
        ConversationThreadView conversation,
        ConversationCodingResultSnapshot result,
        string heading,
        Func<string, string?, bool, string> formatProviderWithModel,
        Func<string, string> formatModeDisplayName,
        Func<string?, string, string> toRelativePath)
    {
        var lines = new List<string>
        {
            $"[{heading}]",
            "코딩 결과가 커서 텔레그램에는 요약만 표시합니다. 전체 diff/로그/파일 내용은 데스크톱에서 이어보거나 /handoff로 넘기세요.",
            string.Empty,
            $"대화: {conversation.Title}",
            $"모드: {formatModeDisplayName(result.Mode)} 코딩",
            $"모델: {formatProviderWithModel(result.Provider, result.Model, true)}",
            $"언어: {result.Language}",
            $"작업 폴더: {result.Execution.RunDirectory}",
            $"상태: {result.Execution.Status} (exit={result.Execution.ExitCode})",
            $"변경 파일: {result.ChangedFiles.Count}개",
        };

        foreach (var path in result.ChangedFiles.Take(5))
        {
            lines.Add($"- {toRelativePath(result.Execution.RunDirectory, path)}");
        }

        if (result.ChangedFiles.Count > 5)
        {
            lines.Add($"- ...(추가 {result.ChangedFiles.Count - 5}개)");
        }

        var summary = BuildSummary(result);
        if (!string.IsNullOrWhiteSpace(summary))
        {
            lines.Add(string.Empty);
            lines.Add("요약:");
            lines.Add(summary);
        }

        if (result.Workers.Count > 0)
        {
            lines.Add(string.Empty);
            lines.Add($"워커 결과: {result.Workers.Count}개");
        }

        lines.Add(string.Empty);
        lines.Add("다음 작업:");
        lines.Add("- /coding files 로 변경 파일 목록 확인");
        lines.Add("- /coding download <번호> 로 필요한 파일만 받기");
        lines.Add("- /handoff 로 데스크톱 이어보기 문서 생성");

        return string.Join('\n', lines).Trim();
    }

    private static string BuildSummary(ConversationCodingResultSnapshot result)
    {
        var candidates = new[]
        {
            result.Summary,
            result.Recommendation,
            result.CommonSummary,
            result.Differences,
            result.CommonPoints
        };

        var selected = candidates.FirstOrDefault(item => !string.IsNullOrWhiteSpace(item)) ?? string.Empty;
        selected = ChatOutputSanitizerPolicy.RemoveCodeBlocksFromText(selected).Trim();
        if (selected.Length <= MobileSummaryMaxChars)
        {
            return selected;
        }

        return selected[..MobileSummaryMaxChars].TrimEnd() + "\n...(요약 생략)";
    }

    private static int TextLength(string? text)
    {
        return string.IsNullOrWhiteSpace(text) ? 0 : text.Trim().Length;
    }
}
