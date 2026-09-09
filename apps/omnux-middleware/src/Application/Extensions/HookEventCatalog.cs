namespace Omnux.Middleware;

/// <summary>
/// 훅 이벤트 1종의 계약. 차단 가능 여부와 입력 재작성 허용 여부를 이벤트가 정한다.
/// CanRewriteInput 은 현재 어떤 게이트도 updatedInput 을 적용하지 않으므로 모두 false 다(EXT-08).
/// CanAddContext 는 실제로 문맥을 적용하는 prompt.submit 만 true 다.
/// 적용하는 게이트가 생기기 전에는 true 로 바꾸지 않는다. 계약 검사가 이를 강제한다.
/// Wired 는 제품 코드에 실제 호출 지점이 있는지다. false 인 이벤트에 훅을 걸어도
/// 지금은 실행되지 않는다. 화면과 전송 payload 에 그대로 표시한다.
/// </summary>
internal sealed record HookEventDefinition(
    string Id,
    string Label,
    string Description,
    bool CanBlock,
    bool CanRewriteInput,
    bool CanAddContext,
    bool Wired
);

/// <summary>
/// omnux 훅 수명 이벤트 목록. 호출 지점이 아직 없는 이벤트는 Wired=false 로 표시한다.
/// 지원한다고 표시해 두고 실제로는 실행되지 않는 상태를 만들지 않기 위한 구분이다.
/// </summary>
internal static class HookEventCatalog
{
    public const string SessionStart = "session.start";
    public const string SessionEnd = "session.end";
    public const string PromptSubmit = "prompt.submit";
    public const string ToolPre = "tool.pre";
    public const string ToolPost = "tool.post";
    public const string ToolError = "tool.error";
    public const string ResponseComplete = "response.complete";
    public const string CodingPlan = "coding.plan";
    public const string CodingFilePre = "coding.file.pre";
    public const string CodingFilePost = "coding.file.post";
    public const string CodingCommandPre = "coding.command.pre";
    public const string CodingVerify = "coding.verify";
    public const string RoutinePre = "routine.pre";
    public const string RoutinePost = "routine.post";

    private static readonly IReadOnlyList<HookEventDefinition> All = new[]
    {
        new HookEventDefinition(
            SessionStart,
            "세션 시작",
            "새 세션이 열릴 때 1회. 알림·기록용이며 실행을 바꾸지 않는다.",
            CanBlock: false,
            CanRewriteInput: false,
            CanAddContext: false,
            Wired: true
        ),
        new HookEventDefinition(
            SessionEnd,
            "세션 종료",
            "세션이 닫힐 때 1회. 정리 작업용이며 차단할 수 없다.",
            CanBlock: false,
            CanRewriteInput: false,
            CanAddContext: false,
            Wired: true
        ),
        new HookEventDefinition(
            PromptSubmit,
            "프롬프트 제출",
            "사용자 입력이 제출된 직후. 차단하거나 문맥을 덧붙일 수 있다.",
            CanBlock: true,
            CanRewriteInput: false,
            CanAddContext: true,
            Wired: true
        ),
        new HookEventDefinition(
            ToolPre,
            "도구 실행 전",
            "도구 호출 직전. 차단하거나 사용자 승인을 요청할 수 있다.",
            CanBlock: true,
            CanRewriteInput: false,
            CanAddContext: false,
            Wired: true
        ),
        new HookEventDefinition(
            ToolPost,
            "도구 실행 후",
            "도구가 끝난 뒤. 결과를 되돌릴 수 없고 기록·알림용이다.",
            CanBlock: false,
            CanRewriteInput: false,
            CanAddContext: false,
            Wired: true
        ),
        new HookEventDefinition(
            ToolError,
            "도구 실패",
            "도구가 예외·비정상 종료로 끝났을 때.",
            CanBlock: false,
            CanRewriteInput: false,
            CanAddContext: false,
            Wired: true
        ),
        new HookEventDefinition(
            ResponseComplete,
            "응답 완료",
            "모델 응답이 끝난 뒤. 검사·기록용이다.",
            CanBlock: false,
            CanRewriteInput: false,
            CanAddContext: false,
            Wired: true
        ),
        new HookEventDefinition(
            CodingPlan,
            "코딩 계획 확정",
            "코딩 루프가 계획을 만든 직후. 계획을 거부할 수 있다.",
            CanBlock: true,
            CanRewriteInput: false,
            CanAddContext: false,
            Wired: true
        ),
        new HookEventDefinition(
            CodingFilePre,
            "파일 쓰기 전",
            "파일 생성·수정·삭제 직전. 경로 단위로 차단할 수 있다.",
            CanBlock: true,
            CanRewriteInput: false,
            CanAddContext: false,
            Wired: true
        ),
        new HookEventDefinition(
            CodingFilePost,
            "파일 쓰기 후",
            "파일이 실제로 바뀐 뒤. 포맷·검사 실행용이며 결과를 바꾸지 않는다.",
            CanBlock: false,
            CanRewriteInput: false,
            CanAddContext: false,
            Wired: true
        ),
        new HookEventDefinition(
            CodingCommandPre,
            "명령 실행 전",
            "셸 명령 실행 직전. 명령 문자열 기준으로 차단할 수 있다.",
            CanBlock: true,
            CanRewriteInput: false,
            CanAddContext: false,
            Wired: true
        ),
        new HookEventDefinition(
            CodingVerify,
            "검증 단계",
            "최종 검증 명령 실행 직전. 검증을 거부할 수 있다.",
            CanBlock: true,
            CanRewriteInput: false,
            CanAddContext: false,
            Wired: true
        ),
        new HookEventDefinition(
            RoutinePre,
            "자동화 실행 전",
            "예약·수동 자동화가 시작되기 전. 실행을 막을 수 있다.",
            CanBlock: true,
            CanRewriteInput: false,
            CanAddContext: false,
            Wired: true
        ),
        new HookEventDefinition(
            RoutinePost,
            "자동화 실행 후",
            "자동화가 끝난 뒤. 결과 알림·정리용이다.",
            CanBlock: false,
            CanRewriteInput: false,
            CanAddContext: false,
            Wired: true
        )
    };

    public static IReadOnlyList<HookEventDefinition> List() => All;

    public static HookEventDefinition? Find(string? eventId)
    {
        var normalized = Normalize(eventId);
        if (normalized.Length == 0)
        {
            return null;
        }

        foreach (var definition in All)
        {
            if (string.Equals(definition.Id, normalized, StringComparison.Ordinal))
            {
                return definition;
            }
        }

        return null;
    }

    public static bool IsKnown(string? eventId) => Find(eventId) != null;

    public static string Normalize(string? eventId)
    {
        return (eventId ?? string.Empty).Trim().ToLowerInvariant();
    }
}
