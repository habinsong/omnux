using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class SessionManagerTests
{
    [Fact]
    public void TryGetActiveTrusted_ReturnsTrustedExpiry_WhenTrustedSessionExists()
    {
        var root = CreateTempDirectory();
        try
        {
            var statePath = Path.Combine(root, "auth-sessions.json");
            var manager = new SessionManager(statePath);
            var (sessionId, otp) = manager.CreatePending(TimeSpan.FromMinutes(3));

            var authenticated = manager.Authenticate(sessionId, otp, TimeSpan.FromHours(4), out var ticket);
            var found = manager.TryGetActiveTrusted(out var expiresAtUtc);

            Assert.True(authenticated);
            Assert.True(found);
            Assert.Equal(ticket.ExpiresAtUtc, expiresAtUtc);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void TryGetActiveTrusted_LoadsTrustedSessionFromServerState_WhenManagerRestarts()
    {
        var root = CreateTempDirectory();
        try
        {
            var statePath = Path.Combine(root, "auth-sessions.json");
            var manager = new SessionManager(statePath);
            var (sessionId, otp) = manager.CreatePending(TimeSpan.FromMinutes(3));
            Assert.True(manager.Authenticate(sessionId, otp, TimeSpan.FromHours(4), out var ticket));

            var reloaded = new SessionManager(statePath);
            var found = reloaded.TryGetActiveTrusted(out var expiresAtUtc);

            Assert.True(found);
            Assert.Equal(ticket.ExpiresAtUtc, expiresAtUtc);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void TryGetActiveTrusted_ReloadsTrustedSessionFromServerState_WhenAnotherProcessAuthenticated()
    {
        var root = CreateTempDirectory();
        try
        {
            var statePath = Path.Combine(root, "auth-sessions.json");
            var browserProcessManager = new SessionManager(statePath);
            Assert.False(browserProcessManager.TryGetActiveTrusted(out _));

            var appProcessManager = new SessionManager(statePath);
            var (sessionId, otp) = appProcessManager.CreatePending(TimeSpan.FromMinutes(3));
            Assert.True(appProcessManager.Authenticate(sessionId, otp, TimeSpan.FromHours(4), out var ticket));

            var found = browserProcessManager.TryGetActiveTrusted(out var expiresAtUtc);

            Assert.True(found);
            Assert.Equal(ticket.ExpiresAtUtc, expiresAtUtc);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void TryGetActiveTrusted_IgnoresExpiredTrustedSessions()
    {
        var root = CreateTempDirectory();
        try
        {
            var statePath = Path.Combine(root, "auth-sessions.json");
            var manager = new SessionManager(statePath);
            var (sessionId, otp) = manager.CreatePending(TimeSpan.FromMinutes(3));

            Assert.True(manager.Authenticate(sessionId, otp, TimeSpan.FromSeconds(-1), out _));
            var found = manager.TryGetActiveTrusted(out var expiresAtUtc);

            Assert.False(found);
            Assert.Equal(DateTimeOffset.MinValue, expiresAtUtc);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    private static string CreateTempDirectory()
    {
        var root = Path.Combine(Path.GetTempPath(), "omnux-session-tests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        return root;
    }
}
