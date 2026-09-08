using System.Net.WebSockets;

namespace Omnux.Middleware;

public sealed partial class WebSocketGateway
{
    private async Task RunCodingSessionCommandAsync(
        ClientMessage message, string sessionId, WebSocket socket, SemaphoreSlim sendLock,
        CancellationToken runToken, CancellationToken connectionToken)
    {
        try
        {
            await _aiCommandDispatcher.TryHandleAsync(message, sessionId, socket, sendLock, runToken);
        }
        catch (OperationCanceledException) when (runToken.IsCancellationRequested)
        {
            if (!connectionToken.IsCancellationRequested && socket.State == WebSocketState.Open)
            {
                var conversation = message.Type?.StartsWith("coding_run_", StringComparison.Ordinal) == true && !string.IsNullOrEmpty(message.ConversationId)
                    ? _conversationService.GetConversation(message.ConversationId) : null;
                await SendCodingTerminalAsync(socket, sendLock, message, "coding_cancelled", "작업을 중단했습니다. 이미 변경된 파일은 유지됩니다.", connectionToken, conversation);
            }
        }
        catch (Exception ex)
        {
            if (!connectionToken.IsCancellationRequested && socket.State == WebSocketState.Open)
            {
                await SendCodingTerminalAsync(socket, sendLock, message, "error", ex.Message, connectionToken);
            }
        }
    }

    private static async Task SendCodingTerminalAsync(WebSocket socket, SemaphoreSlim sendLock,
        ClientMessage request, string type, string message, CancellationToken token, ConversationThreadView? conversation = null)
    {
        try
        {
            await SendTextAsync(socket, sendLock,
                $"{{\"type\":\"{EscapeJson(type)}\",\"requestId\":\"{EscapeJson(request.RequestId ?? string.Empty)}\","
                + $"\"conversationId\":\"{EscapeJson(request.ConversationId ?? string.Empty)}\","
                + $"\"conversation\":{(conversation == null ? "null" : BuildConversationJson(conversation))},"
                + $"\"requestType\":\"{EscapeJson(request.Type ?? string.Empty)}\",\"message\":\"{EscapeJson(message)}\"}}", token);
        }
        catch (OperationCanceledException) when (token.IsCancellationRequested) { }
        catch (Exception ex) when (ex is WebSocketException or IOException) { }
    }
}
