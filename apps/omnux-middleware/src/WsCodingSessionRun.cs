namespace Omnux.Middleware;

// 한 WS 연결은 코딩 작업 하나를 소유한다. 다른 연결의 요청은 중단할 수 없다.
internal sealed class WsCodingSessionRun(CancellationToken connectionToken) : IAsyncDisposable
{
    private CancellationTokenSource? _cancellation;
    private string? _requestId;
    public Task Completion { get; private set; } = Task.CompletedTask;

    public bool IsActive(string? requestId) => !Completion.IsCompleted && !string.IsNullOrEmpty(requestId) && requestId == _requestId;

    public bool TryStart(string requestId, Func<CancellationToken, Task> run)
    {
        if (!Completion.IsCompleted) return false;
        connectionToken.ThrowIfCancellationRequested();
        _cancellation?.Dispose();
        var cancellation = CancellationTokenSource.CreateLinkedTokenSource(connectionToken);
        _cancellation = cancellation;
        _requestId = requestId;
        Completion = Task.Run(() => run(cancellation.Token), CancellationToken.None);
        return true;
    }

    /// <summary>
    /// 직전 실행이 정리되는 찰나를 기다렸다가 시작한다.
    ///
    /// 결과 메시지는 실행 태스크 안에서 보내므로, 클라이언트가 결과를 받은 시점에도 태스크는
    /// 아직 끝나지 않았다. 그 틈에 다음 요청이 오면 "진행 중"으로 거부돼, 빌드탭에서 이어서
    /// 요청하는 게 막혔다(실측). 짧은 유예를 주면 실제 동시 실행만 거부된다.
    /// </summary>
    public async Task<bool> TryStartAfterGraceAsync(string requestId, Func<CancellationToken, Task> run, TimeSpan grace)
    {
        if (!Completion.IsCompleted && grace > TimeSpan.Zero)
        {
            try
            {
                await Task.WhenAny(Completion, Task.Delay(grace, connectionToken)).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                return false;
            }
        }

        return TryStart(requestId, run);
    }

    public bool Cancel(string? requestId)
    {
        if (!IsActive(requestId)) return false;
        _cancellation!.Cancel();
        return true;
    }

    public async ValueTask DisposeAsync()
    {
        _cancellation?.Cancel();
        try { await Completion.ConfigureAwait(false); }
        catch (OperationCanceledException) { }
        finally { _cancellation?.Dispose(); }
    }
}
