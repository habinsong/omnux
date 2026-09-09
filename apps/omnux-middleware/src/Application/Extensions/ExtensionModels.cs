namespace Omnux.Middleware;

/// <summary>훅 핸들러 종류. prompt/agent 는 LLM 호출이 필요해 현재 미지원으로 보고한다.</summary>
internal enum HookHandlerKind
{
    Unknown = 0,
    Command = 1,
    Builtin = 2,
    Prompt = 3,
    Agent = 4
}

/// <summary>훅 판정. Deny &gt; Ask &gt; Allow 순으로 강하다. None 은 판정을 내리지 않은 상태다.</summary>
internal enum HookOutcome
{
    None = 0,
    Allow = 1,
    Ask = 2,
    Deny = 3
}

/// <summary>훅 실행이 실패했을 때의 처리. Open 은 통과, Closed 는 차단.</summary>
internal enum HookFailureMode
{
    Open = 0,
    Closed = 1
}

/// <summary>훅 실행 결과의 종료 사유. 표시 문자열이 아니라 실제 실행 상태다.</summary>
internal enum HookRunStatus
{
    NotRun = 0,
    Completed = 1,
    Blocked = 2,
    Failed = 3,
    TimedOut = 4,
    Canceled = 5,
    Unsupported = 6
}

/// <summary>훅 매처. 비어 있으면 해당 축을 검사하지 않는다.</summary>
internal sealed record HookMatcher(
    string ToolPattern,
    string PathGlob
)
{
    public static readonly HookMatcher Any = new(string.Empty, string.Empty);
}

/// <summary>단일 훅 정의. 저장된 설정 1건과 1:1 대응한다.</summary>
internal sealed record HookDefinition(
    string Id,
    string Event,
    HookHandlerKind Handler,
    string Command,
    string BuiltinId,
    string BuiltinArgument,
    HookMatcher Matcher,
    int TimeoutMs,
    HookFailureMode FailureMode,
    bool Enabled,
    string Source,
    string Description
)
{
    public const int DefaultTimeoutMs = 10_000;
    public const int MinTimeoutMs = 200;
    public const int MaxTimeoutMs = 120_000;

    /// <summary>플러그인이 기여한 훅인지. 빈 문자열이면 사용자 정의다.</summary>
    public bool IsFromPlugin => Source.Length > 0;
}

/// <summary>훅에 전달하는 이벤트 입력. 필드는 이벤트별로 일부만 채워진다.</summary>
internal sealed record HookEventInput(
    string Event,
    string SessionId,
    string ToolName,
    string ToolInputJson,
    string FilePath,
    string Command,
    string Prompt,
    string Cwd
)
{
    public static HookEventInput ForEvent(string eventId) => new(
        eventId,
        string.Empty,
        string.Empty,
        string.Empty,
        string.Empty,
        string.Empty,
        string.Empty,
        string.Empty
    );
}

/// <summary>훅 1개의 실행 결과. 판정과 실행 상태를 분리해 기록한다.</summary>
internal sealed record HookRunResult(
    string HookId,
    string Event,
    HookRunStatus Status,
    HookOutcome Outcome,
    string Reason,
    string UpdatedInputJson,
    string AdditionalContext,
    int ExitCode,
    long DurationMs,
    string Stderr
);

/// <summary>여러 훅 결과를 합친 최종 판정.</summary>
internal sealed record HookDispatchResult(
    string Event,
    HookOutcome Outcome,
    string Reason,
    string DecidedByHookId,
    string UpdatedInputJson,
    string UpdatedInputByHookId,
    IReadOnlyList<string> AdditionalContext,
    IReadOnlyList<HookRunResult> Runs
)
{
    public bool IsBlocked => Outcome == HookOutcome.Deny;
    public bool NeedsApproval => Outcome == HookOutcome.Ask;
    public bool HasUpdatedInput => UpdatedInputJson.Length > 0;

    public static HookDispatchResult Empty(string eventId) => new(
        eventId,
        HookOutcome.None,
        string.Empty,
        string.Empty,
        string.Empty,
        string.Empty,
        Array.Empty<string>(),
        Array.Empty<HookRunResult>()
    );
}

/// <summary>플러그인 매니페스트. 로컬 디렉터리의 omnux-plugin.json 1건과 대응한다.</summary>
internal sealed record PluginManifest(
    string Id,
    string Name,
    string Version,
    string Description,
    string Author,
    string License,
    string Homepage,
    string RootPath,
    IReadOnlyList<HookDefinition> Hooks,
    IReadOnlyList<ExtensionRule> Rules,
    IReadOnlyList<string> Errors
)
{
    public bool IsValid => Errors.Count == 0;
}

/// <summary>플러그인 목록 1건의 화면 표시 상태.</summary>
internal sealed record PluginEntry(
    PluginManifest Manifest,
    bool Enabled
);

/// <summary>규칙 1건. 전역 단일 파일이 아니라 범위·대상별로 분리된 지침이다.</summary>
internal sealed record ExtensionRule(
    string Id,
    string Title,
    string Body,
    string Scope,
    string PathGlob,
    int Priority,
    bool Enabled,
    string Source
)
{
    public const string ScopeGlobal = "global";
    public const string ScopeProject = "project";
    public const int MaxBodyChars = 4000;
}

/// <summary>주입 예산 안에서 선택된 규칙 결과.</summary>
internal sealed record ExtensionRuleSelection(
    IReadOnlyList<ExtensionRule> Selected,
    IReadOnlyList<ExtensionRule> Skipped,
    string Text,
    int UsedChars,
    int BudgetChars
);

/// <summary>확장 설정 전체 스냅샷. 저장 파일 1건과 대응한다.</summary>
internal sealed record ExtensionConfigSnapshot(
    int Version,
    IReadOnlyList<HookDefinition> Hooks,
    IReadOnlyList<ExtensionRule> Rules,
    IReadOnlyList<string> DisabledPluginIds,
    IReadOnlyList<string> PluginRoots,
    string UpdatedUtc,
    bool Exists,
    string LoadError
)
{
    public const int CurrentVersion = 1;

    public static ExtensionConfigSnapshot Empty => new(
        CurrentVersion,
        Array.Empty<HookDefinition>(),
        Array.Empty<ExtensionRule>(),
        Array.Empty<string>(),
        Array.Empty<string>(),
        string.Empty,
        false,
        string.Empty
    );
}
