using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class WsCodingSessionRunTests
{
    [Fact]
    public async Task OnlyMatchingRequestCanCancelAndOverlappingRunIsRejected()
    {
        await using var session = new WsCodingSessionRun(CancellationToken.None);
        var started = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        Assert.True(session.TryStart("one", async token => { started.SetResult(); await Task.Delay(Timeout.Infinite, token); }));
        await started.Task.WaitAsync(TimeSpan.FromSeconds(5));
        Assert.True(session.IsActive("one"));
        Assert.False(session.IsActive("two"));
        Assert.False(session.TryStart("two", _ => Task.CompletedTask));
        Assert.False(session.Cancel("two"));
        Assert.True(session.Cancel("one"));
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => session.Completion);
        Assert.False(session.Cancel("one"));
        Assert.True(session.TryStart("three", _ => Task.CompletedTask));
        await session.Completion;
    }

    [Fact]
    public async Task DisconnectCancelsOnlyItsConnection()
    {
        using var connection = new CancellationTokenSource();
        await using var first = new WsCodingSessionRun(connection.Token);
        await using var second = new WsCodingSessionRun(CancellationToken.None);
        first.TryStart("shared-id", token => Task.Delay(Timeout.Infinite, token));
        second.TryStart("shared-id", token => Task.Delay(Timeout.Infinite, token));
        connection.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => first.Completion);
        Assert.False(second.Completion.IsCompleted);
        second.Cancel("shared-id");
    }

    [Fact]
    public async Task CancelledWorkMustFinishCleanupBeforeAcceptingAnotherRun()
    {
        await using var session = new WsCodingSessionRun(CancellationToken.None);
        var started = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var cleanup = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        session.TryStart("one", async token =>
        {
            started.SetResult();
            try { await Task.Delay(Timeout.Infinite, token); }
            finally { await cleanup.Task; }
        });
        await started.Task.WaitAsync(TimeSpan.FromSeconds(5));
        Assert.True(session.Cancel("one"));
        Assert.False(session.TryStart("two", _ => Task.CompletedTask));
        cleanup.SetResult();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => session.Completion);
        Assert.True(session.TryStart("two", _ => Task.CompletedTask));
        await session.Completion;
    }
}
