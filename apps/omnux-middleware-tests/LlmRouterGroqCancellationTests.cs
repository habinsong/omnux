using System.Net;
using System.Net.Sockets;
using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class LlmRouterGroqCancellationTests
{
    [Fact]
    public async Task GenerateGroqChatAsyncPropagatesCancellationWithoutRuntimeWarn()
    {
        using var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        using var serverCts = new CancellationTokenSource();
        var serverTask = AcceptAndHoldConnectionAsync(listener, serverCts.Token);
        var config = CreateConfig(listener);
        using var router = new LlmRouter(config.Providers, config.Paths, config.Context, new RuntimeSettings(config));
        using var requestCts = new CancellationTokenSource(TimeSpan.FromMilliseconds(120));
        var previousError = Console.Error;
        using var errorWriter = new StringWriter();
        Console.SetError(errorWriter);

        try
        {
            await Assert.ThrowsAnyAsync<OperationCanceledException>(() =>
                router.GenerateGroqChatAsync("테스트 질문", "llama-test", 512, requestCts.Token)
            );
            Assert.DoesNotContain("[groq] chat error", errorWriter.ToString(), StringComparison.OrdinalIgnoreCase);
        }
        finally
        {
            Console.SetError(previousError);
            await serverCts.CancelAsync();
            listener.Stop();
            try
            {
                await serverTask;
            }
            catch (OperationCanceledException)
            {
            }
            catch (SocketException)
            {
            }
        }
    }

    private static async Task AcceptAndHoldConnectionAsync(TcpListener listener, CancellationToken cancellationToken)
    {
        using var client = await listener.AcceptTcpClientAsync(cancellationToken);
        await Task.Delay(TimeSpan.FromSeconds(10), cancellationToken);
    }

    private static AppConfig CreateConfig(TcpListener listener)
    {
        var endpoint = (IPEndPoint)listener.LocalEndpoint;
        var stateRoot = Path.Combine(Path.GetTempPath(), $"omnux-llmrouter-test-{Guid.NewGuid():N}");
        return new AppConfig
        {
            GroqApiKey = "test-groq-key",
            GroqBaseUrl = $"http://127.0.0.1:{endpoint.Port}/openai/v1",
            LlmUsageStatePath = Path.Combine(stateRoot, "llm_usage.json"),
            CopilotUsageStatePath = Path.Combine(stateRoot, "copilot_usage.json"),
            ConversationStatePath = Path.Combine(stateRoot, "conversations.json"),
            AuthSessionStatePath = Path.Combine(stateRoot, "auth_sessions.json"),
            MemoryNotesRootDir = Path.Combine(stateRoot, "memory-notes"),
            CodeRunsRootDir = Path.Combine(stateRoot, "code-runs"),
            RoutineRunsRootDir = Path.Combine(stateRoot, "routines"),
            WorkspaceRootDir = Path.Combine(stateRoot, "workspace"),
            RoutineStatePath = Path.Combine(stateRoot, "routines.json"),
            RoutinePromptDir = Path.Combine(stateRoot, "routine-prompts"),
            AuditLogPath = Path.Combine(stateRoot, "audit.log"),
            GuardRetryTimelineStatePath = Path.Combine(stateRoot, "guard_retry_timeline.json"),
            GatewayHealthStatePath = Path.Combine(stateRoot, "gateway_health.json"),
            GatewayStartupProbeStatePath = Path.Combine(stateRoot, "gateway_startup_probe.json"),
            DashboardAccessStatePath = Path.Combine(stateRoot, "dashboard_access.json")
        };
    }
}
