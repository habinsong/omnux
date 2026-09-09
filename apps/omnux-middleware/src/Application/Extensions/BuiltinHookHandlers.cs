namespace Omnux.Middleware;

/// <summary>내장 훅 1종의 계약. 인자 의미와 필요 여부를 UI 가 그대로 표시한다.</summary>
internal sealed record BuiltinHookDefinition(
    string Id,
    string Label,
    string ArgumentLabel,
    string Description,
    bool RequiresArgument
);

/// <summary>
/// 외부 프로세스 없이 결정되는 내장 훅. 모델 호출이 없으므로 판정이 항상 재현 가능하다.
/// 인자는 `|` 로 구분한 와일드카드 패턴 목록이다.
/// </summary>
internal static class BuiltinHookHandlers
{
    public const string DenyPath = "deny-path";
    public const string AskPath = "ask-path";
    public const string DenyCommand = "deny-command";
    public const string AskCommand = "ask-command";
    public const string RequireApproval = "require-approval";
    public const string AddContext = "add-context";

    private static readonly IReadOnlyList<BuiltinHookDefinition> All = new[]
    {
        new BuiltinHookDefinition(
            DenyPath,
            "경로 차단",
            "경로 glob 목록",
            "대상 경로가 패턴에 맞으면 거부한다. 예: `**/.env|**/secrets/**`",
            RequiresArgument: true
        ),
        new BuiltinHookDefinition(
            AskPath,
            "경로 승인 요청",
            "경로 glob 목록",
            "대상 경로가 패턴에 맞으면 사용자 승인을 요청한다.",
            RequiresArgument: true
        ),
        new BuiltinHookDefinition(
            DenyCommand,
            "명령 차단",
            "명령 와일드카드 목록",
            "명령 문자열이 패턴에 맞으면 거부한다. 예: `*rm -rf *|*push --force*`",
            RequiresArgument: true
        ),
        new BuiltinHookDefinition(
            AskCommand,
            "명령 승인 요청",
            "명령 와일드카드 목록",
            "명령 문자열이 패턴에 맞으면 사용자 승인을 요청한다.",
            RequiresArgument: true
        ),
        new BuiltinHookDefinition(
            RequireApproval,
            "항상 승인 요청",
            "사유(선택)",
            "매처에 걸린 모든 호출에 승인을 요청한다.",
            RequiresArgument: false
        ),
        new BuiltinHookDefinition(
            AddContext,
            "문맥 추가",
            "추가할 문장",
            "문맥 추가가 허용된 이벤트에서 지정한 문장을 붙인다.",
            RequiresArgument: true
        )
    };

    public static IReadOnlyList<BuiltinHookDefinition> List() => All;

    public static BuiltinHookDefinition? Find(string? id)
    {
        var normalized = (id ?? string.Empty).Trim().ToLowerInvariant();
        foreach (var definition in All)
        {
            if (string.Equals(definition.Id, normalized, StringComparison.Ordinal))
            {
                return definition;
            }
        }

        return null;
    }

    public static HookRunResult Run(HookDefinition definition, HookEventInput input)
    {
        var builtin = Find(definition.BuiltinId);
        if (builtin == null)
        {
            return Result(
                definition,
                input,
                HookRunStatus.Failed,
                HookOutcome.None,
                $"알 수 없는 내장 훅: {definition.BuiltinId}"
            );
        }

        if (builtin.RequiresArgument && definition.BuiltinArgument.Trim().Length == 0)
        {
            return Result(
                definition,
                input,
                HookRunStatus.Failed,
                HookOutcome.None,
                $"내장 훅 {builtin.Id} 에 필요한 인자가 비어 있다"
            );
        }

        return builtin.Id switch
        {
            DenyPath => PathRule(definition, input, HookOutcome.Deny, "경로 규칙으로 차단됨"),
            AskPath => PathRule(definition, input, HookOutcome.Ask, "경로 규칙으로 승인 필요"),
            DenyCommand => CommandRule(definition, input, HookOutcome.Deny, "명령 규칙으로 차단됨"),
            AskCommand => CommandRule(definition, input, HookOutcome.Ask, "명령 규칙으로 승인 필요"),
            RequireApproval => Result(
                definition,
                input,
                HookRunStatus.Completed,
                HookOutcome.Ask,
                definition.BuiltinArgument.Trim().Length > 0
                    ? definition.BuiltinArgument.Trim()
                    : "승인이 필요한 작업"
            ),
            AddContext => Result(
                definition,
                input,
                HookRunStatus.Completed,
                HookOutcome.None,
                string.Empty
            ) with
            {
                AdditionalContext = definition.BuiltinArgument.Trim()
            },
            _ => Result(
                definition,
                input,
                HookRunStatus.Failed,
                HookOutcome.None,
                $"처리되지 않은 내장 훅: {builtin.Id}"
            )
        };
    }

    private static HookRunResult PathRule(
        HookDefinition definition,
        HookEventInput input,
        HookOutcome outcome,
        string reason
    )
    {
        var path = input.FilePath.Trim();
        if (path.Length == 0)
        {
            // 경로가 없는 이벤트에서는 판정하지 않는다. 성공으로 위장하지 않는다.
            return Result(definition, input, HookRunStatus.Completed, HookOutcome.None, string.Empty);
        }

        var matched = MatchesAny(definition.BuiltinArgument, path, separatorAware: true);
        return matched
            ? Result(definition, input, HookRunStatus.Completed, outcome, $"{reason}: {path}")
            : Result(definition, input, HookRunStatus.Completed, HookOutcome.None, string.Empty);
    }

    private static HookRunResult CommandRule(
        HookDefinition definition,
        HookEventInput input,
        HookOutcome outcome,
        string reason
    )
    {
        var command = input.Command.Trim();
        if (command.Length == 0)
        {
            return Result(definition, input, HookRunStatus.Completed, HookOutcome.None, string.Empty);
        }

        var matched = MatchesAny(definition.BuiltinArgument, command, separatorAware: false);
        return matched
            ? Result(definition, input, HookRunStatus.Completed, outcome, $"{reason}: {command}")
            : Result(definition, input, HookRunStatus.Completed, HookOutcome.None, string.Empty);
    }

    private static bool MatchesAny(string argument, string value, bool separatorAware)
    {
        foreach (var pattern in argument.Split('|', StringSplitOptions.RemoveEmptyEntries))
        {
            var candidate = pattern.Trim();
            if (candidate.Length == 0)
            {
                continue;
            }

            var matched = separatorAware
                ? HookMatchPolicy.MatchesPath(candidate, value)
                : HookMatchPolicy.MatchesTool(candidate, value);
            if (matched)
            {
                return true;
            }
        }

        return false;
    }

    private static HookRunResult Result(
        HookDefinition definition,
        HookEventInput input,
        HookRunStatus status,
        HookOutcome outcome,
        string reason
    )
    {
        return new HookRunResult(
            definition.Id,
            HookEventCatalog.Normalize(input.Event),
            status,
            outcome,
            reason,
            string.Empty,
            string.Empty,
            ExitCode: 0,
            DurationMs: 0,
            Stderr: string.Empty
        );
    }
}
