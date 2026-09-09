namespace Omnux.Middleware;

/// <summary>입력 검증 결과. 실패 사유를 전부 모아 한 번에 돌려준다.</summary>
internal sealed record ExtensionValidationResult(IReadOnlyList<string> Errors)
{
    public bool Ok => Errors.Count == 0;

    public static readonly ExtensionValidationResult Valid = new(Array.Empty<string>());
}

/// <summary>
/// 확장 설정 변경 규칙(순수 함수). 저장소·전송과 분리해 검증과 목록 갱신만 담당한다.
/// 플러그인이 기여한 항목은 사용자 설정에서 직접 수정하지 않는다.
/// </summary>
internal static class ExtensionMutationPolicy
{
    public const int MaxHooks = 128;
    public const int MaxRules = 128;
    public const int MaxPluginRoots = 16;

    public static ExtensionValidationResult ValidateHook(HookDefinition hook)
    {
        var errors = new List<string>();

        if (!PluginManifestParser.IsValidId(hook.Id))
        {
            errors.Add("훅 id 는 영숫자·`-`·`_`·`.` 만 쓸 수 있고 1~64자여야 한다");
        }

        var eventDefinition = HookEventCatalog.Find(hook.Event);
        if (eventDefinition == null)
        {
            errors.Add($"알 수 없는 이벤트: {hook.Event}");
        }

        switch (hook.Handler)
        {
            case HookHandlerKind.Command when hook.Command.Trim().Length == 0:
                errors.Add("command 핸들러에는 실행할 명령이 필요하다");
                break;
            case HookHandlerKind.Builtin:
                var builtin = BuiltinHookHandlers.Find(hook.BuiltinId);
                if (builtin == null)
                {
                    errors.Add($"알 수 없는 내장 훅: {hook.BuiltinId}");
                }
                else if (builtin.RequiresArgument && hook.BuiltinArgument.Trim().Length == 0)
                {
                    errors.Add($"내장 훅 {builtin.Id} 에는 {builtin.ArgumentLabel} 이(가) 필요하다");
                }

                break;
            case HookHandlerKind.Prompt:
            case HookHandlerKind.Agent:
                errors.Add($"{ExtensionConfigJson.HandlerToText(hook.Handler)} 핸들러는 아직 실행 경로가 없다");
                break;
            case HookHandlerKind.Unknown:
                errors.Add("핸들러 종류를 지정해야 한다");
                break;
            case HookHandlerKind.Command:
            default:
                break;
        }

        if (hook.Matcher.ToolPattern.Length > HookMatchPolicy.MaxPatternChars
            || hook.Matcher.PathGlob.Length > HookMatchPolicy.MaxPatternChars)
        {
            errors.Add($"매처 패턴은 {HookMatchPolicy.MaxPatternChars}자를 넘을 수 없다");
        }

        if (eventDefinition != null
            && !eventDefinition.CanBlock
            && hook.FailureMode == HookFailureMode.Closed)
        {
            errors.Add($"{eventDefinition.Id} 는 차단할 수 없어 실패 시 차단을 설정할 수 없다");
        }

        return errors.Count == 0 ? ExtensionValidationResult.Valid : new ExtensionValidationResult(errors);
    }

    public static ExtensionValidationResult ValidateRule(ExtensionRule rule)
    {
        var errors = new List<string>();

        if (!PluginManifestParser.IsValidId(rule.Id))
        {
            errors.Add("규칙 id 는 영숫자·`-`·`_`·`.` 만 쓸 수 있고 1~64자여야 한다");
        }

        if (rule.Body.Trim().Length == 0)
        {
            errors.Add("규칙 본문이 비어 있다");
        }

        if (rule.Body.Length > ExtensionRule.MaxBodyChars)
        {
            errors.Add($"규칙 본문은 {ExtensionRule.MaxBodyChars}자를 넘을 수 없다");
        }

        if (rule.PathGlob.Length > HookMatchPolicy.MaxPatternChars)
        {
            errors.Add($"경로 glob 은 {HookMatchPolicy.MaxPatternChars}자를 넘을 수 없다");
        }

        return errors.Count == 0 ? ExtensionValidationResult.Valid : new ExtensionValidationResult(errors);
    }

    /// <summary>훅 upsert. 플러그인 기여 항목과 같은 id 는 거부한다.</summary>
    public static ExtensionValidationResult UpsertHook(
        List<HookDefinition> hooks,
        HookDefinition hook,
        IReadOnlyCollection<string> pluginHookIds
    )
    {
        // 소유권을 먼저 판정한다. 플러그인 기여 id 는 `plugin:local` 형식이라
        // 사용자 id 규칙 위반으로 먼저 걸리면 실제 사유가 가려진다.
        if (pluginHookIds.Contains(hook.Id))
        {
            return new ExtensionValidationResult(
                new[] { $"{hook.Id} 는 플러그인이 기여한 훅이라 사용자 설정에서 수정할 수 없다" }
            );
        }

        var validation = ValidateHook(hook);
        if (!validation.Ok)
        {
            return validation;
        }

        var index = hooks.FindIndex(existing => string.Equals(existing.Id, hook.Id, StringComparison.Ordinal));
        if (index >= 0)
        {
            hooks[index] = hook with { Source = string.Empty };
            return ExtensionValidationResult.Valid;
        }

        if (hooks.Count >= MaxHooks)
        {
            return new ExtensionValidationResult(new[] { $"훅은 최대 {MaxHooks}개까지 저장할 수 있다" });
        }

        hooks.Add(hook with { Source = string.Empty });
        return ExtensionValidationResult.Valid;
    }

    /// <summary>규칙 upsert.</summary>
    public static ExtensionValidationResult UpsertRule(
        List<ExtensionRule> rules,
        ExtensionRule rule,
        IReadOnlyCollection<string> pluginRuleIds
    )
    {
        if (pluginRuleIds.Contains(rule.Id))
        {
            return new ExtensionValidationResult(
                new[] { $"{rule.Id} 는 플러그인이 기여한 규칙이라 사용자 설정에서 수정할 수 없다" }
            );
        }

        var validation = ValidateRule(rule);
        if (!validation.Ok)
        {
            return validation;
        }

        var index = rules.FindIndex(existing => string.Equals(existing.Id, rule.Id, StringComparison.Ordinal));
        if (index >= 0)
        {
            rules[index] = rule with { Source = string.Empty };
            return ExtensionValidationResult.Valid;
        }

        if (rules.Count >= MaxRules)
        {
            return new ExtensionValidationResult(new[] { $"규칙은 최대 {MaxRules}개까지 저장할 수 있다" });
        }

        rules.Add(rule with { Source = string.Empty });
        return ExtensionValidationResult.Valid;
    }

    public static bool Remove<T>(List<T> items, Func<T, string> idSelector, string id)
    {
        var index = items.FindIndex(item => string.Equals(idSelector(item), id, StringComparison.Ordinal));
        if (index < 0)
        {
            return false;
        }

        items.RemoveAt(index);
        return true;
    }

    public static ExtensionValidationResult AddPluginRoot(List<string> roots, string path)
    {
        var trimmed = (path ?? string.Empty).Trim();
        if (trimmed.Length == 0)
        {
            return new ExtensionValidationResult(new[] { "폴더 경로가 비어 있다" });
        }

        string full;
        try
        {
            full = Path.GetFullPath(trimmed);
        }
        catch (Exception exception)
        {
            return new ExtensionValidationResult(new[] { $"경로를 해석하지 못했다: {exception.Message}" });
        }

        if (!Directory.Exists(full))
        {
            return new ExtensionValidationResult(new[] { $"폴더가 없다: {full}" });
        }

        if (roots.Contains(full, StringComparer.Ordinal))
        {
            return ExtensionValidationResult.Valid;
        }

        if (roots.Count >= MaxPluginRoots)
        {
            return new ExtensionValidationResult(new[] { $"플러그인 폴더는 최대 {MaxPluginRoots}개까지 등록할 수 있다" });
        }

        roots.Add(full);
        return ExtensionValidationResult.Valid;
    }
}
