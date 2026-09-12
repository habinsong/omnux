using System.Collections.Concurrent;

namespace Omnux.Middleware;

public sealed record CodingTerminalStartResult(
    bool Ok,
    string SessionId,
    string Command,
    string WorkingDirectory,
    string Message
);

/// <summary>
/// 빌드탭에서 띄운 대화형 실행 세션들의 소유자. 세션 하나가 프로그램 하나에 대응하고,
/// 출력·종료는 콜백으로 그대로 흘려보낸다. 동시 세션 수를 묶어 폭주를 막는다.
/// </summary>
public sealed class CodingTerminalSessionManager : IAsyncDisposable
{
    public const int MaxConcurrentSessions = 4;

    private readonly ConcurrentDictionary<string, InteractiveTerminalSession> _sessions = new(StringComparer.Ordinal);

    public bool IsSupported => InteractiveTerminalSession.IsSupported;

    public int ActiveCount => _sessions.Count(entry => entry.Value.IsRunning);

    public CodingTerminalStartResult Start(
        TerminalSessionStartRequest request,
        Action<TerminalSessionChunk> onOutput,
        Action<TerminalSessionExit> onExit
    )
    {
        if (!IsSupported)
        {
            return new CodingTerminalStartResult(false, string.Empty, request.Command, request.WorkingDirectory,
                "이 운영체제에서는 대화형 실행을 지원하지 않습니다.");
        }

        PruneFinished();
        if (ActiveCount >= MaxConcurrentSessions)
        {
            return new CodingTerminalStartResult(false, string.Empty, request.Command, request.WorkingDirectory,
                $"동시에 실행할 수 있는 프로그램은 {MaxConcurrentSessions}개까지입니다. 실행 중인 것을 먼저 끝내 주세요.");
        }

        if (string.IsNullOrWhiteSpace(request.Command))
        {
            return new CodingTerminalStartResult(false, string.Empty, string.Empty, request.WorkingDirectory,
                "실행할 명령을 찾지 못했습니다.");
        }

        if (!Directory.Exists(request.WorkingDirectory))
        {
            return new CodingTerminalStartResult(false, string.Empty, request.Command, request.WorkingDirectory,
                "작업 폴더를 찾지 못했습니다.");
        }

        var sessionId = Guid.NewGuid().ToString("N");
        try
        {
            var session = InteractiveTerminalSession.Start(sessionId, request, onOutput, onExit);
            _sessions[sessionId] = session;
            return new CodingTerminalStartResult(true, sessionId, request.Command, request.WorkingDirectory, "실행을 시작했습니다.");
        }
        catch (Exception ex)
        {
            return new CodingTerminalStartResult(false, string.Empty, request.Command, request.WorkingDirectory,
                $"실행을 시작하지 못했습니다: {ex.Message}");
        }
    }

    public InteractiveTerminalSession? Find(string? sessionId)
    {
        var key = (sessionId ?? string.Empty).Trim();
        return key.Length > 0 && _sessions.TryGetValue(key, out var session) ? session : null;
    }

    public async Task<bool> WriteAsync(string? sessionId, string data, CancellationToken cancellationToken)
    {
        var session = Find(sessionId);
        if (session == null || !session.IsRunning)
        {
            return false;
        }

        await session.WriteAsync(data, cancellationToken).ConfigureAwait(false);
        return true;
    }

    public bool Stop(string? sessionId)
    {
        var session = Find(sessionId);
        if (session == null)
        {
            return false;
        }

        session.Stop();
        return true;
    }

    public void StopAll()
    {
        foreach (var entry in _sessions)
        {
            entry.Value.Stop();
        }
    }

    private void PruneFinished()
    {
        foreach (var entry in _sessions)
        {
            if (entry.Value.IsRunning)
            {
                continue;
            }

            if (_sessions.TryRemove(entry.Key, out var finished))
            {
                _ = finished.DisposeAsync();
            }
        }
    }

    public async ValueTask DisposeAsync()
    {
        foreach (var entry in _sessions)
        {
            await entry.Value.DisposeAsync().ConfigureAwait(false);
        }

        _sessions.Clear();
    }
}
