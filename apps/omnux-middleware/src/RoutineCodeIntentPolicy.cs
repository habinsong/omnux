namespace Omnux.Middleware;

/// <summary>
/// 루틴 요청 문장에서 "이 스크립트가 파일을 만들어야 하는가"를 읽는다.
/// 예전에는 요청에 "파일"·"csv"·"json" 이 한 번만 나와도 파일 쓰기 로직을 강요해서,
/// "파일 개수를 세어 표로 출력해 줘"처럼 읽기만 하는 요청이 품질 검증에서 통째로 실패했다(실측).
/// </summary>
public static class RoutineCodeIntentPolicy
{
    // 저장·기록 의도가 분명한 표현만 본다. 확장자가 붙은 이름은 파일 그 자체를 가리킨다.
    private static readonly string[] SaveIntentMarkers =
    {
        "저장",
        "다운로드",
        "내려받",
        "기록해",
        "기록하",
        "파일로",
        "파일에",
        "파일을 만들",
        "파일 생성",
        ".csv",
        ".json",
        ".txt",
        ".md",
        ".log",
        ".xlsx"
    };

    /// <summary>요청이 파일을 남기는 작업인지. 단순 조회·집계·출력 요청은 false.</summary>
    public static bool RequiresFileOutputLogic(string? request)
    {
        var normalized = (request ?? string.Empty).ToLowerInvariant();
        if (normalized.Length == 0)
        {
            return false;
        }

        foreach (var marker in SaveIntentMarkers)
        {
            if (normalized.Contains(marker, StringComparison.Ordinal))
            {
                return true;
            }
        }

        return false;
    }
}
