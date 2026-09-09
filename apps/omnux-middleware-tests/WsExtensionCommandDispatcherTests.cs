using System.Net;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

/// <summary>실제 WebSocket 프레임으로 확장 요청·응답 계약을 확인한다.</summary>
public sealed class WsExtensionCommandDispatcherTests : IDisposable
{
    private readonly string _dir = Path.Combine(
        Path.GetTempPath(),
        $"omnux-extensions-ws-{Guid.NewGuid():N}"
    );

    public WsExtensionCommandDispatcherTests()
    {
        Directory.CreateDirectory(_dir);
        Directory.CreateDirectory(Path.Combine(_dir, "plugins"));
    }

    public void Dispose()
    {
        try { Directory.Delete(_dir, recursive: true); } catch { }
    }

    [Fact]
    public async Task UnknownTypeIsNotHandled()
    {
        var handled = await SendAsync("{\"type\":\"not_extensions\"}", "not_extensions", "r1");
        Assert.Null(handled);
    }

    [Fact]
    public async Task SnapshotEchoesRequestIdAndCarriesCatalogs()
    {
        var response = await SendAsync("{\"type\":\"extensions_get\",\"requestId\":\"req-1\"}", "extensions_get", "req-1");
        Assert.NotNull(response);

        using var document = JsonDocument.Parse(response!);
        var root = document.RootElement;
        Assert.Equal("extensions_snapshot", root.GetProperty("type").GetString());
        // SER-05 회귀: 요청 ID 가 있는 요청에는 ID 를 돌려준다.
        Assert.Equal("req-1", root.GetProperty("requestId").GetString());

        var payload = root.GetProperty("payload");
        Assert.True(payload.GetProperty("events").GetArrayLength() > 0);
        Assert.True(payload.GetProperty("builtins").GetArrayLength() > 0);
        Assert.Equal(0, payload.GetProperty("hooks").GetArrayLength());
    }

    [Fact]
    public async Task HookSaveRoundTripAppearsInNextSnapshot()
    {
        var save = await SendAsync(
            """
            {
              "type": "extensions_hook_save",
              "requestId": "save-1",
              "hook": {
                "id": "guard",
                "event": "coding.file.pre",
                "handler": "builtin",
                "builtinId": "deny-path",
                "builtinArgument": "**/.env",
                "enabled": true
              }
            }
            """,
            "extensions_hook_save",
            "save-1"
        );

        using (var document = JsonDocument.Parse(save!))
        {
            var root = document.RootElement;
            Assert.Equal("extensions_hook_save_result", root.GetProperty("type").GetString());
            Assert.Equal("save-1", root.GetProperty("requestId").GetString());
            Assert.True(root.GetProperty("payload").GetProperty("ok").GetBoolean());
        }

        var snapshot = await SendAsync("{\"type\":\"extensions_get\",\"requestId\":\"s2\"}", "extensions_get", "s2");
        using var snapshotDocument = JsonDocument.Parse(snapshot!);
        var hooks = snapshotDocument.RootElement.GetProperty("payload").GetProperty("hooks");
        Assert.Equal(1, hooks.GetArrayLength());
        Assert.Equal("guard", hooks[0].GetProperty("id").GetString());
    }

    [Fact]
    public async Task InvalidHookSaveReturnsErrorsNotSilentSuccess()
    {
        var response = await SendAsync(
            "{\"type\":\"extensions_hook_save\",\"requestId\":\"bad\",\"hook\":{\"id\":\"x\",\"event\":\"tool.pre\"}}",
            "extensions_hook_save",
            "bad"
        );

        using var document = JsonDocument.Parse(response!);
        var payload = document.RootElement.GetProperty("payload");
        Assert.False(payload.GetProperty("ok").GetBoolean());
        Assert.True(payload.GetProperty("errors").GetArrayLength() > 0);
    }

    [Fact]
    public async Task MissingHookObjectIsReported()
    {
        var response = await SendAsync(
            "{\"type\":\"extensions_hook_save\",\"requestId\":\"none\"}",
            "extensions_hook_save",
            "none"
        );

        using var document = JsonDocument.Parse(response!);
        Assert.Equal("extensions_hook_save_result", document.RootElement.GetProperty("type").GetString());
        Assert.False(document.RootElement.GetProperty("payload").GetProperty("ok").GetBoolean());
    }

    [Fact]
    public async Task HookTestReturnsRealRunStatus()
    {
        await SendAsync(
            """
            {
              "type": "extensions_hook_save",
              "requestId": "s",
              "hook": {
                "id": "guard",
                "event": "coding.file.pre",
                "handler": "builtin",
                "builtinId": "deny-path",
                "builtinArgument": "**/.env"
              }
            }
            """,
            "extensions_hook_save",
            "s"
        );

        var response = await SendAsync(
            "{\"type\":\"extensions_hook_test\",\"requestId\":\"t1\",\"hookId\":\"guard\","
            + "\"event\":\"coding.file.pre\",\"filePath\":\"/repo/.env\"}",
            "extensions_hook_test",
            "t1"
        );

        using var document = JsonDocument.Parse(response!);
        var payload = document.RootElement.GetProperty("payload");
        Assert.Equal("t1", document.RootElement.GetProperty("requestId").GetString());
        Assert.Equal("completed", payload.GetProperty("status").GetString());
        Assert.Equal("deny", payload.GetProperty("outcome").GetString());
    }

    [Fact]
    public async Task BrokenRawJsonStillReturnsTypedError()
    {
        var response = await SendAsync("{\"type\":", "extensions_hook_delete", "broken");
        using var document = JsonDocument.Parse(response!);
        Assert.Equal("extensions_hook_delete_result", document.RootElement.GetProperty("type").GetString());
        Assert.False(document.RootElement.GetProperty("payload").GetProperty("ok").GetBoolean());
    }

    [Fact]
    public async Task ControlCharactersInRuleBodyStayValidJson()
    {
        var body = "탭\t포함";
        var request = JsonSerializer.Serialize(new Dictionary<string, object>
        {
            ["type"] = "extensions_rule_save",
            ["requestId"] = "rule-1",
            ["rule"] = new Dictionary<string, object>
            {
                ["id"] = "r1",
                ["title"] = "제목",
                ["body"] = body
            }
        });

        var saved = await SendAsync(request, "extensions_rule_save", "rule-1");
        using (var document = JsonDocument.Parse(saved!))
        {
            Assert.True(document.RootElement.GetProperty("payload").GetProperty("ok").GetBoolean());
        }

        var snapshot = await SendAsync("{\"type\":\"extensions_get\",\"requestId\":\"s\"}", "extensions_get", "s");
        using var snapshotDocument = JsonDocument.Parse(snapshot!);
        var rules = snapshotDocument.RootElement.GetProperty("payload").GetProperty("rules");
        Assert.Equal(body, rules[0].GetProperty("body").GetString());
    }

    private ApprovalStore Approvals => new(Path.Combine(_dir, "extension-approvals.json"));

    private async Task<string?> SendAsync(string rawJson, string type, string requestId)
    {
        var dispatcher = new WsExtensionCommandDispatcher(
            new ExtensionApplicationService(
                new ExtensionConfigStore(Path.Combine(_dir, "extensions.json")),
                () => _dir,
                () => Path.Combine(_dir, "plugins"),
                Approvals
            )
        );

        var message = new WebSocketGateway.ClientMessage
        {
            RawJson = rawJson,
            Type = type,
            RequestId = requestId
        };

        using var listener = new TcpListenerScope();
        using var serverSocket = WebSocket.CreateFromStream(
            listener.ServerStream,
            isServer: true,
            subProtocol: null,
            keepAliveInterval: TimeSpan.FromSeconds(30)
        );
        using var clientSocket = WebSocket.CreateFromStream(
            listener.ClientStream,
            isServer: false,
            subProtocol: null,
            keepAliveInterval: TimeSpan.FromSeconds(30)
        );

        using var sendLock = new SemaphoreSlim(1, 1);
        var handled = await dispatcher.TryHandleAsync(message, serverSocket, sendLock, CancellationToken.None);
        if (!handled)
        {
            return null;
        }

        var buffer = new byte[64 * 1024];
        var received = await clientSocket.ReceiveAsync(buffer, CancellationToken.None);
        Assert.Equal(WebSocketMessageType.Text, received.MessageType);
        return Encoding.UTF8.GetString(buffer, 0, received.Count);
    }

    [Fact]
    public async Task SnapshotCarriesPendingApprovals()
    {
        Assert.True(Approvals.TryRecordPending(
            HookEventCatalog.RoutinePre,
            "daily",
            "확인 필요",
            "guard",
            DateTimeOffset.UtcNow
        ));

        var response = await SendAsync("{\"type\":\"extensions_get\",\"requestId\":\"a1\"}", "extensions_get", "a1");
        using var document = JsonDocument.Parse(response!);
        var payload = document.RootElement.GetProperty("payload");
        var pending = payload.GetProperty("pendingApprovals");
        Assert.Equal(1, pending.GetArrayLength());
        Assert.Equal("daily", pending[0].GetProperty("target").GetString());
        Assert.Equal(0, payload.GetProperty("approvalGrants").GetArrayLength());
    }

    [Fact]
    public async Task ApproveMovesRequestIntoGrant()
    {
        var pendingId = ApprovalPolicy.BuildId(HookEventCatalog.RoutinePre, "daily");
        Approvals.TryRecordPending(HookEventCatalog.RoutinePre, "daily", "확인", "guard", DateTimeOffset.UtcNow);

        var approve = await SendAsync(
            $"{{\"type\":\"extensions_approval_approve\",\"requestId\":\"a2\",\"pendingId\":\"{pendingId}\",\"scope\":\"session\"}}",
            "extensions_approval_approve",
            "a2"
        );
        using (var document = JsonDocument.Parse(approve!))
        {
            Assert.Equal("extensions_approval_approve_result", document.RootElement.GetProperty("type").GetString());
            Assert.Equal("a2", document.RootElement.GetProperty("requestId").GetString());
            Assert.True(document.RootElement.GetProperty("payload").GetProperty("ok").GetBoolean());
        }

        var snapshot = await SendAsync("{\"type\":\"extensions_get\",\"requestId\":\"a3\"}", "extensions_get", "a3");
        using var snapshotDocument = JsonDocument.Parse(snapshot!);
        var payload = snapshotDocument.RootElement.GetProperty("payload");
        Assert.Equal(0, payload.GetProperty("pendingApprovals").GetArrayLength());
        var grants = payload.GetProperty("approvalGrants");
        Assert.Equal(1, grants.GetArrayLength());
        Assert.Equal("session", grants[0].GetProperty("scope").GetString());
    }

    [Fact]
    public async Task ApprovingUnknownRequestReportsFailure()
    {
        var response = await SendAsync(
            "{\"type\":\"extensions_approval_approve\",\"requestId\":\"a4\",\"pendingId\":\"nope\"}",
            "extensions_approval_approve",
            "a4"
        );

        using var document = JsonDocument.Parse(response!);
        var payload = document.RootElement.GetProperty("payload");
        Assert.False(payload.GetProperty("ok").GetBoolean());
        Assert.True(payload.GetProperty("errors").GetArrayLength() > 0);
    }

    [Fact]
    public async Task RejectAndRevokeRemoveEntries()
    {
        var now = DateTimeOffset.UtcNow;
        var store = Approvals;
        store.TryRecordPending(HookEventCatalog.RoutinePre, "a", "확인", "guard", now);
        store.TryRecordPending(HookEventCatalog.RoutinePre, "b", "확인", "guard", now);
        var grantId = ApprovalPolicy.BuildId(HookEventCatalog.RoutinePre, "b");
        store.Approve(grantId, ApprovalScope.Session, 60, now);

        var rejectId = ApprovalPolicy.BuildId(HookEventCatalog.RoutinePre, "a");
        var reject = await SendAsync(
            $"{{\"type\":\"extensions_approval_reject\",\"requestId\":\"a5\",\"pendingId\":\"{rejectId}\"}}",
            "extensions_approval_reject",
            "a5"
        );
        using (var document = JsonDocument.Parse(reject!))
        {
            Assert.True(document.RootElement.GetProperty("payload").GetProperty("ok").GetBoolean());
        }

        var revoke = await SendAsync(
            $"{{\"type\":\"extensions_approval_revoke\",\"requestId\":\"a6\",\"grantId\":\"{grantId}\"}}",
            "extensions_approval_revoke",
            "a6"
        );
        using (var document = JsonDocument.Parse(revoke!))
        {
            Assert.True(document.RootElement.GetProperty("payload").GetProperty("ok").GetBoolean());
        }

        var state = Approvals.Read();
        Assert.Empty(state.Pending);
        Assert.Empty(state.Grants);
    }

    private sealed class TcpListenerScope : IDisposable
    {
        private readonly TcpListener _listener;
        private readonly TcpClient _client;
        private readonly TcpClient _server;

        public TcpListenerScope()
        {
            _listener = new TcpListener(IPAddress.Loopback, 0);
            _listener.Start();
            var port = ((IPEndPoint)_listener.LocalEndpoint).Port;
            _client = new TcpClient();
            _client.Connect(IPAddress.Loopback, port);
            _server = _listener.AcceptTcpClient();
        }

        public Stream ServerStream => _server.GetStream();
        public Stream ClientStream => _client.GetStream();

        public void Dispose()
        {
            try { _client.Dispose(); } catch { }
            try { _server.Dispose(); } catch { }
            try { _listener.Stop(); } catch { }
        }
    }
}
