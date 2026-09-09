namespace Omnux.Middleware;

/// <summary>
/// 코딩 실행과 확장 훅의 연결부. 이 partial 은 게이트를 만들어 넘기는 일만 한다.
/// 훅 판정·실행·저장 로직은 Application/Extensions 의 타입에 있으며 여기로 옮기지 않는다.
/// </summary>
public sealed partial class CodingApplicationService
{
    /// <summary>
    /// 실행 폴더 기준의 훅 게이트. 확장 설정을 읽지 못하면 훅 없이 진행한다.
    /// 확장 계층 오류로 코딩 실행 전체를 멈추지 않기 위한 경계다.
    /// </summary>
    private static ICodingHookGate ResolveCodingHookGate(string workspaceRoot)
    {
        try
        {
            var root = Directory.Exists(workspaceRoot) ? workspaceRoot : Directory.GetCurrentDirectory();
            return new ExtensionCodingHookGate(
                new HookDispatcher(new WorkspaceHookSource(SharedExtensionServices.Service, root)),
                SharedExtensionServices.Approvals
            );
        }
        catch (Exception)
        {
            return NullCodingHookGate.Instance;
        }
    }

    /// <summary>차단 사유 표시 문자열. 판정한 훅 id 를 함께 남긴다.</summary>
    internal static string FormatCodingHookBlockReason(HookGateDecision decision)
    {
        var reason = decision.Reason.Trim();
        if (reason.Length == 0)
        {
            reason = "훅이 차단했다";
        }

        return decision.DecidedByHookId.Length > 0 ? $"{decision.DecidedByHookId}: {reason}" : reason;
    }

    /// <summary>
    /// 훅이 코딩 계획을 막았을 때의 결과. 실행 상태를 blocked 로 두고
    /// 성공으로 보이는 요약을 만들지 않는다. 이미 바뀐 파일은 그대로 보고한다.
    /// </summary>
    internal static AutonomousCodingOutcome BuildHookBlockedCodingOutcome(
        string language,
        string lastCode,
        string rawResponse,
        string workspaceRoot,
        IReadOnlyCollection<string> changedFiles,
        TokenUsage? tokenUsage,
        string retrievalLabel,
        string reason
    )
    {
        var ordered = changedFiles
            .Where(path => !string.IsNullOrWhiteSpace(path))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(path => path, StringComparer.OrdinalIgnoreCase)
            .ToArray();

        var execution = new CodeExecutionResult(
            language,
            workspaceRoot,
            "-",
            "-",
            ExitCode: -1,
            StdOut: string.Empty,
            StdErr: reason,
            Status: "blocked"
        );

        var summary = ordered.Length == 0
            ? $"훅이 코딩 계획을 막아 실행하지 않았습니다.\n사유: {reason}"
            : $"훅이 코딩 계획을 막아 남은 작업을 중단했습니다.\n사유: {reason}\n이미 변경된 파일 {ordered.Length}개는 그대로 남아 있습니다.";

        return new AutonomousCodingOutcome(
            language,
            lastCode,
            rawResponse,
            execution,
            ordered,
            summary,
            tokenUsage,
            RetrievalLabel: retrievalLabel
        );
    }

    /// <summary>실행 폴더를 훅의 작업 폴더로 바꿔 주는 얇은 어댑터.</summary>
    private sealed class WorkspaceHookSource : IHookDefinitionSource
    {
        private readonly ExtensionApplicationService _service;
        private readonly string _workspaceRoot;

        public WorkspaceHookSource(ExtensionApplicationService service, string workspaceRoot)
        {
            _service = service;
            _workspaceRoot = workspaceRoot;
        }

        public IReadOnlyList<HookDefinition> GetHooks() => _service.GetHooks();

        public string GetWorkingDirectory() => _workspaceRoot;
    }
}
