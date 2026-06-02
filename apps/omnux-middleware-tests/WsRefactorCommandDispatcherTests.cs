using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class WsRefactorCommandDispatcherTests
{
    [Fact]
    public async Task TryHandleAsyncRoutesRollbackRestoreByRollbackId()
    {
        var service = new FakeRefactorService();
        var calls = new List<(string Action, RefactorActionResult Result)>();
        var dispatcher = new WsRefactorCommandDispatcher(
            service,
            (socket, sendLock, action, result, cancellationToken) =>
            {
                calls.Add((action, result));
                return Task.CompletedTask;
            }
        );

        var handled = await dispatcher.TryHandleAsync(
            new WebSocketGateway.ClientMessage
            {
                Type = "refactor_restore",
                RollbackId = "  rollback_123  "
            },
            null!,
            new SemaphoreSlim(1, 1),
            CancellationToken.None
        );

        Assert.True(handled);
        Assert.Equal(new[] { "rollback_123" }, service.RestoreCalls);
        Assert.Single(calls);
        Assert.Equal("restore", calls[0].Action);
        Assert.True(calls[0].Result.Ok);
        Assert.NotNull(calls[0].Result.RollbackResult);
        Assert.Equal("rollback_123", calls[0].Result.RollbackResult!.RollbackId);
    }

    [Fact]
    public async Task TryHandleAsyncRoutesRollbackRestoreByPreviewIdFallback()
    {
        var service = new FakeRefactorService();
        var calls = new List<(string Action, RefactorActionResult Result)>();
        var dispatcher = new WsRefactorCommandDispatcher(
            service,
            (socket, sendLock, action, result, cancellationToken) =>
            {
                calls.Add((action, result));
                return Task.CompletedTask;
            }
        );

        var handled = await dispatcher.TryHandleAsync(
            new WebSocketGateway.ClientMessage
            {
                Type = "refactor_restore",
                PreviewId = "preview_123"
            },
            null!,
            new SemaphoreSlim(1, 1),
            CancellationToken.None
        );

        Assert.True(handled);
        Assert.Equal(new[] { "preview_123" }, service.RestoreCalls);
        Assert.Single(calls);
        Assert.Equal("restore", calls[0].Action);
        Assert.True(calls[0].Result.Ok);
        Assert.NotNull(calls[0].Result.RollbackResult);
        Assert.Equal("rollback_123", calls[0].Result.RollbackResult!.RollbackId);
    }

    private sealed class FakeRefactorService : IRefactorApplicationService
    {
        public List<string> RestoreCalls { get; } = new();
        private static readonly RefactorActionResult SuccessResult = new(
            true,
            "rollback 복원을 완료했습니다.",
            RollbackResult: new RefactorRollbackOutcome(
                "rollback_123",
                true,
                "2026-06-01T00:00:00.0000000Z",
                Array.Empty<AnchorEditIssue>(),
                new[] { "workspace/file.txt" }
            )
        );

        public Task<RefactorActionResult> ReadWithAnchorsAsync(string path, CancellationToken cancellationToken)
            => throw new NotSupportedException();

        public Task<RefactorActionResult> PreviewRefactorAsync(
            string path,
            IReadOnlyList<AnchorEditRequest>? edits,
            CancellationToken cancellationToken
        ) => throw new NotSupportedException();

        public Task<RefactorActionResult> ApplyRefactorAsync(string previewId, CancellationToken cancellationToken)
            => throw new NotSupportedException();

        public Task<RefactorActionResult> RestoreRollbackAsync(string rollbackId, CancellationToken cancellationToken)
        {
            RestoreCalls.Add(rollbackId);
            return Task.FromResult(SuccessResult);
        }

        public Task<RefactorActionResult> RunLspRenameAsync(
            string path,
            string symbol,
            string newName,
            CancellationToken cancellationToken
        ) => throw new NotSupportedException();

        public Task<RefactorActionResult> RunAstReplaceAsync(
            string path,
            string pattern,
            string replacement,
            CancellationToken cancellationToken
        ) => throw new NotSupportedException();
    }
}
