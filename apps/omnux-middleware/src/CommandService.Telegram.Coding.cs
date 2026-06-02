using System.Text;
using System.Text.RegularExpressions;

namespace Omnux.Middleware;

public sealed partial class CommandService
{
    private async Task<string?> TryHandleTelegramCodingCommandAsync(
        string text,
        IReadOnlyList<InputAttachment>? attachments,
        IReadOnlyList<string>? webUrls,
        bool webSearchEnabled,
        CancellationToken cancellationToken
    )
    {
        if (!text.StartsWith("/coding", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        var normalized = (text ?? string.Empty).Trim();
        var tokens = normalized.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (tokens.Length == 1 || tokens[1].Equals("help", StringComparison.OrdinalIgnoreCase))
        {
            return BuildTelegramHelpText("coding");
        }

        if (tokens[1].Equals("status", StringComparison.OrdinalIgnoreCase))
        {
            return BuildTelegramCodingStatusText();
        }

        if (tokens[1].Equals("last", StringComparison.OrdinalIgnoreCase)
            || tokens[1].Equals("result", StringComparison.OrdinalIgnoreCase))
        {
            return BuildTelegramLatestCodingResultText();
        }

        if (tokens[1].Equals("files", StringComparison.OrdinalIgnoreCase))
        {
            return BuildTelegramLatestCodingFilesText();
        }

        if (tokens[1].Equals("file", StringComparison.OrdinalIgnoreCase))
        {
            var query = ExtractCommandTail(normalized, "/coding file");
            return BuildTelegramLatestCodingFilePreviewText(query);
        }

        if (tokens[1].Equals("download", StringComparison.OrdinalIgnoreCase)
            || tokens[1].Equals("dl", StringComparison.OrdinalIgnoreCase)
            || tokens[1].Equals("save", StringComparison.OrdinalIgnoreCase))
        {
            var query = ExtractCommandTail(normalized, $"/coding {tokens[1]}");
            return await TrySendTelegramLatestCodingFileAsDocumentAsync(query, cancellationToken);
        }

        if (tokens[1].Equals("mode", StringComparison.OrdinalIgnoreCase))
        {
            if (tokens.Length < 3)
            {
                return "사용법: /coding mode <single|orchestration|multi>";
            }

            return SetTelegramCodingMode(tokens[2]);
        }

        if (tokens[1].Equals("language", StringComparison.OrdinalIgnoreCase))
        {
            if (tokens.Length < 3)
            {
                return "사용법: /coding language [single|orchestration|multi] <language|auto>";
            }

            if (tokens.Length >= 4 && IsCodingModeKey(tokens[2]))
            {
                return SetTelegramCodingLanguage(tokens[2], tokens[3]);
            }

            return SetTelegramCodingLanguage(null, tokens[2]);
        }

        if (tokens[1].Equals("run", StringComparison.OrdinalIgnoreCase))
        {
            var requestText = ExtractCommandTail(normalized, "/coding run");
            return await ExecuteTelegramCodingRunAsync(
                modeOverride: null,
                requestText,
                attachments,
                webUrls,
                webSearchEnabled,
                cancellationToken
            );
        }

        if (tokens[1].Equals("single", StringComparison.OrdinalIgnoreCase))
        {
            if (tokens.Length < 3)
            {
                return "사용법: /coding single <provider|model|run> ...";
            }

            if (tokens[2].Equals("provider", StringComparison.OrdinalIgnoreCase))
            {
                if (tokens.Length < 4)
                {
                    return "사용법: /coding single provider <auto|groq|gemini|copilot|cerebras|nvidia|codex>";
                }

                return SetTelegramCodingAggregateProvider("single", tokens[3]);
            }

            if (tokens[2].Equals("model", StringComparison.OrdinalIgnoreCase))
            {
                var modelId = string.Join(' ', tokens.Skip(3)).Trim();
                if (string.IsNullOrWhiteSpace(modelId))
                {
                    return "사용법: /coding single model <model-id>";
                }

                return SetTelegramCodingAggregateModel("single", modelId);
            }

            if (tokens[2].Equals("run", StringComparison.OrdinalIgnoreCase))
            {
                var requestText = ExtractCommandTail(normalized, "/coding single run");
                return await ExecuteTelegramCodingRunAsync(
                    modeOverride: "single",
                    requestText,
                    attachments,
                    webUrls,
                    webSearchEnabled,
                    cancellationToken
                );
            }

            return "사용법: /coding single <provider|model|run> ...";
        }

        if (tokens[1].Equals("orchestration", StringComparison.OrdinalIgnoreCase))
        {
            if (tokens.Length < 3)
            {
                return "사용법: /coding orchestration <provider|model|worker|run> ...";
            }

            if (tokens[2].Equals("provider", StringComparison.OrdinalIgnoreCase))
            {
                if (tokens.Length < 4)
                {
                    return "사용법: /coding orchestration provider <auto|groq|gemini|copilot|cerebras|nvidia|codex>";
                }

                return SetTelegramCodingAggregateProvider("orchestration", tokens[3]);
            }

            if (tokens[2].Equals("model", StringComparison.OrdinalIgnoreCase))
            {
                var modelId = string.Join(' ', tokens.Skip(3)).Trim();
                if (string.IsNullOrWhiteSpace(modelId))
                {
                    return "사용법: /coding orchestration model <model-id>";
                }

                return SetTelegramCodingAggregateModel("orchestration", modelId);
            }

            if (tokens[2].Equals("worker", StringComparison.OrdinalIgnoreCase))
            {
                if (tokens.Length < 5)
                {
                    return "사용법: /coding orchestration worker <groq|gemini|copilot|cerebras|nvidia|codex> <model-id|none>";
                }

                return SetTelegramCodingWorkerModel("orchestration", tokens[3], string.Join(' ', tokens.Skip(4)).Trim());
            }

            if (tokens[2].Equals("run", StringComparison.OrdinalIgnoreCase))
            {
                var requestText = ExtractCommandTail(normalized, "/coding orchestration run");
                return await ExecuteTelegramCodingRunAsync(
                    modeOverride: "orchestration",
                    requestText,
                    attachments,
                    webUrls,
                    webSearchEnabled,
                    cancellationToken
                );
            }

            return "사용법: /coding orchestration <provider|model|worker|run> ...";
        }

        if (tokens[1].Equals("multi", StringComparison.OrdinalIgnoreCase))
        {
            if (tokens.Length < 3)
            {
                return "사용법: /coding multi <provider|model|worker|run> ...";
            }

            if (tokens[2].Equals("provider", StringComparison.OrdinalIgnoreCase)
                || tokens[2].Equals("summary", StringComparison.OrdinalIgnoreCase))
            {
                if (tokens.Length < 4)
                {
                    return "사용법: /coding multi provider <auto|groq|gemini|copilot|cerebras|nvidia|codex>";
                }

                return SetTelegramCodingAggregateProvider("multi", tokens[3]);
            }

            if (tokens[2].Equals("model", StringComparison.OrdinalIgnoreCase))
            {
                var modelId = string.Join(' ', tokens.Skip(3)).Trim();
                if (string.IsNullOrWhiteSpace(modelId))
                {
                    return "사용법: /coding multi model <model-id>";
                }

                return SetTelegramCodingAggregateModel("multi", modelId);
            }

            if (tokens[2].Equals("worker", StringComparison.OrdinalIgnoreCase))
            {
                if (tokens.Length < 5)
                {
                    return "사용법: /coding multi worker <groq|gemini|copilot|cerebras|codex> <model-id|none>";
                }

                return SetTelegramCodingWorkerModel("multi", tokens[3], string.Join(' ', tokens.Skip(4)).Trim());
            }

            if (tokens[2].Equals("run", StringComparison.OrdinalIgnoreCase))
            {
                var requestText = ExtractCommandTail(normalized, "/coding multi run");
                return await ExecuteTelegramCodingRunAsync(
                    modeOverride: "multi",
                    requestText,
                    attachments,
                    webUrls,
                    webSearchEnabled,
                    cancellationToken
                );
            }

            return "사용법: /coding multi <provider|model|worker|run> ...";
        }

        return BuildTelegramHelpText("coding");
    }

    private async Task<string> ExecuteTelegramCodingRunAsync(
        string? modeOverride,
        string requestText,
        IReadOnlyList<InputAttachment>? attachments,
        IReadOnlyList<string>? webUrls,
        bool webSearchEnabled,
        CancellationToken cancellationToken
    )
    {
        var snapshot = GetTelegramCodingPreferences();
        var mode = string.IsNullOrWhiteSpace(modeOverride) ? snapshot.Mode : modeOverride.Trim().ToLowerInvariant();
        if (!IsCodingModeKey(mode))
        {
            return "지원 코딩 모드는 single, orchestration, multi 입니다.";
        }

        var normalizedAttachments = InputAttachmentPolicy.Normalize(attachments);
        var input = (requestText ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(input))
        {
            input = mode == "orchestration"
                ? (normalizedAttachments.Count > 0 ? "첨부 파일을 반영해 코딩해줘" : string.Empty)
                : (normalizedAttachments.Count > 0 ? "첨부 파일을 반영해 코딩해줘" : string.Empty);
        }

        if (mode != "orchestration" && string.IsNullOrWhiteSpace(input))
        {
            return "코딩 요구사항을 입력하세요. 예: /coding single run 로그인 페이지와 API 연결까지 만들어줘";
        }

        var conversation = EnsureTelegramLinkedCodingConversation(mode);
        var resolvedWebUrls = ResolveWebUrls(input, webUrls, webSearchEnabled);
        var telegramStateKey = ResolveTelegramStateKey();
        var telegramActiveSkillName = !string.IsNullOrWhiteSpace(telegramStateKey)
                                      && _activeSkillByThread.TryGetValue(telegramStateKey, out var activeSkillName)
                                      && !string.IsNullOrWhiteSpace(activeSkillName)
            ? activeSkillName
            : null;

        if (mode == "single")
        {
            var result = await RunCodingSingleAsync(
                new CodingRunRequest(
                    input,
                    "telegram",
                    "coding",
                    "single",
                    conversation.Id,
                    conversation.Title,
                    "Telegram",
                    "코딩",
                    new[] { "telegram-coding-link", "shared", "telegram" },
                    snapshot.SingleProvider,
                    snapshot.SingleModel,
                    snapshot.SingleLanguage,
                    conversation.LinkedMemoryNotes,
                    Attachments: normalizedAttachments,
                    WebUrls: resolvedWebUrls,
                    WebSearchEnabled: webSearchEnabled,
                    SkillName: telegramActiveSkillName
                ),
                cancellationToken
            );
            return BuildTelegramCodingRunText(result, "코딩 실행 완료");
        }

        if (mode == "orchestration")
        {
            var result = await RunCodingOrchestrationAsync(
                new CodingRunRequest(
                    input,
                    "telegram",
                    "coding",
                    "orchestration",
                    conversation.Id,
                    conversation.Title,
                    "Telegram",
                    "코딩",
                    new[] { "telegram-coding-link", "shared", "telegram" },
                    snapshot.OrchestrationProvider,
                    snapshot.OrchestrationModel,
                    snapshot.OrchestrationLanguage,
                    conversation.LinkedMemoryNotes,
                    snapshot.OrchestrationGroqModel,
                    snapshot.OrchestrationGeminiModel,
                    snapshot.OrchestrationCerebrasModel,
                    snapshot.OrchestrationCopilotModel,
                    normalizedAttachments,
                    resolvedWebUrls,
                    webSearchEnabled,
                    snapshot.OrchestrationCodexModel,
                    NvidiaModel: snapshot.OrchestrationNvidiaModel,
                    SkillName: telegramActiveSkillName
                ),
                cancellationToken
            );
            return BuildTelegramCodingRunText(result, "코딩 실행 완료");
        }

        var multiResult = await RunCodingMultiAsync(
            new CodingRunRequest(
                input,
                "telegram",
                "coding",
                "multi",
                conversation.Id,
                conversation.Title,
                "Telegram",
                "코딩",
                new[] { "telegram-coding-link", "shared", "telegram" },
                snapshot.MultiProvider,
                snapshot.MultiModel,
                snapshot.MultiLanguage,
                conversation.LinkedMemoryNotes,
                snapshot.MultiGroqModel,
                snapshot.MultiGeminiModel,
                snapshot.MultiCerebrasModel,
                snapshot.MultiCopilotModel,
                normalizedAttachments,
                resolvedWebUrls,
                webSearchEnabled,
                snapshot.MultiCodexModel,
                NvidiaModel: snapshot.MultiNvidiaModel,
                SkillName: telegramActiveSkillName
            ),
            cancellationToken
        );
        return BuildTelegramCodingRunText(multiResult, "코딩 실행 완료");
    }

    private string BuildTelegramCodingStatusText()
    {
        var snapshot = GetTelegramCodingPreferences();
        var latest = GetLatestTelegramCodingConversation();
        var builder = new StringBuilder();
        builder.AppendLine("[텔레그램 코딩 설정]");
        builder.AppendLine($"현재 모드: {FormatModeDisplayName(snapshot.Mode)} 코딩");
        builder.AppendLine($"단일: {FormatProviderWithModel(snapshot.SingleProvider, snapshot.SingleModel, allowAuto: true)} / 언어={snapshot.SingleLanguage}");
        builder.AppendLine($"오케스트레이션 주 구현: {FormatProviderWithModel(snapshot.OrchestrationProvider, snapshot.OrchestrationModel, allowAuto: true)} / 언어={snapshot.OrchestrationLanguage}");
        builder.AppendLine($"오케스트레이션 워커: Groq={FormatCodingWorkerModel(snapshot.OrchestrationGroqModel)}, Gemini={FormatCodingWorkerModel(snapshot.OrchestrationGeminiModel)}, Cerebras={FormatCodingWorkerModel(snapshot.OrchestrationCerebrasModel)}, NVIDIA NIM={FormatCodingWorkerModel(snapshot.OrchestrationNvidiaModel)}, Copilot={FormatCodingWorkerModel(snapshot.OrchestrationCopilotModel)}, Codex={FormatCodingWorkerModel(snapshot.OrchestrationCodexModel)}");
        builder.AppendLine($"다중 요약: {FormatProviderWithModel(snapshot.MultiProvider, snapshot.MultiModel, allowAuto: true)} / 언어={snapshot.MultiLanguage}");
        builder.AppendLine($"다중 워커: Groq={FormatCodingWorkerModel(snapshot.MultiGroqModel)}, Gemini={FormatCodingWorkerModel(snapshot.MultiGeminiModel)}, Cerebras={FormatCodingWorkerModel(snapshot.MultiCerebrasModel)}, NVIDIA NIM={FormatCodingWorkerModel(snapshot.MultiNvidiaModel)}, Copilot={FormatCodingWorkerModel(snapshot.MultiCopilotModel)}, Codex={FormatCodingWorkerModel(snapshot.MultiCodexModel)}");
        builder.AppendLine();
        if (latest?.LatestCodingResult != null)
        {
            builder.AppendLine("[최근 결과 요약]");
            builder.AppendLine($"대화: {latest.Title}");
            builder.AppendLine($"모드: {FormatModeDisplayName(latest.LatestCodingResult.Mode)} 코딩");
            builder.AppendLine($"상태: {latest.LatestCodingResult.Execution.Status} (exit={latest.LatestCodingResult.Execution.ExitCode})");
            builder.AppendLine($"변경 파일: {latest.LatestCodingResult.ChangedFiles.Count}개");
            builder.AppendLine($"열기: /coding last");
        }
        else
        {
            builder.AppendLine("[최근 결과 요약]");
            builder.AppendLine("아직 텔레그램 코딩 실행 이력이 없습니다.");
        }

        return builder.ToString().Trim();
    }

    private string BuildTelegramLatestCodingResultText()
    {
        var latest = GetLatestTelegramCodingConversation();
        if (latest?.LatestCodingResult == null)
        {
            return "최근 텔레그램 코딩 결과가 없습니다. 먼저 `/coding run <요구사항>` 또는 `단일/오케스트레이션/다중 코딩으로 ...` 를 실행하세요.";
        }

        return BuildTelegramCodingResultText(latest, latest.LatestCodingResult, "최근 코딩 결과");
    }

    private string BuildTelegramLatestCodingFilesText()
    {
        var latest = GetLatestTelegramCodingConversation();
        var result = latest?.LatestCodingResult;
        if (latest == null || result == null)
        {
            return "최근 텔레그램 코딩 결과가 없습니다.";
        }

        if (result.ChangedFiles.Count == 0)
        {
            return "최근 코딩 결과에 변경 파일이 없습니다.";
        }

        var builder = new StringBuilder();
        builder.AppendLine("[최근 코딩 파일]");
        builder.AppendLine($"대화: {latest.Title}");
        for (var i = 0; i < result.ChangedFiles.Count; i += 1)
        {
            builder.AppendLine($"{i + 1}. {ToTelegramRelativePath(result.Execution.RunDirectory, result.ChangedFiles[i])}");
        }

        builder.AppendLine();
        builder.AppendLine("프리뷰: /coding file <번호>");
        builder.AppendLine("다운로드: /coding download <번호>");

        // 최대 3개 파일에 대해 1번 다운로드 버튼 자동 부착.
        var fileCount = Math.Min(result.ChangedFiles.Count, 3);
        var buttons = new (string, string)[fileCount];
        for (var i = 0; i < fileCount; i += 1)
        {
            buttons[i] = ($"/coding download {i + 1}", $"⬇️ {i + 1}");
        }
        return AppendTelegramInlineButtons(builder.ToString().Trim(), buttons);
    }

    // 텔레그램에서 마지막 코딩 결과의 파일을 .txt 파일로 첨부 전송. query는 번호 또는 경로.
    // 성공 시 빈 문자열, 실패 시 사용자에게 보일 메시지 반환.
    private async Task<string> TrySendTelegramLatestCodingFileAsDocumentAsync(
        string query,
        CancellationToken cancellationToken
    )
    {
        var latest = GetLatestTelegramCodingConversation();
        var result = latest?.LatestCodingResult;
        if (latest == null || result == null)
        {
            return "최근 텔레그램 코딩 결과가 없습니다.";
        }

        if (string.IsNullOrWhiteSpace(query))
        {
            return AppendTelegramInlineButtons(
                "사용법: /coding download <번호|경로>\n먼저 `/coding files` 로 번호를 확인하세요.",
                ("/coding files", "📋 파일 목록")
            );
        }

        if (!TryResolveTelegramCodingFilePath(result, query, out var path, out var displayPath))
        {
            return $"파일을 찾지 못했습니다: {query}\n먼저 `/coding files` 로 번호나 경로를 확인하세요.";
        }

        if (!File.Exists(path))
        {
            return $"파일이 디스크에 없습니다: {displayPath}";
        }

        try
        {
            var bytes = await File.ReadAllBytesAsync(path, cancellationToken);
            // 텔레그램 sendDocument는 더 크지만 모바일 UX와 로컬 비용을 위해 8MB로 제한한다.
            if (!TelegramCodingDownloadPolicy.IsAllowedDocumentSize(bytes.Length))
            {
                return $"파일이 너무 큽니다 ({bytes.Length / 1024}KB > 8MB). 대시보드에서 확인하세요.";
            }

            var safeName = TelegramCodingDownloadPolicy.BuildSafeDocumentName(displayPath, DateTimeOffset.UtcNow);
            var caption = $"📎 {displayPath}\n대화: {latest.Title}\n크기: {bytes.Length:N0} bytes";
            var ok = await _telegramClient.SendDocumentAsync(bytes, safeName, caption, cancellationToken);
            if (ok)
            {
                _auditLogger.Log("telegram", "coding_download", "ok", $"path={displayPath} bytes={bytes.Length}");
                return string.Empty;
            }
            _auditLogger.Log("telegram", "coding_download", "failed", $"path={displayPath}");
            return $"첨부 전송 실패: {displayPath}\n잠시 후 다시 시도해 주세요.";
        }
        catch (Exception ex)
        {
            _auditLogger.Log("telegram", "coding_download", "error", ex.Message);
            return $"파일 전송 오류: {ex.Message}";
        }
    }

    private string BuildTelegramLatestCodingFilePreviewText(string query)
    {
        var latest = GetLatestTelegramCodingConversation();
        var result = latest?.LatestCodingResult;
        if (latest == null || result == null)
        {
            return "최근 텔레그램 코딩 결과가 없습니다.";
        }

        if (!TryResolveTelegramCodingFilePath(result, query, out var path, out var displayPath))
        {
            return "파일을 찾지 못했습니다. 먼저 `/coding files` 로 번호나 경로를 확인하세요.";
        }

        if (!File.Exists(path))
        {
            return $"파일을 찾을 수 없습니다: {displayPath}";
        }

        var content = File.ReadAllText(path);
        if (TelegramCommandHandoffPolicy.ShouldUseCommandHandoff(content))
        {
            var downloadAction = string.IsNullOrWhiteSpace(query)
                ? "/coding download <번호|경로>"
                : $"/coding download {query.Trim()}";
            return TelegramCommandHandoffPolicy.BuildCommandHandoffText(
                "코딩 파일 프리뷰",
                displayPath,
                content,
                new[]
                {
                    downloadAction,
                    "/coding files",
                    "/handoff"
                }
            );
        }

        var preview = TrimTelegramCodePreview(content, 2600);
        return $"""
                [코딩 파일 프리뷰]
                대화: {latest.Title}
                파일: {displayPath}

                {preview}
                """;
    }

    private string BuildTelegramCodingRunText(CodingRunResult result, string heading)
    {
        var snapshot = BuildConversationCodingResultSnapshot(result);
        return BuildTelegramCodingResultText(result.Conversation, snapshot, heading);
    }

    private string? TryBuildLatestTelegramCodingNotebookAppend()
    {
        var latest = GetLatestTelegramCodingConversation();
        var result = latest?.LatestCodingResult;
        if (latest == null || result == null)
        {
            return null;
        }

        var snapshot = result;
        var lines = new List<string>
        {
            "텔레그램 코딩 결과에서 저장한 검증 기록",
            "",
            $"대화: {latest.Title}",
            $"모드: {FormatModeDisplayName(snapshot.Mode)}",
            $"모델: {FormatProviderWithModel(snapshot.Provider, snapshot.Model, allowAuto: true)}",
            $"언어: {snapshot.Language}",
            $"작업 폴더: {snapshot.Execution.RunDirectory}",
            $"상태: {snapshot.Execution.Status} (exit={snapshot.Execution.ExitCode})",
            $"실행 명령: {TrimForOutput(snapshot.Execution.Command, 180)}",
            "",
            $"변경 파일: {snapshot.ChangedFiles.Count}개"
        };
        lines.AddRange(snapshot.ChangedFiles.Take(12).Select(path => $"- {ToTelegramRelativePath(snapshot.Execution.RunDirectory, path)}"));
        if (!string.IsNullOrWhiteSpace(snapshot.Summary))
        {
            lines.Add("");
            lines.Add("요약:");
            lines.Add(TrimForOutput(snapshot.Summary, 1600));
        }

        return "/notebook append verification " + string.Join("\n", lines).Trim();
    }

    private string? TryBuildLatestTelegramCodingPlanCreate()
    {
        var latest = GetLatestTelegramCodingConversation();
        var result = latest?.LatestCodingResult;
        if (latest == null || result == null)
        {
            return null;
        }

        var snapshot = result;
        var lines = new List<string>
        {
            "최근 텔레그램 코딩 결과를 이어서 완성하기 위한 작업계획 작성",
            "",
            $"대화: {latest.Title}",
            $"모드: {FormatModeDisplayName(snapshot.Mode)}",
            $"모델: {FormatProviderWithModel(snapshot.Provider, snapshot.Model, allowAuto: true)}",
            $"언어: {snapshot.Language}",
            $"작업 폴더: {snapshot.Execution.RunDirectory}",
            $"상태: {snapshot.Execution.Status} (exit={snapshot.Execution.ExitCode})",
            $"실행 명령: {TrimForOutput(snapshot.Execution.Command, 180)}",
            "",
            $"변경 파일: {snapshot.ChangedFiles.Count}개"
        };
        lines.AddRange(snapshot.ChangedFiles.Take(12).Select(path => $"- {ToTelegramRelativePath(snapshot.Execution.RunDirectory, path)}"));
        if (!string.IsNullOrWhiteSpace(snapshot.Summary))
        {
            lines.Add("");
            lines.Add("요약:");
            lines.Add(TrimForOutput(snapshot.Summary, 2000));
        }

        return "/plan create --constraint 현재 산출물을 무시하고 새로 시작하지 않기 --constraint 실패 로그와 미검증 항목을 먼저 해소하기 " + string.Join("\n", lines).Trim();
    }

    private string BuildTelegramCodingResultText(
        ConversationThreadView conversation,
        ConversationCodingResultSnapshot result,
        string heading
    )
    {
        if (TelegramCodingHandoffPolicy.ShouldUseMobileHandoff(result))
        {
            return FormatTelegramResponse(
                TelegramCodingHandoffPolicy.BuildMobileHandoffText(
                    conversation,
                    result,
                    heading,
                    FormatProviderWithModel,
                    FormatModeDisplayName,
                    ToTelegramRelativePath
                ),
                TelegramMaxResponseChars
            );
        }

        var builder = new StringBuilder();
        builder.AppendLine($"[{heading}]");
        builder.AppendLine($"대화: {conversation.Title}");
        builder.AppendLine($"모드: {FormatModeDisplayName(result.Mode)} 코딩");
        builder.AppendLine($"모델: {FormatProviderWithModel(result.Provider, result.Model, allowAuto: true)}");
        builder.AppendLine($"언어: {result.Language}");
        builder.AppendLine($"작업 폴더: {result.Execution.RunDirectory}");
        builder.AppendLine($"상태: {result.Execution.Status} (exit={result.Execution.ExitCode})");
        if (!string.IsNullOrWhiteSpace(result.Execution.Command)
            && result.Execution.Command != "(none)"
            && result.Execution.Command != "-")
        {
            builder.AppendLine($"실행 명령: {TrimForOutput(result.Execution.Command, 200)}");
        }

        builder.AppendLine($"변경 파일: {result.ChangedFiles.Count}개");
        foreach (var path in result.ChangedFiles.Take(8))
        {
            builder.AppendLine($"- {ToTelegramRelativePath(result.Execution.RunDirectory, path)}");
        }

        if (result.ChangedFiles.Count > 8)
        {
            builder.AppendLine($"- ...(추가 {result.ChangedFiles.Count - 8}개)");
        }

        var summaryText = TrimForOutput(ChatOutputSanitizerPolicy.RemoveCodeBlocksFromText(result.Summary), 1400);
        if (!string.IsNullOrWhiteSpace(summaryText))
        {
            builder.AppendLine();
            builder.AppendLine("요약:");
            builder.AppendLine(summaryText);
        }

        if (result.Mode == "multi")
        {
            AppendTelegramCodingMultiSections(builder, result);
        }
        else if (result.Workers.Count > 0)
        {
            builder.AppendLine();
            builder.AppendLine("단계별 결과:");
            foreach (var worker in result.Workers)
            {
                builder.AppendLine(BuildTelegramCodingWorkerSnapshotDigest(worker));
            }
        }

        return FormatTelegramResponse(builder.ToString().Trim(), TelegramMaxResponseChars);
    }

    private void AppendTelegramCodingMultiSections(StringBuilder builder, ConversationCodingResultSnapshot result)
    {
        if (!string.IsNullOrWhiteSpace(result.CommonSummary))
        {
            builder.AppendLine();
            builder.AppendLine("공통 요약:");
            builder.AppendLine(TrimForOutput(ChatOutputSanitizerPolicy.RemoveCodeBlocksFromText(result.CommonSummary), 700));
        }

        if (!string.IsNullOrWhiteSpace(result.CommonPoints))
        {
            builder.AppendLine();
            builder.AppendLine("공통점:");
            builder.AppendLine(TrimForOutput(ChatOutputSanitizerPolicy.RemoveCodeBlocksFromText(result.CommonPoints), 500));
        }

        if (!string.IsNullOrWhiteSpace(result.Differences))
        {
            builder.AppendLine();
            builder.AppendLine("차이:");
            builder.AppendLine(TrimForOutput(ChatOutputSanitizerPolicy.RemoveCodeBlocksFromText(result.Differences), 500));
        }

        if (!string.IsNullOrWhiteSpace(result.Recommendation))
        {
            builder.AppendLine();
            builder.AppendLine("추천:");
            builder.AppendLine(TrimForOutput(ChatOutputSanitizerPolicy.RemoveCodeBlocksFromText(result.Recommendation), 400));
        }

        if (result.Workers.Count > 0)
        {
            builder.AppendLine();
            builder.AppendLine("모델별 결과:");
            for (var i = 0; i < result.Workers.Count; i += 1)
            {
                builder.AppendLine($"{i + 1}. {BuildTelegramCodingWorkerSnapshotDigest(result.Workers[i])}");
            }
        }
    }

    private static string BuildTelegramCodingWorkerSnapshotDigest(CodingWorkerResultSnapshot worker)
    {
        var changedFiles = worker.ChangedFiles.Take(4).Select(path => Path.GetFileName(path)).ToArray();
        var filesText = changedFiles.Length == 0 ? "파일 없음" : string.Join(", ", changedFiles);
        var summary = TrimForOutput(ChatOutputSanitizerPolicy.RemoveCodeBlocksFromText(worker.Summary), 220);
        var summaryText = string.IsNullOrWhiteSpace(summary) ? "요약 없음" : summary;
        var role = string.IsNullOrWhiteSpace(worker.Role) ? "독립 완주" : worker.Role;
        return $"{FormatProviderDisplayName(worker.Provider)} ({worker.Model}) · 역할={role} · status={worker.Execution.Status} · exit={worker.Execution.ExitCode} · 파일={filesText} · 요약={summaryText}";
    }

    private ConversationThreadView EnsureTelegramLinkedCodingConversation(string mode)
    {
        var normalizedMode = IsCodingModeKey(mode) ? mode.Trim().ToLowerInvariant() : "single";
        var existing = _conversationStore
            .List("coding", normalizedMode)
            .FirstOrDefault(item => item.Tags.Any(tag =>
                string.Equals(tag, "telegram-coding-link", StringComparison.OrdinalIgnoreCase)));
        if (existing != null)
        {
            return _conversationStore.Get(existing.Id)
                   ?? _conversationStore.Ensure("coding", normalizedMode, existing.Id, null, null, null, null);
        }

        return _conversationStore.Create(
            "coding",
            normalizedMode,
            $"Telegram 코딩 ({FormatModeDisplayName(normalizedMode)})",
            "Telegram",
            "코딩",
            new[] { "telegram-coding-link", "shared", "telegram" }
        );
    }

    private ConversationThreadView? GetLatestTelegramCodingConversation()
    {
        var latest = _conversationStore
            .ListAll()
            .Where(item => item.Scope.Equals("coding", StringComparison.OrdinalIgnoreCase)
                && item.Tags.Any(tag => string.Equals(tag, "telegram-coding-link", StringComparison.OrdinalIgnoreCase)))
            .OrderByDescending(item => item.UpdatedUtc)
            .FirstOrDefault();
        return latest == null ? null : _conversationStore.Get(latest.Id);
    }

    private static string ToTelegramRelativePath(string? runDirectory, string path)
        => TelegramCodingDownloadPolicy.ToRelativePath(runDirectory, path);

    private static string ExtractCommandTail(string text, string prefix)
    {
        var normalizedText = (text ?? string.Empty).Trim();
        var normalizedPrefix = (prefix ?? string.Empty).Trim();
        if (!normalizedText.StartsWith(normalizedPrefix, StringComparison.OrdinalIgnoreCase))
        {
            return string.Empty;
        }

        return normalizedText[normalizedPrefix.Length..].TrimStart();
    }

    private static string ClipHash(string hash)
    {
        var normalized = (hash ?? string.Empty).Trim();
        return normalized.Length <= 10 ? normalized : normalized[..10];
    }

    private static string ClampTelegramInline(string text, int maxLength)
    {
        var normalized = Regex.Replace((text ?? string.Empty).Trim(), @"\s+", " ");
        if (normalized.Length <= maxLength)
        {
            return normalized;
        }

        return normalized[..Math.Max(0, maxLength - 3)] + "...";
    }

    private static string TrimTelegramCodePreview(string content, int maxLength)
    {
        var normalized = (content ?? string.Empty).Replace("\r\n", "\n").Trim();
        if (normalized.Length <= maxLength)
        {
            return normalized;
        }

        return normalized[..Math.Max(0, maxLength - 18)] + "\n...(이하 생략)";
    }

    private static bool TryResolveTelegramCodingFilePath(
        ConversationCodingResultSnapshot result,
        string query,
        out string path,
        out string displayPath
    )
        => TelegramCodingDownloadPolicy.TryResolveChangedFile(result, query, out path, out displayPath);
}
