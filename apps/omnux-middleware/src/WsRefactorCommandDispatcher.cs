using System.Net.WebSockets;
using System.Text.Json;

namespace Omnux.Middleware;

internal sealed class WsRefactorCommandDispatcher
{

    private readonly IRefactorApplicationService _refactorService;

    public WsRefactorCommandDispatcher(
        IRefactorApplicationService refactorService
    )
    {
        _refactorService = refactorService;
    }

    public async Task<bool> TryHandleAsync(
        WebSocketGateway.ClientMessage message,
        WebSocket socket,
        SemaphoreSlim sendLock,
        CancellationToken cancellationToken
    )
    {
        if (message.Type == "refactor_read")
        {
            var path = (message.FilePath ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(path))
            {
                await SendMissingFieldAsync(socket, sendLock, "path", cancellationToken);
                return true;
            }

            var result = await _refactorService.ReadWithAnchorsAsync(path, cancellationToken);
            await SendRefactorActionResultAsync(socket, sendLock, "read", result, cancellationToken);
            return true;
        }

        if (message.Type == "refactor_preview")
        {
            var path = (message.FilePath ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(path))
            {
                await SendMissingFieldAsync(socket, sendLock, "path", cancellationToken);
                return true;
            }

            AnchorEditRequest[] edits;
            try
            {
                edits = RefactorJson.DeserializeEdits(message.RefactorEditsJson ?? "[]");
            }
            catch (JsonException)
            {
                await WebSocketGateway.SendTextAsync(
                    socket,
                    sendLock,
                    "{\"type\":\"error\",\"message\":\"edits 형식이 올바르지 않습니다.\"}",
                    cancellationToken
                );
                return true;
            }

            var result = await _refactorService.PreviewRefactorAsync(path, edits, cancellationToken);
            await SendRefactorActionResultAsync(socket, sendLock, "preview", result, cancellationToken);
            return true;
        }

        if (message.Type == "refactor_apply")
        {
            var previewId = (message.PreviewId ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(previewId))
            {
                await SendMissingFieldAsync(socket, sendLock, "previewId", cancellationToken);
                return true;
            }

            var result = await _refactorService.ApplyRefactorAsync(previewId, cancellationToken);
            await SendRefactorActionResultAsync(socket, sendLock, "apply", result, cancellationToken);
            return true;
        }

        if (message.Type == "refactor_restore")
        {
            var rollbackId = (message.RollbackId ?? message.PreviewId ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(rollbackId))
            {
                await SendMissingFieldAsync(socket, sendLock, "rollbackId", cancellationToken);
                return true;
            }

            var result = await _refactorService.RestoreRollbackAsync(rollbackId, cancellationToken);
            await SendRefactorActionResultAsync(socket, sendLock, "restore", result, cancellationToken);
            return true;
        }

        if (message.Type == "lsp_rename")
        {
            var path = (message.FilePath ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(path))
            {
                await SendMissingFieldAsync(socket, sendLock, "path", cancellationToken);
                return true;
            }

            var result = await _refactorService.RunLspRenameAsync(
                path,
                message.Symbol ?? string.Empty,
                message.NewName ?? string.Empty,
                cancellationToken
            );
            await SendRefactorActionResultAsync(socket, sendLock, "lsp_rename", result, cancellationToken);
            return true;
        }

        if (message.Type == "ast_replace")
        {
            var path = (message.FilePath ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(path))
            {
                await SendMissingFieldAsync(socket, sendLock, "path", cancellationToken);
                return true;
            }

            var result = await _refactorService.RunAstReplaceAsync(
                path,
                message.Pattern ?? string.Empty,
                message.Replacement ?? string.Empty,
                cancellationToken
            );
            await SendRefactorActionResultAsync(socket, sendLock, "ast_replace", result, cancellationToken);
            return true;
        }

        return false;
    }

    private static Task SendMissingFieldAsync(
        WebSocket socket,
        SemaphoreSlim sendLock,
        string fieldName,
        CancellationToken cancellationToken
    )
    {
        return WebSocketGateway.SendTextAsync(
            socket,
            sendLock,
            $"{{\"type\":\"error\",\"message\":\"{WebSocketGateway.EscapeJson(fieldName)} is required\"}}",
            cancellationToken
        );
    }
private static Task SendRefactorActionResultAsync(
    WebSocket socket,
    SemaphoreSlim sendLock,
    string action,
    RefactorActionResult result,
    CancellationToken cancellationToken
)
{
    var payload = RefactorJson.Serialize(result);
    return WebSocketGateway.SendTextAsync(
        socket,
        sendLock,
        "{"
        + "\"type\":\"refactor_result\","
        + $"\"action\":\"{WebSocketGateway.EscapeJson(action)}\","
        + $"\"payload\":{payload}"
        + "}",
        cancellationToken
    );
}

}
