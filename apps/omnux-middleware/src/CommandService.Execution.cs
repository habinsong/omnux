namespace Omnux.Middleware;

public sealed partial class CommandService
{
    public Task<string> ExecuteAsync(
        string input,
        string source,
        CancellationToken cancellationToken,
        IReadOnlyList<InputAttachment>? attachments = null,
        IReadOnlyList<string>? webUrls = null,
        bool webSearchEnabled = true,
        Action<string>? streamCallback = null,
        TelegramTurnContext? telegramContext = null
    )
    {
        return ExecuteCoreAsync(input, source, cancellationToken, attachments, webUrls, webSearchEnabled, streamCallback, telegramContext);
    }

    private async Task<string> ExecuteCoreAsync(
        string input,
        string source,
        CancellationToken cancellationToken,
        IReadOnlyList<InputAttachment>? attachments = null,
        IReadOnlyList<string>? webUrls = null,
        bool webSearchEnabled = true,
        Action<string>? streamCallback = null,
        TelegramTurnContext? telegramContext = null
    )
    {
        var previousTelegramContext = _executionContext.CurrentTelegramTurn;
        if (source.Equals("telegram", StringComparison.OrdinalIgnoreCase) && telegramContext != null)
        {
            _executionContext.CurrentTelegramTurn = telegramContext;
        }

        var normalizedAttachments = InputAttachmentPolicy.Normalize(attachments);
        var text = (input ?? string.Empty).Trim();
        try
        {
            if (source.Equals("telegram", StringComparison.OrdinalIgnoreCase)
                && InputAttachmentPolicy.TryGetAudioAttachment(normalizedAttachments, out var audioAttachment)
                && (string.IsNullOrWhiteSpace(text) || text.Equals("첨부 파일을 분석해줘", StringComparison.OrdinalIgnoreCase)))
            {
                var transcribed = await _llmRouter.TranscribeAudioAsync(audioAttachment, cancellationToken);
                if (transcribed.StartsWith("음성 변환 설정 필요", StringComparison.OrdinalIgnoreCase)
                    || transcribed.StartsWith("음성 변환 실패", StringComparison.OrdinalIgnoreCase)
                    || transcribed.StartsWith("음성 변환 오류", StringComparison.OrdinalIgnoreCase)
                    || transcribed.StartsWith("음성 변환 시간이 초과", StringComparison.OrdinalIgnoreCase))
                {
                    return transcribed;
                }

                text = transcribed.Trim();

                // 사용자가 자기 음성이 어떻게 들렸는지 즉시 확인할 수 있게 transcript를 별도 메시지로 echo.
                // 잘못 들렸을 때 다시 말하도록 유도한다. 메시지 전송 실패는 무시.
                try
                {
                    var preview = text.Length > 360 ? text[..360] + "…" : text;
                    await _telegramClient.SendMessageAsync(
                        $"🎙️ 들은 내용:\n\"{preview}\"\n(분석을 시작합니다.)",
                        cancellationToken
                    );
                }
                catch
                {
                }
            }

            if (string.IsNullOrWhiteSpace(text))
            {
                if (normalizedAttachments.Count > 0 && source.Equals("telegram", StringComparison.OrdinalIgnoreCase))
                {
                    text = "첨부 파일을 분석해줘";
                }
                else
                {
                    return "empty command";
                }
            }

            if (text.Length > _context.CommandMaxLength)
            {
                return $"command too long (max={_context.CommandMaxLength})";
            }

            if (source.Equals("telegram", StringComparison.OrdinalIgnoreCase))
            {
                SetCurrentTelegramExecutionMetadata();
            }
            attachments = normalizedAttachments;

            return await ExecuteNormalizedCommandRoutingAsync(
                text,
                source,
                cancellationToken,
                attachments,
                webUrls,
                webSearchEnabled,
                streamCallback
            );
        }
        catch (Exception ex)
        {
            _auditLogger.Log(source, "command_error", "fail", ex.Message);
            return $"error: {ex.Message}";
        }
        finally
        {
            _executionContext.CurrentTelegramTurn = previousTelegramContext;
        }
    }

}
