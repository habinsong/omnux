namespace Omnux.Middleware;

/// <summary>확장 화면 1회 조회 결과. 사용자 설정과 플러그인 기여를 구분해 담는다.</summary>
internal sealed record ExtensionOverview(
    ExtensionConfigSnapshot Config,
    IReadOnlyList<PluginEntry> Plugins,
    IReadOnlyList<string> PluginRoots,
    IReadOnlyList<string> PluginErrors,
    IReadOnlyList<HookDefinition> EffectiveHooks,
    IReadOnlyList<ExtensionRule> EffectiveRules,
    string ConfigPath
);

/// <summary>변경 요청 결과. 검증 오류와 저장 실패를 모두 호출자에게 전달한다.</summary>
internal sealed record ExtensionMutationResult(
    bool Ok,
    IReadOnlyList<string> Errors,
    ExtensionOverview Overview
);

/// <summary>
/// 확장(훅·플러그인·규칙) 조율자. 저장·탐색·실행을 각각의 타입에 위임하고
/// 여기서는 유효 목록 계산과 요청 처리 순서만 담당한다.
/// </summary>
internal sealed class ExtensionApplicationService : IHookDefinitionSource
{
    private readonly ExtensionConfigStore _store;
    private readonly ApprovalStore _approvalStore;
    private readonly Func<string> _workingDirectoryProvider;
    private readonly Func<string> _defaultPluginRootProvider;
    private readonly object _cacheLock = new();

    private ExtensionOverview? _cached;
    private string _cachedStamp = string.Empty;

    /// <param name="defaultPluginRootProvider">
    /// 항상 검사하는 기본 플러그인 폴더. 검사에서 사용자 개인 상태 경로를 쓰지 않도록 주입한다.
    /// </param>
    public ExtensionApplicationService(
        ExtensionConfigStore? store = null,
        Func<string>? workingDirectoryProvider = null,
        Func<string>? defaultPluginRootProvider = null,
        ApprovalStore? approvalStore = null
    )
    {
        _store = store ?? new ExtensionConfigStore();
        _approvalStore = approvalStore ?? new ApprovalStore();
        _workingDirectoryProvider = workingDirectoryProvider
            ?? (() => DefaultStatePathResolver.CreateDefault().WorkspaceRootDir);
        _defaultPluginRootProvider = defaultPluginRootProvider ?? PluginScanner.ResolveDefaultRoot;
    }

    public string ConfigPath => _store.Path;

    /// <summary>승인 상태. 설정 캐시와 수명이 달라 매번 저장소에서 읽는다.</summary>
    public ApprovalState GetApprovals() => _approvalStore.Read();

    public string ApprovalPath => _approvalStore.Path;

    public ApprovalMutationResult ApproveRequest(string pendingId, ApprovalScope scope, int sessionMinutes)
        => _approvalStore.Approve(pendingId, scope, sessionMinutes, DateTimeOffset.UtcNow);

    public ApprovalMutationResult RejectRequest(string pendingId)
        => _approvalStore.Reject(pendingId, DateTimeOffset.UtcNow);

    public ApprovalMutationResult RevokeApproval(string grantId)
        => _approvalStore.RevokeGrant(grantId, DateTimeOffset.UtcNow);

    public ExtensionOverview GetOverview()
    {
        lock (_cacheLock)
        {
            var stamp = ComputeStamp();
            if (_cached != null && string.Equals(stamp, _cachedStamp, StringComparison.Ordinal))
            {
                return _cached;
            }

            var overview = BuildOverview();
            _cached = overview;
            _cachedStamp = stamp;
            return overview;
        }
    }

    /// <summary>플러그인 폴더 내용 변경까지 반영하는 강제 재조회.</summary>
    public ExtensionOverview Refresh()
    {
        lock (_cacheLock)
        {
            var overview = BuildOverview();
            _cached = overview;
            _cachedStamp = ComputeStamp();
            return overview;
        }
    }

    public IReadOnlyList<HookDefinition> GetHooks() => GetOverview().EffectiveHooks;

    public string GetWorkingDirectory()
    {
        try
        {
            return _workingDirectoryProvider();
        }
        catch (Exception)
        {
            return Directory.GetCurrentDirectory();
        }
    }

    public ExtensionRuleSelection ResolveRules(string scope, string? targetPath, int budgetChars)
    {
        return ExtensionRuleResolver.Resolve(GetOverview().EffectiveRules, scope, targetPath, budgetChars);
    }

    public ExtensionMutationResult SaveHook(HookDefinition hook)
    {
        return Mutate((hooks, _, _, overview) =>
            ExtensionMutationPolicy.UpsertHook(hooks, hook, PluginHookIds(overview)));
    }

    public ExtensionMutationResult DeleteHook(string hookId)
    {
        return Mutate((hooks, _, _, _) =>
            ExtensionMutationPolicy.Remove(hooks, hook => hook.Id, hookId)
                ? ExtensionValidationResult.Valid
                : new ExtensionValidationResult(new[] { $"훅을 찾지 못했다: {hookId}" }));
    }

    public ExtensionMutationResult SetHookEnabled(string hookId, bool enabled)
    {
        return Mutate((hooks, _, _, _) =>
        {
            var index = hooks.FindIndex(hook => string.Equals(hook.Id, hookId, StringComparison.Ordinal));
            if (index < 0)
            {
                return new ExtensionValidationResult(new[] { $"훅을 찾지 못했다: {hookId}" });
            }

            hooks[index] = hooks[index] with { Enabled = enabled };
            return ExtensionValidationResult.Valid;
        });
    }

    public ExtensionMutationResult SaveRule(ExtensionRule rule)
    {
        return Mutate((_, rules, _, overview) =>
            ExtensionMutationPolicy.UpsertRule(rules, rule, PluginRuleIds(overview)));
    }

    public ExtensionMutationResult DeleteRule(string ruleId)
    {
        return Mutate((_, rules, _, _) =>
            ExtensionMutationPolicy.Remove(rules, rule => rule.Id, ruleId)
                ? ExtensionValidationResult.Valid
                : new ExtensionValidationResult(new[] { $"규칙을 찾지 못했다: {ruleId}" }));
    }

    public ExtensionMutationResult SetPluginEnabled(string pluginId, bool enabled)
    {
        var normalized = (pluginId ?? string.Empty).Trim();
        return Mutate((_, _, config, _) =>
        {
            if (normalized.Length == 0)
            {
                return new ExtensionValidationResult(new[] { "플러그인 id 가 비어 있다" });
            }

            var disabled = new List<string>(config.DisabledPluginIds);
            var contains = disabled.Contains(normalized, StringComparer.Ordinal);
            if (enabled && contains)
            {
                disabled.RemoveAll(id => string.Equals(id, normalized, StringComparison.Ordinal));
            }
            else if (!enabled && !contains)
            {
                disabled.Add(normalized);
            }

            config.DisabledPluginIds = disabled;
            return ExtensionValidationResult.Valid;
        });
    }

    public ExtensionMutationResult AddPluginRoot(string path)
    {
        return Mutate((_, _, config, _) =>
        {
            var roots = new List<string>(config.PluginRoots);
            var result = ExtensionMutationPolicy.AddPluginRoot(roots, path);
            if (result.Ok)
            {
                config.PluginRoots = roots;
            }

            return result;
        });
    }

    public ExtensionMutationResult RemovePluginRoot(string path)
    {
        var normalized = (path ?? string.Empty).Trim();
        return Mutate((_, _, config, _) =>
        {
            var roots = new List<string>(config.PluginRoots);
            if (!ExtensionMutationPolicy.Remove(roots, root => root, normalized))
            {
                return new ExtensionValidationResult(new[] { $"등록되지 않은 폴더다: {normalized}" });
            }

            config.PluginRoots = roots;
            return ExtensionValidationResult.Valid;
        });
    }

    /// <summary>훅 1개를 실제로 실행해 결과를 돌려준다. 모의 성공을 만들지 않는다.</summary>
    public async Task<HookRunResult> TestHookAsync(
        string hookId,
        HookEventInput sample,
        CancellationToken cancellationToken
    )
    {
        var overview = GetOverview();
        HookDefinition? target = null;
        foreach (var hook in overview.EffectiveHooks)
        {
            if (string.Equals(hook.Id, hookId, StringComparison.Ordinal))
            {
                target = hook;
                break;
            }
        }

        if (target == null)
        {
            return new HookRunResult(
                hookId,
                HookEventCatalog.Normalize(sample.Event),
                HookRunStatus.NotRun,
                HookOutcome.None,
                $"훅을 찾지 못했다: {hookId}",
                string.Empty,
                string.Empty,
                ExitCode: -1,
                DurationMs: 0,
                Stderr: string.Empty
            );
        }

        // 비활성 훅도 시험 실행에서는 실제로 돌린다. 저장된 활성 상태는 바꾸지 않는다.
        var single = new SingleHookSource(target with { Enabled = true }, GetWorkingDirectory());
        var dispatcher = new HookDispatcher(single);
        var result = await dispatcher
            .DispatchAsync(sample with { Event = target.Event }, cancellationToken)
            .ConfigureAwait(false);

        return result.Runs.Count > 0
            ? result.Runs[0]
            : new HookRunResult(
                target.Id,
                target.Event,
                HookRunStatus.NotRun,
                HookOutcome.None,
                "매처 조건에 맞지 않아 실행되지 않았다",
                string.Empty,
                string.Empty,
                ExitCode: -1,
                DurationMs: 0,
                Stderr: string.Empty
            );
    }

    private ExtensionMutationResult Mutate(
        Func<List<HookDefinition>, List<ExtensionRule>, MutableConfig, ExtensionOverview, ExtensionValidationResult> apply
    )
    {
        lock (_cacheLock)
        {
            var overview = BuildOverview();
            var config = overview.Config;
            if (config.LoadError.Length > 0)
            {
                return new ExtensionMutationResult(
                    Ok: false,
                    Errors: new[] { $"기존 설정을 읽지 못해 변경을 중단했다: {config.LoadError}" },
                    Overview: overview
                );
            }

            var hooks = new List<HookDefinition>(UserHooks(config.Hooks));
            var rules = new List<ExtensionRule>(UserRules(config.Rules));
            var mutable = new MutableConfig
            {
                DisabledPluginIds = config.DisabledPluginIds,
                PluginRoots = config.PluginRoots
            };

            var validation = apply(hooks, rules, mutable, overview);
            if (!validation.Ok)
            {
                return new ExtensionMutationResult(false, validation.Errors, overview);
            }

            var saveResult = _store.Save(
                config with
                {
                    Hooks = hooks,
                    Rules = rules,
                    DisabledPluginIds = mutable.DisabledPluginIds,
                    PluginRoots = mutable.PluginRoots
                }
            );

            _cached = null;
            _cachedStamp = string.Empty;
            var refreshed = BuildOverview();
            _cached = refreshed;
            _cachedStamp = ComputeStamp();

            return saveResult.Saved
                ? new ExtensionMutationResult(true, Array.Empty<string>(), refreshed)
                : new ExtensionMutationResult(false, new[] { saveResult.Error }, refreshed);
        }
    }

    private ExtensionOverview BuildOverview()
    {
        var config = _store.Read();
        var roots = ResolveRoots(config.PluginRoots);
        var scan = new PluginScanner(roots).Scan(new HashSet<string>(config.DisabledPluginIds, StringComparer.Ordinal));

        var hooks = new List<HookDefinition>(UserHooks(config.Hooks));
        hooks.AddRange(PluginScanner.CollectHooks(scan.Entries));

        var rules = new List<ExtensionRule>(UserRules(config.Rules));
        rules.AddRange(PluginScanner.CollectRules(scan.Entries));

        return new ExtensionOverview(
            config,
            scan.Entries,
            scan.ScannedRoots,
            scan.Errors,
            hooks,
            rules,
            _store.Path
        );
    }

    private IReadOnlyList<string> ResolveRoots(IReadOnlyList<string> configured)
    {
        var roots = new List<string> { _defaultPluginRootProvider() };
        foreach (var root in configured)
        {
            if (!roots.Contains(root, StringComparer.Ordinal))
            {
                roots.Add(root);
            }
        }

        return roots;
    }

    private static IReadOnlyList<HookDefinition> UserHooks(IReadOnlyList<HookDefinition> hooks)
    {
        var result = new List<HookDefinition>();
        foreach (var hook in hooks)
        {
            if (!hook.IsFromPlugin)
            {
                result.Add(hook);
            }
        }

        return result;
    }

    private static IReadOnlyList<ExtensionRule> UserRules(IReadOnlyList<ExtensionRule> rules)
    {
        var result = new List<ExtensionRule>();
        foreach (var rule in rules)
        {
            if (rule.Source.Length == 0)
            {
                result.Add(rule);
            }
        }

        return result;
    }

    private static IReadOnlyCollection<string> PluginHookIds(ExtensionOverview overview)
    {
        var ids = new HashSet<string>(StringComparer.Ordinal);
        foreach (var hook in overview.EffectiveHooks)
        {
            if (hook.IsFromPlugin)
            {
                ids.Add(hook.Id);
            }
        }

        return ids;
    }

    private static IReadOnlyCollection<string> PluginRuleIds(ExtensionOverview overview)
    {
        var ids = new HashSet<string>(StringComparer.Ordinal);
        foreach (var rule in overview.EffectiveRules)
        {
            if (rule.Source.Length > 0)
            {
                ids.Add(rule.Id);
            }
        }

        return ids;
    }

    private string ComputeStamp()
    {
        try
        {
            return File.Exists(_store.Path)
                ? File.GetLastWriteTimeUtc(_store.Path).Ticks.ToString()
                : "missing";
        }
        catch (Exception)
        {
            return Guid.NewGuid().ToString("N");
        }
    }

    private sealed class MutableConfig
    {
        public IReadOnlyList<string> DisabledPluginIds { get; set; } = Array.Empty<string>();
        public IReadOnlyList<string> PluginRoots { get; set; } = Array.Empty<string>();
    }

    private sealed class SingleHookSource : IHookDefinitionSource
    {
        private readonly HookDefinition _hook;
        private readonly string _workingDirectory;

        public SingleHookSource(HookDefinition hook, string workingDirectory)
        {
            _hook = hook;
            _workingDirectory = workingDirectory;
        }

        public IReadOnlyList<HookDefinition> GetHooks() => new[] { _hook };

        public string GetWorkingDirectory() => _workingDirectory;
    }
}
