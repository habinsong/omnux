using System.Net.WebSockets;

namespace Omnux.Middleware;

/// <summary>
/// 빌드탭의 "실행"을 진짜 실행으로 만드는 WS 경계.
/// 프로그램을 PTY 에 띄우고, 화면 출력은 그대로 흘려보내고, 키 입력은 그대로 넣어 준다.
/// 그래서 curses 게임·입력 프롬프트·진행 표시가 전부 살아 있는 채로 돌아간다.
/// </summary>
internal sealed class WsCodingTerminalDispatcher
{
    private readonly ICodingApplicationService _codingService;
    private readonly CodingTerminalSessionManager _sessions;

    public WsCodingTerminalDispatcher(
        ICodingApplicationService codingService,
        CodingTerminalSessionManager sessions
    )
    {
        _codingService = codingService;
        _sessions = sessions;
    }

    public async Task<bool> TryHandleAsync(
        WebSocketGateway.ClientMessage message,
        WebSocket socket,
        SemaphoreSlim sendLock,
        CancellationToken cancellationToken
    )
    {
        switch (message.Type)
        {
            case "coding_terminal_start":
                await HandleStartAsync(message, socket, sendLock, cancellationToken).ConfigureAwait(false);
                return true;
            case "coding_terminal_input":
                await HandleInputAsync(message, socket, sendLock, cancellationToken).ConfigureAwait(false);
                return true;
            case "coding_terminal_stop":
                await HandleStopAsync(message, socket, sendLock, cancellationToken).ConfigureAwait(false);
                return true;
            default:
                return false;
        }
    }

    private async Task HandleStartAsync(
        WebSocketGateway.ClientMessage message,
        WebSocket socket,
        SemaphoreSlim sendLock,
        CancellationToken cancellationToken
    )
    {
        var requestId = message.RequestId ?? string.Empty;
        CodingInteractiveRunPlan plan;
        try
        {
            plan = await _codingService
                .BuildInteractiveRunPlanAsync(message.ConversationId ?? string.Empty, message.Target, cancellationToken)
                .ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            await SendStartResultAsync(socket, sendLock, requestId, false, string.Empty, string.Empty, string.Empty, string.Empty, ex.Message, cancellationToken).ConfigureAwait(false);
            return;
        }

        if (!plan.Ok)
        {
            await SendStartResultAsync(socket, sendLock, requestId, false, string.Empty, string.Empty, string.Empty, string.Empty, plan.Message, cancellationToken).ConfigureAwait(false);
            return;
        }

        // HTML 결과물은 실행이 아니라 브라우저 프리뷰다.
        if (plan.Command.Length == 0 && plan.PreviewUrl.Length > 0)
        {
            await SendStartResultAsync(socket, sendLock, requestId, true, string.Empty, string.Empty, plan.WorkingDirectory, plan.PreviewUrl, plan.Message, cancellationToken).ConfigureAwait(false);
            return;
        }

        var start = _sessions.Start(
            new TerminalSessionStartRequest(
                plan.Command,
                plan.WorkingDirectory,
                message.Columns ?? 100,
                message.Rows ?? 30,
                plan.Environment
            ),
            chunk => FireAndForget(SendOutputAsync(socket, sendLock, chunk, CancellationToken.None)),
            exit => FireAndForget(SendExitAsync(socket, sendLock, exit, CancellationToken.None))
        );

        var message2 = start.Ok && plan.Message.Length > 0 ? $"{plan.Message}\n{start.Message}" : start.Message;
        await SendStartResultAsync(
            socket,
            sendLock,
            requestId,
            start.Ok,
            start.SessionId,
            start.Command,
            start.WorkingDirectory,
            string.Empty,
            message2,
            cancellationToken
        ).ConfigureAwait(false);
    }

    private async Task HandleInputAsync(
        WebSocketGateway.ClientMessage message,
        WebSocket socket,
        SemaphoreSlim sendLock,
        CancellationToken cancellationToken
    )
    {
        var wrote = await _sessions
            .WriteAsync(message.SessionId, message.Data ?? string.Empty, cancellationToken)
            .ConfigureAwait(false);
        if (wrote)
        {
            return;
        }

        await WebSocketGateway.SendTextAsync(
            socket,
            sendLock,
            "{\"type\":\"coding_terminal_exit\","
            + $"\"sessionId\":\"{WebSocketGateway.EscapeJson(message.SessionId ?? string.Empty)}\","
            + "\"exitCode\":-1,\"reason\":\"gone\"}",
            cancellationToken
        ).ConfigureAwait(false);
    }

    private async Task HandleStopAsync(
        WebSocketGateway.ClientMessage message,
        WebSocket socket,
        SemaphoreSlim sendLock,
        CancellationToken cancellationToken
    )
    {
        var stopped = _sessions.Stop(message.SessionId);
        await WebSocketGateway.SendTextAsync(
            socket,
            sendLock,
            "{\"type\":\"coding_terminal_stop_result\","
            + $"\"requestId\":\"{WebSocketGateway.EscapeJson(message.RequestId ?? string.Empty)}\","
            + $"\"sessionId\":\"{WebSocketGateway.EscapeJson(message.SessionId ?? string.Empty)}\","
            + $"\"ok\":{(stopped ? "true" : "false")}}}",
            cancellationToken
        ).ConfigureAwait(false);
    }

    private static Task SendStartResultAsync(
        WebSocket socket,
        SemaphoreSlim sendLock,
        string requestId,
        bool ok,
        string sessionId,
        string command,
        string workingDirectory,
        string previewUrl,
        string message,
        CancellationToken cancellationToken
    )
    {
        return WebSocketGateway.SendTextAsync(
            socket,
            sendLock,
            "{\"type\":\"coding_terminal_started\","
            + $"\"requestId\":\"{WebSocketGateway.EscapeJson(requestId)}\","
            + $"\"ok\":{(ok ? "true" : "false")},"
            + $"\"sessionId\":\"{WebSocketGateway.EscapeJson(sessionId)}\","
            + $"\"command\":\"{WebSocketGateway.EscapeJson(command)}\","
            + $"\"workingDirectory\":\"{WebSocketGateway.EscapeJson(workingDirectory)}\","
            + $"\"previewUrl\":\"{WebSocketGateway.EscapeJson(previewUrl)}\","
            + $"\"message\":\"{WebSocketGateway.EscapeJson(message)}\"}}",
            cancellationToken
        );
    }

    private static Task SendOutputAsync(
        WebSocket socket,
        SemaphoreSlim sendLock,
        TerminalSessionChunk chunk,
        CancellationToken cancellationToken
    )
    {
        return WebSocketGateway.SendTextAsync(
            socket,
            sendLock,
            "{\"type\":\"coding_terminal_output\","
            + $"\"sessionId\":\"{WebSocketGateway.EscapeJson(chunk.SessionId)}\","
            + $"\"data\":\"{WebSocketGateway.EscapeJson(chunk.Data)}\"}}",
            cancellationToken
        );
    }

    private static Task SendExitAsync(
        WebSocket socket,
        SemaphoreSlim sendLock,
        TerminalSessionExit exit,
        CancellationToken cancellationToken
    )
    {
        return WebSocketGateway.SendTextAsync(
            socket,
            sendLock,
            "{\"type\":\"coding_terminal_exit\","
            + $"\"sessionId\":\"{WebSocketGateway.EscapeJson(exit.SessionId)}\","
            + $"\"exitCode\":{exit.ExitCode},"
            + $"\"reason\":\"{WebSocketGateway.EscapeJson(exit.Reason)}\"}}",
            cancellationToken
        );
    }

    // 출력 펌프는 소켓 쓰기를 기다리면 안 된다(프로그램 실행이 막힌다).
    private static void FireAndForget(Task task)
    {
        _ = task.ContinueWith(
            completed => Console.Error.WriteLine($"[coding-terminal] send failed: {completed.Exception?.GetBaseException().Message}"),
            CancellationToken.None,
            TaskContinuationOptions.OnlyOnFaulted,
            TaskScheduler.Default
        );
    }
}
