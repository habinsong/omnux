namespace Omnux.Middleware;

/// <summary>
/// 제공자가 "그 모델 없다"고 답한 것인지 읽는다.
///
/// 모델 목록을 코드나 레지스트리로만 판단할 수 없다. 제공자의 `/models` 에 없어도 호출되는 별칭이
/// 있고(실측: DeepSeek `deepseek-v4-flash` 는 목록에 없지만 정상 응답), 반대로 목록에 있다가
/// 조용히 사라지는 이름도 있다. 그래서 실패 응답에서 배우는 쪽이 정확하다.
/// </summary>
public static class ProviderModelAvailabilityPolicy
{
    private static readonly string[] UnknownModelMarkers =
    {
        "model_not_found",
        "model not found",
        "does not exist",
        "unknown model",
        "invalid model",
        "no such model",
        "요청 실패: 404",
        "모델을 찾을 수 없",
        // 아래 두 문구는 실측으로 확인한 제공자 오류 표현이다(DeepSeek 은 400 과 함께
        // "The supported API model names are …, but you passed …" 를 돌려준다).
        "supported api model names",
        "but you passed"
    };

    /// <summary>실패 문구가 "그 모델이 없다"는 뜻인지. 일반적인 400/500 오류와 구분한다.</summary>
    public static bool LooksLikeUnknownModel(string? text)
    {
        var normalized = (text ?? string.Empty).Trim();
        if (normalized.Length == 0 || normalized.Length > 800)
        {
            return false;
        }

        foreach (var marker in UnknownModelMarkers)
        {
            if (normalized.Contains(marker, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        return false;
    }
}
