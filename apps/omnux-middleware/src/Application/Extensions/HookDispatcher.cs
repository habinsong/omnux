namespace Omnux.Middleware;

/// <summary>훅 정의 공급원. 저장소 구현과 실행기를 분리한다.</summary>
internal interface IHookDefinitionSource
{
    IReadOnlyList<HookDefinition> GetHooks();
    string GetWorkingDirectory();
}

/// <summary>
/// 훅 실행 조율. 매칭 → 실행 → 합성만 담당하며 저장·직렬화·화면 책임은 갖지 않는다.
/// 차단 가능한 이벤트에서 거부가 나오면 이후 훅을 실행하지 않아 부작용을 남기지 않는다.
/// </summary>
internal sealed class HookDispatcher
{
    public const int MaxHooksPerEvent = 32;

    private readonly IHookDefinitionSource _source;
    private readonly HookCommandRunner _runner;

    public HookDispatcher(IHookDefinitionSource source, HookCommandRunner? runner = null)
    {
        _source = source;
        _runner = runner ?? new HookCommandRunner();
    }

    public async Task<HookDispatchResult> DispatchAsync(
        HookEventInput input,
        CancellationToken cancellationToken
    )
    {
        var eventId = HookEventCatalog.Normalize(input.Event);
        var eventDefinition = HookEventCatalog.Find(eventId);
        if (eventDefinition == null)
        {
            return HookDispatchResult.Empty(eventId);
        }

        var normalizedInput = input with { Event = eventId };
        var matched = SelectMatching(_source.GetHooks(), normalizedInput);
        if (matched.Count == 0)
        {
            return HookDispatchResult.Empty(eventId);
        }

        var byId = new Dictionary<string, HookDefinition>(StringComparer.Ordinal);
        foreach (var definition in matched)
        {
            byId[definition.Id] = definition;
        }

        var workingDirectory = _source.GetWorkingDirectory();
        var runs = new List<HookRunResult>(matched.Count);
        foreach (var definition in matched)
        {
            var run = await RunOneAsync(definition, normalizedInput, workingDirectory, cancellationToken)
                .ConfigureAwait(false);
            runs.Add(run);

            if (eventDefinition.CanBlock
                && HookDecisionReducer.EffectiveOutcome(run, byId) == HookOutcome.Deny)
            {
                break;
            }

            if (cancellationToken.IsCancellationRequested)
            {
                break;
            }
        }

        return HookDecisionReducer.Reduce(eventDefinition, runs, byId);
    }

    /// <summary>매칭된 훅 목록. 상한을 넘는 정의는 실행하지 않고 잘라낸다.</summary>
    public static IReadOnlyList<HookDefinition> SelectMatching(
        IReadOnlyList<HookDefinition> definitions,
        HookEventInput input
    )
    {
        var matched = new List<HookDefinition>();
        foreach (var definition in definitions)
        {
            if (matched.Count >= MaxHooksPerEvent)
            {
                break;
            }

            if (HookMatchPolicy.Matches(definition, input))
            {
                matched.Add(definition);
            }
        }

        return matched;
    }

    private async Task<HookRunResult> RunOneAsync(
        HookDefinition definition,
        HookEventInput input,
        string workingDirectory,
        CancellationToken cancellationToken
    )
    {
        switch (definition.Handler)
        {
            case HookHandlerKind.Builtin:
                return BuiltinHookHandlers.Run(definition, input);
            case HookHandlerKind.Command:
                return await _runner
                    .RunAsync(definition, input, workingDirectory, cancellationToken)
                    .ConfigureAwait(false);
            case HookHandlerKind.Prompt:
            case HookHandlerKind.Agent:
                // 모델 호출이 필요한 핸들러다. 지원하지 않는 상태를 그대로 보고한다.
                return Unsupported(
                    definition,
                    input,
                    $"{definition.Handler} 핸들러는 아직 실행되지 않는다(모델 호출 경계 미연결)"
                );
            case HookHandlerKind.Unknown:
            default:
                return Unsupported(definition, input, "핸들러 종류를 알 수 없다");
        }
    }

    private static HookRunResult Unsupported(HookDefinition definition, HookEventInput input, string reason)
    {
        return new HookRunResult(
            definition.Id,
            HookEventCatalog.Normalize(input.Event),
            HookRunStatus.Unsupported,
            HookOutcome.None,
            reason,
            string.Empty,
            string.Empty,
            ExitCode: -1,
            DurationMs: 0,
            Stderr: string.Empty
        );
    }
}
