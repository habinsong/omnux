using System.Text;

namespace Omnux.Middleware;

public sealed partial class CommandService
{
    private async Task<string?> TryHandleTelegramRefactorCommandAsync(
        string text,
        CancellationToken cancellationToken
    )
    {
        if (!text.StartsWith("/refactor", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        var normalized = (text ?? string.Empty).Replace("\r\n", "\n").Trim();
        var tokens = normalized.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (tokens.Length == 1 || tokens[1].Equals("help", StringComparison.OrdinalIgnoreCase))
        {
            return BuildTelegramHelpText("refactor");
        }

        if (tokens[1].Equals("status", StringComparison.OrdinalIgnoreCase))
        {
            return BuildTelegramRefactorStatusText();
        }

        if (tokens[1].Equals("read", StringComparison.OrdinalIgnoreCase))
        {
            if (tokens.Length < 3)
            {
                return "사용법: /refactor read <path> [start] [end]";
            }

            var path = tokens[2];
            int? start = null;
            int? end = null;
            if (tokens.Length >= 4 && int.TryParse(tokens[3], out var parsedStart))
            {
                start = Math.Max(1, parsedStart);
            }

            if (tokens.Length >= 5 && int.TryParse(tokens[4], out var parsedEnd))
            {
                end = Math.Max(start ?? 1, parsedEnd);
            }

            var result = await ReadWithAnchorsAsync(path, cancellationToken);
            if (!result.Ok || result.ReadResult == null)
            {
                UpdateTelegramRefactorSession(path, null, result.Message);
                return $"Safe Refactor 읽기 실패: {result.Message}";
            }

            UpdateTelegramRefactorSession(result.ReadResult.Path, null, result.Message);
            return BuildTelegramRefactorReadText(result.ReadResult, start, end);
        }

        if (tokens[1].Equals("preview", StringComparison.OrdinalIgnoreCase))
        {
            if (!TryParseTelegramRefactorPreviewCommand(
                    normalized,
                    out var path,
                    out var startLine,
                    out var endLine,
                    out var replacement,
                    out var parseError))
            {
                return parseError;
            }

            var readResult = await ReadWithAnchorsAsync(path, cancellationToken);
            if (!readResult.Ok || readResult.ReadResult == null)
            {
                UpdateTelegramRefactorSession(path, null, readResult.Message);
                return $"Safe Refactor 미리보기 실패: {readResult.Message}";
            }

            var anchorLines = readResult.ReadResult.Lines
                .Where(line => line.LineNumber >= startLine && line.LineNumber <= endLine)
                .OrderBy(line => line.LineNumber)
                .ToArray();
            var expectedCount = endLine - startLine + 1;
            if (anchorLines.Length != expectedCount)
            {
                UpdateTelegramRefactorSession(path, null, "요청 범위 anchor를 찾지 못했습니다.");
                return $"Safe Refactor 미리보기 실패: L{startLine}~L{endLine} anchor를 읽지 못했습니다. 먼저 `/refactor read {path} {startLine} {endLine}` 로 범위를 확인하세요.";
            }

            var preview = await PreviewRefactorAsync(
                path,
                new[]
                {
                    new AnchorEditRequest(
                        startLine,
                        endLine,
                        anchorLines.Select(line => line.Hash).ToArray(),
                        replacement
                    )
                },
                cancellationToken
            );
            if (!preview.Ok || preview.Preview == null)
            {
                UpdateTelegramRefactorSession(path, null, preview.Message);
                return BuildTelegramRefactorFailureText("Safe Refactor 미리보기 실패", preview);
            }

            UpdateTelegramRefactorSession(preview.Preview.Path, preview.Preview.PreviewId, preview.Message);
            return BuildTelegramRefactorPreviewText(preview.Preview);
        }

        if (tokens[1].Equals("apply", StringComparison.OrdinalIgnoreCase))
        {
            var previewId = tokens.Length >= 3 ? tokens[2] : GetTelegramRefactorSession().PreviewId;
            if (string.IsNullOrWhiteSpace(previewId))
            {
                return "적용할 previewId가 없습니다. 먼저 `/refactor preview ...` 를 실행하세요.";
            }

            var apply = await ApplyRefactorAsync(previewId, cancellationToken);
            UpdateTelegramRefactorSession(
                apply.ApplyResult?.Path,
                apply.Ok ? string.Empty : previewId,
                apply.Message
            );
            if (!apply.Ok || apply.ApplyResult == null)
            {
                return BuildTelegramRefactorFailureText("Safe Refactor 적용 실패", apply);
            }

            return $"""
                    [Safe Refactor 적용 완료]
                    파일: {apply.ApplyResult.Path}
                    previewId: {apply.ApplyResult.PreviewId}
                    rollbackId: {apply.ApplyResult.RollbackId}
                    적용 시각: {apply.ApplyResult.AppliedAtUtc}
                    메시지: {apply.Message}
                    """;
        }

        if (tokens[1].Equals("restore", StringComparison.OrdinalIgnoreCase))
        {
            var rollbackId = tokens.Length >= 3 ? tokens[2] : string.Empty;
            if (string.IsNullOrWhiteSpace(rollbackId))
            {
                return "복원할 rollbackId가 필요합니다. `/refactor apply` 결과의 rollbackId를 사용하세요.";
            }

            var restore = await RestoreRollbackAsync(rollbackId, cancellationToken);
            if (!restore.Ok || restore.RollbackResult == null)
            {
                return BuildTelegramRefactorFailureText("Safe Refactor rollback 복원 실패", restore);
            }

            return $"""
                    [Safe Refactor rollback 복원 완료]
                    rollbackId: {restore.RollbackResult.RollbackId}
                    파일 수: {restore.RollbackResult.ChangedPaths?.Count ?? 0}
                    복원 시각: {restore.RollbackResult.RestoredAtUtc}
                    메시지: {restore.Message}
                    """;
        }

        return BuildTelegramHelpText("refactor");
    }

    private string BuildTelegramRefactorStatusText()
    {
        var snapshot = GetTelegramRefactorSession();
        if (string.IsNullOrWhiteSpace(snapshot.Path) && string.IsNullOrWhiteSpace(snapshot.PreviewId))
        {
            return "최근 Safe Refactor 상태가 없습니다. `/refactor read <path>` 또는 `/refactor preview ...` 를 먼저 실행하세요.";
        }

        return $"""
                [Safe Refactor 상태]
                파일: {snapshot.Path}
                previewId: {snapshot.PreviewId}
                마지막 메시지: {snapshot.LastMessage}
                갱신 시각: {snapshot.UpdatedAtLocal}
                """;
    }

    private string BuildTelegramRefactorReadText(AnchorReadResult readResult, int? startLine, int? endLine)
    {
        var filteredLines = readResult.Lines
            .Where(line => (!startLine.HasValue || line.LineNumber >= startLine.Value)
                        && (!endLine.HasValue || line.LineNumber <= endLine.Value))
            .Take(24)
            .ToArray();
        if (filteredLines.Length == 0)
        {
            return $"""
                    [Safe Refactor 읽기]
                    파일: {readResult.Path}
                    표시 가능한 line을 찾지 못했습니다.
                    먼저 `/refactor read {readResult.Path}` 로 전체 표시 범위를 확인하세요.
                    """;
        }

        var builder = new StringBuilder();
        builder.AppendLine("[Safe Refactor 읽기]");
        builder.AppendLine($"파일: {readResult.Path}");
        builder.AppendLine($"line: {readResult.TotalLines}개{(readResult.Truncated ? " (일부만 표시)" : string.Empty)}");
        foreach (var line in filteredLines)
        {
            builder.AppendLine($"L{line.LineNumber} {ClipHash(line.Hash)} | {ClampTelegramInline(line.Content, 110)}");
        }

        builder.AppendLine();
        builder.AppendLine("미리보기 예시:");
        builder.AppendLine($"/refactor preview {readResult.Path} {filteredLines[0].LineNumber} {filteredLines[^1].LineNumber}");
        builder.AppendLine("바꿀 코드를 다음 줄부터 붙여 넣으세요.");
        return builder.ToString().Trim();
    }

    private static string BuildTelegramRefactorPreviewText(RefactorPreview preview)
    {
        var diffPreview = TrimForOutput(preview.UnifiedDiff, 2200);
        return $"""
                [Safe Refactor 미리보기]
                파일: {preview.Path}
                previewId: {preview.PreviewId}
                safeToApply: {(preview.SafeToApply ? "yes" : "no")}

                diff:
                {diffPreview}

                적용:
                - /refactor apply
                - /refactor apply {preview.PreviewId}
                """;
    }

    private static string BuildTelegramRefactorFailureText(string heading, RefactorActionResult result)
    {
        var builder = new StringBuilder();
        builder.AppendLine($"[{heading}]");
        builder.AppendLine(result.Message);
        foreach (var issue in (result.Issues ?? Array.Empty<AnchorEditIssue>()).Take(4))
        {
            builder.AppendLine($"- L{issue.StartLine}~L{issue.EndLine}: {issue.Reason}");
            if (!string.IsNullOrWhiteSpace(issue.CurrentSnippet))
            {
                builder.AppendLine($"  현재: {ClampTelegramInline(issue.CurrentSnippet, 140)}");
            }
        }

        return builder.ToString().Trim();
    }

    private bool TryParseTelegramRefactorPreviewCommand(
        string text,
        out string path,
        out int startLine,
        out int endLine,
        out string replacement,
        out string error
    )
    {
        path = string.Empty;
        startLine = 0;
        endLine = 0;
        replacement = string.Empty;
        error = "사용법: /refactor preview <path> <start> <end> 다음 줄부터 교체 코드";

        var snapshot = GetTelegramRefactorSession();
        var normalized = (text ?? string.Empty).Replace("\r\n", "\n").Trim();
        var payload = ExtractCommandTail(normalized, "/refactor preview");
        if (string.IsNullOrWhiteSpace(payload))
        {
            return false;
        }

        var newlineIndex = payload.IndexOf('\n');
        string header;
        if (newlineIndex >= 0)
        {
            header = payload[..newlineIndex].Trim();
            replacement = payload[(newlineIndex + 1)..].Trim();
        }
        else
        {
            var separatorIndex = payload.IndexOf(":::", StringComparison.Ordinal);
            if (separatorIndex < 0)
            {
                error = "교체 코드는 줄바꿈 다음 줄에 붙여 넣거나 `:::` 뒤에 써 주세요.";
                return false;
            }

            header = payload[..separatorIndex].Trim();
            replacement = payload[(separatorIndex + 3)..].Trim();
        }

        if (string.IsNullOrWhiteSpace(replacement))
        {
            error = "교체 코드가 비어 있습니다.";
            return false;
        }

        var tokens = header.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (tokens.Length == 3
            && int.TryParse(tokens[1], out startLine)
            && int.TryParse(tokens[2], out endLine))
        {
            path = tokens[0];
        }
        else if (tokens.Length == 2
                 && int.TryParse(tokens[0], out startLine)
                 && int.TryParse(tokens[1], out endLine)
                 && !string.IsNullOrWhiteSpace(snapshot.Path))
        {
            path = snapshot.Path;
        }
        else
        {
            error = string.IsNullOrWhiteSpace(snapshot.Path)
                ? "사용법: /refactor preview <path> <start> <end> 다음 줄부터 교체 코드"
                : $"사용법: /refactor preview <path> <start> <end> 또는 /refactor preview <start> <end> (현재 파일: {snapshot.Path})";
            return false;
        }

        startLine = Math.Max(1, startLine);
        endLine = Math.Max(startLine, endLine);
        return !string.IsNullOrWhiteSpace(path);
    }

    private void UpdateTelegramRefactorSession(string? path, string? previewId, string? message)
    {
        lock (_telegramRefactorLock)
        {
            if (path != null)
            {
                _telegramRefactorSession.Path = path.Trim();
            }

            if (previewId != null)
            {
                _telegramRefactorSession.PreviewId = previewId.Trim();
            }

            _telegramRefactorSession.LastMessage = (message ?? string.Empty).Trim();
            _telegramRefactorSession.UpdatedAtLocal = DateTimeOffset.Now.ToString("yyyy-MM-dd HH:mm:ss");
        }
    }

    private TelegramRefactorSession GetTelegramRefactorSession()
    {
        lock (_telegramRefactorLock)
        {
            return _telegramRefactorSession.Clone();
        }
    }
}
