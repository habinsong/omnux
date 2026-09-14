namespace Omnux.Middleware;

/// <summary>
/// 받아 온 본문이 사람이 읽을 수 있는 글인지 판정한다. 압축·바이너리 응답을 글자로 해석하면
/// 깨진 문자가 잔뜩 나오는데, 그대로 프롬프트에 실으면 모델이 페이지를 못 읽었다고 답한다.
/// </summary>
internal static class WebPageTextPolicy
{
    /// <summary>이 비율을 넘게 깨진 문자가 섞여 있으면 본문으로 쓰지 않는다.</summary>
    private const double UnreadableRatio = 0.1;

    /// <summary>비율을 볼 만큼 글자가 모였는지.</summary>
    private const int MinimumSampleLength = 40;

    public static bool LooksUnreadable(string? text)
    {
        var value = text ?? string.Empty;
        if (value.Length < MinimumSampleLength)
        {
            return false;
        }

        var broken = 0;
        foreach (var ch in value)
        {
            if (ch == '�')
            {
                broken++;
                continue;
            }

            // 탭·줄바꿈을 뺀 제어문자와, 문자에도 기호에도 속하지 않는 사적 영역 문자는 깨진 것으로 본다.
            if (char.IsControl(ch) && ch != '\n' && ch != '\r' && ch != '\t')
            {
                broken++;
                continue;
            }

            if (char.GetUnicodeCategory(ch) == System.Globalization.UnicodeCategory.PrivateUse
                || char.GetUnicodeCategory(ch) == System.Globalization.UnicodeCategory.Surrogate)
            {
                broken++;
            }
        }

        return (double)broken / value.Length > UnreadableRatio;
    }
}
