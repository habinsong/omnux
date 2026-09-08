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
