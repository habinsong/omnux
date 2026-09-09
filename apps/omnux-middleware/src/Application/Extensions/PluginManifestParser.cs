using System.Text.Json;

namespace Omnux.Middleware;

/// <summary>
/// 플러그인 매니페스트 해석. 잘못된 항목을 조용히 버리지 않고 오류 목록으로 남긴다.
/// 기여된 훅·규칙의 source 에는 항상 플러그인 ID 를 채워 사용자 정의와 구분한다.
/// </summary>
internal static class PluginManifestParser
{
    public const string ManifestFileName = "omnux-plugin.json";
    public const int MaxContributions = 64;

    public static PluginManifest Parse(string? text, string rootPath)
    {
        var errors = new List<string>();
        var content = (text ?? string.Empty).Trim();
        if (content.Length == 0)
        {
            errors.Add("매니페스트가 비어 있다");
            return Invalid(rootPath, errors);
        }

        JsonDocument document;
        try
        {
            document = JsonDocument.Parse(content);
        }
        catch (JsonException exception)
        {
            errors.Add($"JSON 해석 실패: {exception.Message}");
            return Invalid(rootPath, errors);
        }

        using (document)
        {
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object)
            {
                errors.Add("최상위가 객체가 아니다");
                return Invalid(rootPath, errors);
            }

            var id = ExtensionConfigJson.ReadString(root, "id");
            if (id.Length == 0)
            {
                errors.Add("id 가 없다");
            }
            else if (!IsValidId(id))
            {
                errors.Add($"id 에 허용되지 않는 문자가 있다: {id}");
            }

            var version = ExtensionConfigJson.ReadString(root, "version");
            if (version.Length == 0)
            {
                errors.Add("version 이 없다");
            }

            var name = ExtensionConfigJson.ReadString(root, "name");
            var hooks = ReadHooks(root, id, errors);
            var rules = ReadRules(root, id, errors);

            return new PluginManifest(
                id,
                name.Length > 0 ? name : id,
                version,
                ExtensionConfigJson.ReadString(root, "description"),
                ExtensionConfigJson.ReadString(root, "author"),
                ExtensionConfigJson.ReadString(root, "license"),
                ExtensionConfigJson.ReadString(root, "homepage"),
                rootPath,
                hooks,
                rules,
                errors
            );
        }
    }

    public static bool IsValidId(string id)
    {
        if (id.Length == 0 || id.Length > 64)
        {
            return false;
        }

        foreach (var character in id)
        {
            var allowed = char.IsAsciiLetterOrDigit(character) || character == '-' || character == '_' || character == '.';
            if (!allowed)
            {
                return false;
            }
        }

        return true;
    }

    private static IReadOnlyList<HookDefinition> ReadHooks(
        JsonElement root,
        string pluginId,
        ICollection<string> errors
    )
    {
        var hooks = new List<HookDefinition>();
        if (!root.TryGetProperty("hooks", out var array) || array.ValueKind != JsonValueKind.Array)
        {
            return hooks;
        }

        var index = 0;
        foreach (var element in array.EnumerateArray())
        {
            if (hooks.Count >= MaxContributions)
            {
                errors.Add($"훅 기여가 상한 {MaxContributions}개를 넘어 이후 항목을 무시했다");
                break;
            }

            if (element.ValueKind != JsonValueKind.Object)
            {
                errors.Add($"hooks[{index}] 이 객체가 아니다");
                index++;
                continue;
            }

            var hook = ExtensionConfigJson.ReadHook(element, defaultSource: pluginId);
            if (hook == null)
            {
                errors.Add($"hooks[{index}] 에 id 또는 event 가 없다");
                index++;
                continue;
            }

            if (!HookEventCatalog.IsKnown(hook.Event))
            {
                errors.Add($"hooks[{index}] 의 알 수 없는 이벤트: {hook.Event}");
                index++;
                continue;
            }

            hooks.Add(hook with { Id = Qualify(pluginId, hook.Id), Source = pluginId });
            index++;
        }

        return hooks;
    }

    private static IReadOnlyList<ExtensionRule> ReadRules(
        JsonElement root,
        string pluginId,
        ICollection<string> errors
    )
    {
        var rules = new List<ExtensionRule>();
        if (!root.TryGetProperty("rules", out var array) || array.ValueKind != JsonValueKind.Array)
        {
            return rules;
        }

        var index = 0;
        foreach (var element in array.EnumerateArray())
        {
            if (rules.Count >= MaxContributions)
            {
                errors.Add($"규칙 기여가 상한 {MaxContributions}개를 넘어 이후 항목을 무시했다");
                break;
            }

            if (element.ValueKind != JsonValueKind.Object)
            {
                errors.Add($"rules[{index}] 이 객체가 아니다");
                index++;
                continue;
            }

            var rule = ExtensionConfigJson.ReadRule(element, defaultSource: pluginId);
            if (rule == null)
            {
                errors.Add($"rules[{index}] 에 id 가 없다");
                index++;
                continue;
            }

            rules.Add(rule with { Id = Qualify(pluginId, rule.Id), Source = pluginId });
            index++;
        }

        return rules;
    }

    public static string Qualify(string pluginId, string localId)
    {
        return pluginId.Length == 0 ? localId : $"{pluginId}:{localId}";
    }

    private static PluginManifest Invalid(string rootPath, IReadOnlyList<string> errors)
    {
        return new PluginManifest(
            string.Empty,
            string.Empty,
            string.Empty,
            string.Empty,
            string.Empty,
            string.Empty,
            string.Empty,
            rootPath,
            Array.Empty<HookDefinition>(),
            Array.Empty<ExtensionRule>(),
            errors
        );
    }
}
