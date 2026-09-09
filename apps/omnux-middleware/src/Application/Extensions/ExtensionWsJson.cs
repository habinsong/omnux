using System.Text;
using System.Text.Json;

namespace Omnux.Middleware;

/// <summary>
/// 확장 화면 전송 직렬화. 문자열 이어붙이기를 쓰지 않고 Utf8JsonWriter 로만 만든다.
/// 모든 응답은 요청 ID 를 그대로 돌려준다.
/// </summary>
internal static class ExtensionWsJson
{
    public static string Envelope(string type, string requestId, Action<Utf8JsonWriter> writePayload)
    {
        using var buffer = new MemoryStream();
        using (var writer = new Utf8JsonWriter(buffer, new JsonWriterOptions { Indented = false }))
        {
            writer.WriteStartObject();
            writer.WriteString("type", type);
            writer.WriteString("requestId", requestId);
            writer.WritePropertyName("payload");
            writer.WriteStartObject();
            writePayload(writer);
            writer.WriteEndObject();
            writer.WriteEndObject();
        }

        return Encoding.UTF8.GetString(buffer.ToArray());
    }

    public static string Snapshot(
        string requestId,
        ExtensionOverview overview,
        ApprovalState approvals,
        IReadOnlyList<string> errors
    )
    {
        return Envelope("extensions_snapshot", requestId, writer =>
        {
            WriteApprovals(writer, approvals);
            writer.WriteString("configPath", overview.ConfigPath);
            writer.WriteString("updatedUtc", overview.Config.UpdatedUtc);
            writer.WriteBoolean("configExists", overview.Config.Exists);
            writer.WriteString("configError", overview.Config.LoadError);

            writer.WriteStartArray("events");
            foreach (var definition in HookEventCatalog.List())
            {
                writer.WriteStartObject();
                writer.WriteString("id", definition.Id);
                writer.WriteString("label", definition.Label);
                writer.WriteString("description", definition.Description);
                writer.WriteBoolean("canBlock", definition.CanBlock);
                writer.WriteBoolean("canRewriteInput", definition.CanRewriteInput);
                writer.WriteBoolean("canAddContext", definition.CanAddContext);
                writer.WriteBoolean("wired", definition.Wired);
                writer.WriteEndObject();
            }

            writer.WriteEndArray();

            writer.WriteStartArray("builtins");
            foreach (var builtin in BuiltinHookHandlers.List())
            {
                writer.WriteStartObject();
                writer.WriteString("id", builtin.Id);
                writer.WriteString("label", builtin.Label);
                writer.WriteString("argumentLabel", builtin.ArgumentLabel);
                writer.WriteString("description", builtin.Description);
                writer.WriteBoolean("requiresArgument", builtin.RequiresArgument);
                writer.WriteEndObject();
            }

            writer.WriteEndArray();

            writer.WriteStartArray("hooks");
            foreach (var hook in overview.EffectiveHooks)
            {
                WriteHook(writer, hook);
            }

            writer.WriteEndArray();

            writer.WriteStartArray("rules");
            foreach (var rule in overview.EffectiveRules)
            {
                WriteRule(writer, rule);
            }

            writer.WriteEndArray();

            writer.WriteStartArray("plugins");
            foreach (var entry in overview.Plugins)
            {
                WritePlugin(writer, entry);
            }

            writer.WriteEndArray();

            WriteStringArray(writer, "pluginRoots", overview.PluginRoots);
            WriteStringArray(writer, "pluginErrors", overview.PluginErrors);
            WriteStringArray(writer, "errors", errors);
        });
    }

    public static string MutationResult(
        string requestId,
        string type,
        ExtensionMutationResult result
    )
    {
        return Envelope(type, requestId, writer =>
        {
            writer.WriteBoolean("ok", result.Ok);
            WriteStringArray(writer, "errors", result.Errors);
        });
    }

    public static string HookTestResult(string requestId, HookRunResult run)
    {
        return Envelope("extensions_hook_test_result", requestId, writer =>
        {
            writer.WriteString("hookId", run.HookId);
            writer.WriteString("event", run.Event);
            writer.WriteString("status", StatusToText(run.Status));
            writer.WriteString("outcome", OutcomeToText(run.Outcome));
            writer.WriteString("reason", run.Reason);
            writer.WriteString("additionalContext", run.AdditionalContext);
            writer.WriteNumber("exitCode", run.ExitCode);
            writer.WriteNumber("durationMs", run.DurationMs);
            writer.WriteString("stderr", run.Stderr);
            writer.WriteString("updatedInput", run.UpdatedInputJson);
        });
    }

    public static string Error(string requestId, string type, string message)
    {
        return Envelope(type, requestId, writer =>
        {
            writer.WriteBoolean("ok", false);
            writer.WriteStartArray("errors");
            writer.WriteStringValue(message);
            writer.WriteEndArray();
        });
    }

    public static string StatusToText(HookRunStatus status)
    {
        return status switch
        {
            HookRunStatus.Completed => "completed",
            HookRunStatus.Blocked => "blocked",
            HookRunStatus.Failed => "failed",
            HookRunStatus.TimedOut => "timeout",
            HookRunStatus.Canceled => "canceled",
            HookRunStatus.Unsupported => "unsupported",
            _ => "not-run"
        };
    }

    public static string OutcomeToText(HookOutcome outcome)
    {
        return outcome switch
        {
            HookOutcome.Allow => "allow",
            HookOutcome.Ask => "ask",
            HookOutcome.Deny => "deny",
            _ => "none"
        };
    }

    private static void WriteApprovals(Utf8JsonWriter writer, ApprovalState approvals)
    {
        writer.WriteString("approvalError", approvals.LoadError);

        writer.WriteStartArray("pendingApprovals");
        foreach (var entry in approvals.Pending)
        {
            writer.WriteStartObject();
            writer.WriteString("id", entry.Id);
            writer.WriteString("event", entry.Event);
            writer.WriteString("target", entry.Target);
            writer.WriteString("reason", entry.Reason);
            writer.WriteString("hookId", entry.HookId);
            writer.WriteString("requestedUtc", entry.RequestedUtc);
            writer.WriteNumber("requestCount", entry.RequestCount);
            writer.WriteEndObject();
        }

        writer.WriteEndArray();

        writer.WriteStartArray("approvalGrants");
        foreach (var grant in approvals.Grants)
        {
            writer.WriteStartObject();
            writer.WriteString("id", grant.Id);
            writer.WriteString("event", grant.Event);
            writer.WriteString("target", grant.Target);
            writer.WriteString("scope", grant.Scope == ApprovalScope.Session ? "session" : "once");
            writer.WriteString("grantedUtc", grant.GrantedUtc);
            writer.WriteString("expiresUtc", grant.ExpiresUtc);
            writer.WriteEndObject();
        }

        writer.WriteEndArray();
    }

    public static string ApprovalResult(string requestId, string type, ApprovalMutationResult result)
    {
        return Envelope(type, requestId, writer =>
        {
            writer.WriteBoolean("ok", result.Ok);
            writer.WriteStartArray("errors");
            if (result.Error.Length > 0)
            {
                writer.WriteStringValue(result.Error);
            }

            writer.WriteEndArray();
        });
    }

    private static void WriteHook(Utf8JsonWriter writer, HookDefinition hook)
    {
        writer.WriteStartObject();
        writer.WriteString("id", hook.Id);
        writer.WriteString("event", hook.Event);
        writer.WriteString("handler", ExtensionConfigJson.HandlerToText(hook.Handler));
        writer.WriteString("command", hook.Command);
        writer.WriteString("builtinId", hook.BuiltinId);
        writer.WriteString("builtinArgument", hook.BuiltinArgument);
        writer.WriteString("toolPattern", hook.Matcher.ToolPattern);
        writer.WriteString("pathGlob", hook.Matcher.PathGlob);
        writer.WriteNumber("timeoutMs", hook.TimeoutMs);
        writer.WriteString("failureMode", hook.FailureMode == HookFailureMode.Closed ? "closed" : "open");
        writer.WriteBoolean("enabled", hook.Enabled);
        writer.WriteString("source", hook.Source);
        writer.WriteString("description", hook.Description);
        writer.WriteEndObject();
    }

    private static void WriteRule(Utf8JsonWriter writer, ExtensionRule rule)
    {
        writer.WriteStartObject();
        writer.WriteString("id", rule.Id);
        writer.WriteString("title", rule.Title);
        writer.WriteString("body", rule.Body);
        writer.WriteString("scope", rule.Scope);
        writer.WriteString("pathGlob", rule.PathGlob);
        writer.WriteNumber("priority", rule.Priority);
        writer.WriteBoolean("enabled", rule.Enabled);
        writer.WriteString("source", rule.Source);
        writer.WriteEndObject();
    }

    private static void WritePlugin(Utf8JsonWriter writer, PluginEntry entry)
    {
        var manifest = entry.Manifest;
        writer.WriteStartObject();
        writer.WriteString("id", manifest.Id);
        writer.WriteString("name", manifest.Name);
        writer.WriteString("version", manifest.Version);
        writer.WriteString("description", manifest.Description);
        writer.WriteString("author", manifest.Author);
        writer.WriteString("license", manifest.License);
        writer.WriteString("homepage", manifest.Homepage);
        writer.WriteString("rootPath", manifest.RootPath);
        writer.WriteBoolean("enabled", entry.Enabled);
        writer.WriteBoolean("valid", manifest.IsValid);
        writer.WriteNumber("hookCount", manifest.Hooks.Count);
        writer.WriteNumber("ruleCount", manifest.Rules.Count);
        WriteStringArray(writer, "errors", manifest.Errors);
        writer.WriteEndObject();
    }

    private static void WriteStringArray(Utf8JsonWriter writer, string name, IReadOnlyList<string> values)
    {
        writer.WriteStartArray(name);
        foreach (var value in values)
        {
            writer.WriteStringValue(value);
        }

        writer.WriteEndArray();
    }
}
