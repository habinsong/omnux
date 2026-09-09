using System.Text;
using System.Text.Json;

namespace Omnux.Middleware;

/// <summary>설정 문서 해석 결과. 손상·미래 버전을 빈 설정과 구분한다.</summary>
internal sealed record ExtensionConfigParseResult(
    ExtensionConfigSnapshot Snapshot,
    bool Damaged,
    bool UnsupportedVersion,
    string Error
);

/// <summary>
/// 확장 설정 문서의 해석·생성. 파일 I/O 없이 문자열만 다룬다.
/// 손상된 문서를 빈 설정으로 바꾸지 않고 오류를 그대로 전달한다.
/// </summary>
internal static class ExtensionConfigJson
{
    public static ExtensionConfigParseResult Parse(string? text)
    {
        var content = (text ?? string.Empty).Trim();
        if (content.Length == 0)
        {
            return new ExtensionConfigParseResult(
                ExtensionConfigSnapshot.Empty,
                Damaged: false,
                UnsupportedVersion: false,
                Error: string.Empty
            );
        }

        JsonDocument document;
        try
        {
            document = JsonDocument.Parse(content);
        }
        catch (JsonException exception)
        {
            return new ExtensionConfigParseResult(
                ExtensionConfigSnapshot.Empty with { LoadError = exception.Message },
                Damaged: true,
                UnsupportedVersion: false,
                Error: exception.Message
            );
        }

        using (document)
        {
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object)
            {
                const string error = "설정 최상위가 객체가 아니다";
                return new ExtensionConfigParseResult(
                    ExtensionConfigSnapshot.Empty with { LoadError = error },
                    Damaged: true,
                    UnsupportedVersion: false,
                    Error: error
                );
            }

            var version = ReadInt(root, "version", ExtensionConfigSnapshot.CurrentVersion);
            if (version > ExtensionConfigSnapshot.CurrentVersion)
            {
                var error = $"지원하지 않는 설정 버전 {version}";
                return new ExtensionConfigParseResult(
                    ExtensionConfigSnapshot.Empty with { Version = version, LoadError = error },
                    Damaged: false,
                    UnsupportedVersion: true,
                    Error: error
                );
            }

            var snapshot = new ExtensionConfigSnapshot(
                version,
                ReadHooks(root),
                ReadRules(root),
                ReadStringList(root, "disabledPluginIds"),
                ReadStringList(root, "pluginRoots"),
                ReadString(root, "updatedUtc"),
                Exists: true,
                LoadError: string.Empty
            );

            return new ExtensionConfigParseResult(
                snapshot,
                Damaged: false,
                UnsupportedVersion: false,
                Error: string.Empty
            );
        }
    }

    public static string Serialize(ExtensionConfigSnapshot snapshot)
    {
        using var buffer = new MemoryStream();
        using (var writer = new Utf8JsonWriter(buffer, new JsonWriterOptions { Indented = true }))
        {
            writer.WriteStartObject();
            writer.WriteNumber("version", ExtensionConfigSnapshot.CurrentVersion);
            writer.WriteString("updatedUtc", snapshot.UpdatedUtc);

            writer.WriteStartArray("hooks");
            foreach (var hook in snapshot.Hooks)
            {
                WriteHook(writer, hook);
            }

            writer.WriteEndArray();

            writer.WriteStartArray("rules");
            foreach (var rule in snapshot.Rules)
            {
                WriteRule(writer, rule);
            }

            writer.WriteEndArray();

            WriteStringArray(writer, "disabledPluginIds", snapshot.DisabledPluginIds);
            WriteStringArray(writer, "pluginRoots", snapshot.PluginRoots);
            writer.WriteEndObject();
        }

        return Encoding.UTF8.GetString(buffer.ToArray());
    }

    private static void WriteHook(Utf8JsonWriter writer, HookDefinition hook)
    {
        writer.WriteStartObject();
        writer.WriteString("id", hook.Id);
        writer.WriteString("event", hook.Event);
        writer.WriteString("handler", HandlerToText(hook.Handler));
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

    private static void WriteStringArray(Utf8JsonWriter writer, string name, IReadOnlyList<string> values)
    {
        writer.WriteStartArray(name);
        foreach (var value in values)
        {
            writer.WriteStringValue(value);
        }

        writer.WriteEndArray();
    }

    internal static IReadOnlyList<HookDefinition> ReadHooks(JsonElement root)
    {
        var hooks = new List<HookDefinition>();
        if (!root.TryGetProperty("hooks", out var array) || array.ValueKind != JsonValueKind.Array)
        {
            return hooks;
        }

        foreach (var element in array.EnumerateArray())
        {
            if (element.ValueKind != JsonValueKind.Object)
            {
                continue;
            }

            var hook = ReadHook(element, defaultSource: string.Empty);
            if (hook != null)
            {
                hooks.Add(hook);
            }
        }

        return hooks;
    }

    internal static HookDefinition? ReadHook(JsonElement element, string defaultSource)
    {
        var id = ReadString(element, "id");
        var eventId = HookEventCatalog.Normalize(ReadString(element, "event"));
        if (id.Length == 0 || eventId.Length == 0)
        {
            return null;
        }

        var timeout = ReadInt(element, "timeoutMs", HookDefinition.DefaultTimeoutMs);
        var source = ReadString(element, "source");
        return new HookDefinition(
            id,
            eventId,
            ParseHandler(ReadString(element, "handler")),
            ReadString(element, "command"),
            ReadString(element, "builtinId").ToLowerInvariant(),
            ReadString(element, "builtinArgument"),
            new HookMatcher(ReadString(element, "toolPattern"), ReadString(element, "pathGlob")),
            HookCommandRunner.ClampTimeout(timeout),
            string.Equals(ReadString(element, "failureMode"), "closed", StringComparison.OrdinalIgnoreCase)
                ? HookFailureMode.Closed
                : HookFailureMode.Open,
            ReadBool(element, "enabled", defaultValue: true),
            source.Length > 0 ? source : defaultSource,
            ReadString(element, "description")
        );
    }

    internal static IReadOnlyList<ExtensionRule> ReadRules(JsonElement root)
    {
        var rules = new List<ExtensionRule>();
        if (!root.TryGetProperty("rules", out var array) || array.ValueKind != JsonValueKind.Array)
        {
            return rules;
        }

        foreach (var element in array.EnumerateArray())
        {
            if (element.ValueKind != JsonValueKind.Object)
            {
                continue;
            }

            var rule = ReadRule(element, defaultSource: string.Empty);
            if (rule != null)
            {
                rules.Add(rule);
            }
        }

        return rules;
    }

    internal static ExtensionRule? ReadRule(JsonElement element, string defaultSource)
    {
        var id = ReadString(element, "id");
        if (id.Length == 0)
        {
            return null;
        }

        var scope = ReadString(element, "scope").ToLowerInvariant();
        var source = ReadString(element, "source");
        return new ExtensionRule(
            id,
            ReadString(element, "title"),
            ReadString(element, "body"),
            scope == ExtensionRule.ScopeProject ? ExtensionRule.ScopeProject : ExtensionRule.ScopeGlobal,
            ReadString(element, "pathGlob"),
            ReadInt(element, "priority", 100),
            ReadBool(element, "enabled", defaultValue: true),
            source.Length > 0 ? source : defaultSource
        );
    }

    internal static HookHandlerKind ParseHandler(string? handler)
    {
        return (handler ?? string.Empty).Trim().ToLowerInvariant() switch
        {
            "command" => HookHandlerKind.Command,
            "builtin" => HookHandlerKind.Builtin,
            "prompt" => HookHandlerKind.Prompt,
            "agent" => HookHandlerKind.Agent,
            _ => HookHandlerKind.Unknown
        };
    }

    internal static string HandlerToText(HookHandlerKind handler)
    {
        return handler switch
        {
            HookHandlerKind.Command => "command",
            HookHandlerKind.Builtin => "builtin",
            HookHandlerKind.Prompt => "prompt",
            HookHandlerKind.Agent => "agent",
            _ => "unknown"
        };
    }

    internal static string ReadString(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var value))
        {
            return string.Empty;
        }

        return value.ValueKind == JsonValueKind.String ? (value.GetString() ?? string.Empty).Trim() : string.Empty;
    }

    internal static int ReadInt(JsonElement element, string propertyName, int defaultValue)
    {
        if (!element.TryGetProperty(propertyName, out var value))
        {
            return defaultValue;
        }

        return value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var parsed)
            ? parsed
            : defaultValue;
    }

    internal static bool ReadBool(JsonElement element, string propertyName, bool defaultValue)
    {
        if (!element.TryGetProperty(propertyName, out var value))
        {
            return defaultValue;
        }

        return value.ValueKind switch
        {
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            _ => defaultValue
        };
    }

    internal static IReadOnlyList<string> ReadStringList(JsonElement element, string propertyName)
    {
        var values = new List<string>();
        if (!element.TryGetProperty(propertyName, out var array) || array.ValueKind != JsonValueKind.Array)
        {
            return values;
        }

        foreach (var item in array.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.String)
            {
                continue;
            }

            var text = (item.GetString() ?? string.Empty).Trim();
            if (text.Length > 0)
            {
                values.Add(text);
            }
        }

        return values;
    }
}
