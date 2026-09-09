namespace Omnux.Middleware;

/// <summary>프롬프트 훅 판정. 차단 사유와 덧붙일 문맥을 함께 돌려준다.</summary>
internal readonly record struct PromptGateDecision(
    bool Allowed,
    string Reason,
    string DecidedByHookId,
    IReadOnlyList<string> AdditionalContext
)
{
    public static readonly PromptGateDecision Allow =
        new(true, string.Empty, string.Empty, Array.Empty<string>());
}

/// <summary>사용자 프롬프트 제출 경계의 훅 호출 지점.</summary>
internal interface IPromptHookGate
{
    Task<PromptGateDecision> BeforePromptAsync(
        string prompt,
        string conversationId,
        CancellationToken cancellationToken
    );
}

/// <summary>훅을 쓰지 않는 경로용 기본 구현.</summary>
internal sealed class NullPromptHookGate : IPromptHookGate
{
    public static readonly NullPromptHookGate Instance = new();

    private NullPromptHookGate()
    {
    }

    public Task<PromptGateDecision> BeforePromptAsync(string prompt, string conversationId, CancellationToken cancellationToken)
        => Task.FromResult(PromptGateDecision.Allow);
}

/// <summary>확장 계층 훅을 프롬프트 제출에 연결하는 게이트.</summary>
internal sealed class ExtensionPromptHookGate : IPromptHookGate
{
    private readonly HookDispatcher _dispatcher;
    private readonly HookApprovalCoordinator _approvals;

    public ExtensionPromptHookGate(HookDispatcher dispatcher, HookApprovalCoordinator? approvals = null)
    {
        _dispatcher = dispatcher;
        _approvals = approvals ?? new HookApprovalCoordinator();
    }

    public async Task<PromptGateDecision> BeforePromptAsync(
        string prompt,
        string conversationId,
        CancellationToken cancellationToken
    )
    {
        var input = new HookEventInput(
            HookEventCatalog.PromptSubmit,
            conversationId,
            string.Empty,
            string.Empty,
            string.Empty,
            string.Empty,
            prompt,
            string.Empty
        );

        var result = await _dispatcher.DispatchAsync(input, cancellationToken).ConfigureAwait(false);
        // 승인 대상은 대화 단위다. 프롬프트 본문은 매번 달라 승인 대상이 될 수 없다.
        var gate = _approvals.Resolve(result, HookEventCatalog.PromptSubmit, conversationId);
        return new PromptGateDecision(
            gate.Allowed,
            gate.Reason,
            gate.DecidedByHookId,
            gate.Allowed ? result.AdditionalContext : Array.Empty<string>()
        );
    }
}

/// <summary>
/// 훅이 덧붙인 문맥을 사용자 입력에 붙이는 규칙(순수 함수).
/// 사용자가 쓴 본문은 절대 바꾸지 않고 아래에 표시된 블록으로만 덧붙인다.
/// </summary>
internal static class PromptContextComposer
{
    public const string BlockHeader = "[훅 추가 문맥]";
    public const int MaxContextChars = 2000;

    public static string Apply(string? prompt, IReadOnlyList<string>? additionalContext)
    {
        var original = prompt ?? string.Empty;
        if (additionalContext == null || additionalContext.Count == 0)
        {
            return original;
        }

        var lines = new List<string>();
        var used = 0;
        foreach (var entry in additionalContext)
        {
            var text = (entry ?? string.Empty).Trim();
            if (text.Length == 0)
            {
                continue;
            }

            // 예산을 넘는 항목은 잘라 넣지 않고 통째로 건너뛴다.
            if (used + text.Length > MaxContextChars)
            {
                continue;
            }

            lines.Add("- " + text);
            used += text.Length;
        }

        if (lines.Count == 0)
        {
            return original;
        }

        return $"{original}\n\n{BlockHeader}\n{string.Join("\n", lines)}";
    }
}
