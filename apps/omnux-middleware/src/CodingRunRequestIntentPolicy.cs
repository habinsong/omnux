namespace Omnux.Middleware;

/// <summary>
/// 빌드탭에서 "실행해봐" 처럼 이미 만든 결과를 그냥 돌려 달라는 요청인지 판정한다.
/// 이런 요청을 새 코딩 루프로 보내면 모델이 목표를 "실행"으로 오해해 파일을 다시 쓰거나
/// 아무것도 안 하고 끝난다. 판정되면 직전 결과를 그대로 실행한다.
/// </summary>
public static class CodingRunRequestIntentPolicy
{
    // 실행을 가리키는 표현. 한국어 구어체와 영어를 함께 본다.
    private static readonly string[] RunMarkers =
    {
        "실행",
        "돌려",
        "돌려봐",
        "구동",
        "켜봐",
        "띄워",
        "플레이",
        "run it",
        "run the",
        "launch",
        "start it",
        "execute"
    };

    // 새로 만들거나 고치라는 요청이면 실행 전용 요청이 아니다.
    private static readonly string[] BuildMarkers =
    {
        "만들",
        "작성",
        "구현",
        "추가",
        "수정",
        "고쳐",
        "고치",
        "바꿔",
        "변경",
        "리팩",
        "삭제",
        "지워",
        "붙여",
        "넣어",
        "create",
        "implement",
        "write",
        "add ",
        "fix",
        "change",
        "refactor"
    };

    // 실행이 안 된다는 신고는 고쳐 달라는 요청이다. 그냥 다시 돌리면 같은 실패만 반복한다.
    private static readonly string[] FailureMarkers =
    {
        "안 되",
        "안되",
        "안 돼",
        "안돼",
        "안됨",
        "오류",
        "에러",
        "실패",
        "죽어",
        "멈춰",
        "error",
        "fail"
    };

    /// <summary>이미 만든 결과를 실행만 해 달라는 짧은 요청인지.</summary>
    public static bool LooksLikeRunExistingResultRequest(string? text)
    {
        var normalized = (text ?? string.Empty).Trim().ToLowerInvariant();
        if (normalized.Length == 0 || normalized.Length > 40)
        {
            return false;
        }

        if (!ContainsAny(normalized, RunMarkers))
        {
            return false;
        }

        return !ContainsAny(normalized, BuildMarkers) && !ContainsAny(normalized, FailureMarkers);
    }

    private static bool ContainsAny(string text, string[] markers)
    {
        foreach (var marker in markers)
        {
            if (text.Contains(marker, StringComparison.Ordinal))
            {
                return true;
            }
        }

        return false;
    }
}
