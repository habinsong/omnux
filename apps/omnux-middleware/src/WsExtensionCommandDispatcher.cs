using System.Net.WebSockets;
using System.Text.Json;

namespace Omnux.Middleware;

/// <summary>
/// 확장(훅·플러그인·규칙) 요청 처리기. 공용 ClientMessage 에 필드를 더 추가하지 않고
/// 원문 JSON 에서 자기 입력만 읽는다. 모든 응답에 요청 ID 를 되돌려준다.
/// </summary>
internal sealed class WsExtensionCommandDispatcher
{
    private readonly ExtensionApplicationService _service;

    public WsExtensionCommandDispatcher(ExtensionApplicationService service)
    {
        _service = service;
    }

    public async Task<bool> TryHandleAsync(
        WebSocketGateway.ClientMessage message,
        WebSocket socket,
        SemaphoreSlim sendLock,
        CancellationToken cancellationToken
    )
    {
        var type = message.Type ?? string.Empty;
        if (!type.StartsWith("extensions_", StringComparison.Ordinal))
        {
            return false;
        }

        var requestId = message.RequestId ?? string.Empty;
        JsonDocument? document = null;
        try
        {
            document = JsonDocument.Parse(message.RawJson);
        }
        catch (JsonException)
        {
            // 원문을 읽지 못해도 요청 종류별 응답은 돌려준다.
        }

        try
        {
            var root = document?.RootElement ?? default;
            var hasRoot = document != null && root.ValueKind == JsonValueKind.Object;
            var payload = Handle(type, requestId, hasRoot ? root : default, hasRoot, cancellationToken);
            var text = await payload.ConfigureAwait(false);
            if (text == null)
            {
                return false;
            }

            await WebSocketGateway.SendTextAsync(socket, sendLock, text, cancellationToken).ConfigureAwait(false);
            return true;
        }
        finally
        {
            document?.Dispose();
        }
    }

    private Task<string?> Handle(
        string type,
        string requestId,
        JsonElement root,
        bool hasRoot,
        CancellationToken cancellationToken
    )
    {
        switch (type)
        {
            case "extensions_get":
                return Task.FromResult<string?>(
                    ExtensionWsJson.Snapshot(
                        requestId,
                        _service.GetOverview(),
                        _service.GetApprovals(),
                        Array.Empty<string>()
                    )
                );
            case "extensions_refresh":
                return Task.FromResult<string?>(
                    ExtensionWsJson.Snapshot(
                        requestId,
                        _service.Refresh(),
                        _service.GetApprovals(),
                        Array.Empty<string>()
                    )
                );
            case "extensions_approval_approve":
                return Task.FromResult<string?>(HandleApprove(requestId, root, hasRoot));
            case "extensions_approval_reject":
                return Task.FromResult<string?>(WithApprovalId(
                    requestId,
                    type,
                    root,
                    hasRoot,
                    "pendingId",
                    id => _service.RejectRequest(id)
                ));
            case "extensions_approval_revoke":
                return Task.FromResult<string?>(WithApprovalId(
                    requestId,
                    type,
                    root,
                    hasRoot,
                    "grantId",
                    id => _service.RevokeApproval(id)
                ));
            case "extensions_hook_save":
                return Task.FromResult<string?>(HandleHookSave(requestId, root, hasRoot));
            case "extensions_hook_delete":
                return Task.FromResult<string?>(WithId(
                    requestId,
                    type,
                    root,
                    hasRoot,
                    "hookId",
                    id => _service.DeleteHook(id)
                ));
            case "extensions_hook_toggle":
                return Task.FromResult<string?>(WithId(
                    requestId,
                    type,
                    root,
                    hasRoot,
                    "hookId",
                    id => _service.SetHookEnabled(id, ExtensionConfigJson.ReadBool(root, "enabled", true))
                ));
            case "extensions_rule_save":
                return Task.FromResult<string?>(HandleRuleSave(requestId, root, hasRoot));
            case "extensions_rule_delete":
                return Task.FromResult<string?>(WithId(
                    requestId,
                    type,
                    root,
                    hasRoot,
                    "ruleId",
                    id => _service.DeleteRule(id)
                ));
            case "extensions_plugin_toggle":
                return Task.FromResult<string?>(WithId(
                    requestId,
                    type,
                    root,
                    hasRoot,
                    "pluginId",
                    id => _service.SetPluginEnabled(id, ExtensionConfigJson.ReadBool(root, "enabled", true))
                ));
            case "extensions_plugin_root_add":
                return Task.FromResult<string?>(WithId(
                    requestId,
                    type,
                    root,
                    hasRoot,
                    "path",
                    path => _service.AddPluginRoot(path)
                ));
            case "extensions_plugin_root_remove":
                return Task.FromResult<string?>(WithId(
                    requestId,
                    type,
                    root,
                    hasRoot,
                    "path",
                    path => _service.RemovePluginRoot(path)
                ));
            case "extensions_hook_test":
                return HandleHookTestAsync(requestId, root, hasRoot, cancellationToken);
            default:
                return Task.FromResult<string?>(null);
        }
    }

    private string HandleApprove(string requestId, JsonElement root, bool hasRoot)
    {
        const string responseType = "extensions_approval_approve_result";
        if (!hasRoot)
        {
            return ExtensionWsJson.Error(requestId, responseType, "요청 본문을 읽지 못했다");
        }

        var pendingId = ExtensionConfigJson.ReadString(root, "pendingId");
        if (pendingId.Length == 0)
        {
            return ExtensionWsJson.Error(requestId, responseType, "pendingId 가 비어 있다");
        }

        var scope = string.Equals(ExtensionConfigJson.ReadString(root, "scope"), "session", StringComparison.OrdinalIgnoreCase)
            ? ApprovalScope.Session
            : ApprovalScope.Once;
        var minutes = ExtensionConfigJson.ReadInt(root, "sessionMinutes", ApprovalPolicy.DefaultSessionMinutes);

        return ExtensionWsJson.ApprovalResult(
            requestId,
            responseType,
            _service.ApproveRequest(pendingId, scope, minutes)
        );
    }

    private string WithApprovalId(
        string requestId,
        string type,
        JsonElement root,
        bool hasRoot,
        string propertyName,
        Func<string, ApprovalMutationResult> apply
    )
    {
        var responseType = type + "_result";
        if (!hasRoot)
        {
            return ExtensionWsJson.Error(requestId, responseType, "요청 본문을 읽지 못했다");
        }

        var value = ExtensionConfigJson.ReadString(root, propertyName);
        if (value.Length == 0)
        {
            return ExtensionWsJson.Error(requestId, responseType, $"{propertyName} 이(가) 비어 있다");
        }

        return ExtensionWsJson.ApprovalResult(requestId, responseType, apply(value));
    }

    private string HandleHookSave(string requestId, JsonElement root, bool hasRoot)
    {
        if (!hasRoot || !root.TryGetProperty("hook", out var hookElement)
            || hookElement.ValueKind != JsonValueKind.Object)
        {
            return ExtensionWsJson.Error(requestId, "extensions_hook_save_result", "hook 객체가 없다");
        }

        var hook = ExtensionConfigJson.ReadHook(hookElement, defaultSource: string.Empty);
        if (hook == null)
        {
            return ExtensionWsJson.Error(requestId, "extensions_hook_save_result", "hook 에 id 또는 event 가 없다");
        }

        return ExtensionWsJson.MutationResult(
            requestId,
            "extensions_hook_save_result",
            _service.SaveHook(hook)
        );
    }

    private string HandleRuleSave(string requestId, JsonElement root, bool hasRoot)
    {
        if (!hasRoot || !root.TryGetProperty("rule", out var ruleElement)
            || ruleElement.ValueKind != JsonValueKind.Object)
        {
            return ExtensionWsJson.Error(requestId, "extensions_rule_save_result", "rule 객체가 없다");
        }

        var rule = ExtensionConfigJson.ReadRule(ruleElement, defaultSource: string.Empty);
        if (rule == null)
        {
            return ExtensionWsJson.Error(requestId, "extensions_rule_save_result", "rule 에 id 가 없다");
        }

        return ExtensionWsJson.MutationResult(
            requestId,
            "extensions_rule_save_result",
            _service.SaveRule(rule)
        );
    }

    private async Task<string?> HandleHookTestAsync(
        string requestId,
        JsonElement root,
        bool hasRoot,
        CancellationToken cancellationToken
    )
    {
        if (!hasRoot)
        {
            return ExtensionWsJson.Error(requestId, "extensions_hook_test_result", "요청 본문을 읽지 못했다");
        }

        var hookId = ExtensionConfigJson.ReadString(root, "hookId");
        if (hookId.Length == 0)
        {
            return ExtensionWsJson.Error(requestId, "extensions_hook_test_result", "hookId 가 비어 있다");
        }

        var sample = new HookEventInput(
            HookEventCatalog.Normalize(ExtensionConfigJson.ReadString(root, "event")),
            ExtensionConfigJson.ReadString(root, "sessionId"),
            ExtensionConfigJson.ReadString(root, "toolName"),
            ReadRawObject(root, "toolInput"),
            ExtensionConfigJson.ReadString(root, "filePath"),
            ExtensionConfigJson.ReadString(root, "command"),
            ExtensionConfigJson.ReadString(root, "prompt"),
            ExtensionConfigJson.ReadString(root, "cwd")
        );

        var run = await _service.TestHookAsync(hookId, sample, cancellationToken).ConfigureAwait(false);
        return ExtensionWsJson.HookTestResult(requestId, run);
    }

    private string WithId(
        string requestId,
        string type,
        JsonElement root,
        bool hasRoot,
        string propertyName,
        Func<string, ExtensionMutationResult> apply
    )
    {
        var responseType = type + "_result";
        if (!hasRoot)
        {
            return ExtensionWsJson.Error(requestId, responseType, "요청 본문을 읽지 못했다");
        }

        var value = ExtensionConfigJson.ReadString(root, propertyName);
        if (value.Length == 0)
        {
            return ExtensionWsJson.Error(requestId, responseType, $"{propertyName} 이(가) 비어 있다");
        }

        return ExtensionWsJson.MutationResult(requestId, responseType, apply(value));
    }

    private static string ReadRawObject(JsonElement root, string propertyName)
    {
        if (!root.TryGetProperty(propertyName, out var element))
        {
            return string.Empty;
        }

        return element.ValueKind is JsonValueKind.Object or JsonValueKind.Array
            ? element.GetRawText()
            : string.Empty;
    }
}
