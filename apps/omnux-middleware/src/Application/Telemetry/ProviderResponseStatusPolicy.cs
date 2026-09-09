namespace Omnux.Middleware;

/// <summary>
/// 제공자 응답 본문에서 호출 상태를 판정한다(순수 함수).
///
/// 제공자 계층에는 예외를 던지지 않고 **오류 문장을 응답으로 돌려주는** 경로가 있다.
/// (`LlmRouter` 의 "Groq 호출 오류: …", `CodexCliWrapper` 의 "codex 응답 시간이 초과되었습니다." 등)
/// 그 문장은 언제나 **응답 전체**이며 제공자 이름으로 시작한다.
///
/// 이전 구현은 본문 어디서든 "timeout"·"오류"·"exception" 을 찾았다.
/// 그래서 오류를 설명하는 정상 답변이 실패로 기록되고 답변 본문이 오류 필드에 저장됐다.
/// 여기서는 **응답이 제공자 이름으로 시작하고, 첫 줄에 실패 표식이 있을 때만** 실패로 본다.
///
/// 선택용 판정(`IsLikelyWorkerFailure`)과는 목적이 다르다. 그쪽은 "이 답을 쓸 수 있는가"이고
/// 여기는 "이 호출이 실패했는가"다. 규칙을 하나로 합치지 않는다.
/// </summary>
internal static class ProviderResponseStatusPolicy
{
    public const string Ok = "ok";
    public const string Empty = "empty";
    public const string Timeout = "timeout";
    public const string Error = "error";

    /// <summary>본문이 비었을 때 정리 계층이 넣는 문장. 응답 전체가 이 문장이면 빈 응답이다.</summary>
    private const string SanitizedEmptyText = "응답이 비어 있습니다. 다시 질문해 주세요.";

    private static readonly string[] TimeoutMarkers =
    {
        "응답 시간이 초과"
    };

    private static readonly string[] EmptyMarkers =
    {
        "응답이 비어 있습니다"
    };

    private static readonly string[] ErrorMarkers =
    {
        "호출 오류:",
        "요청 실패:",
        "api 키가 설정되지 않았습니다",
        "인증이 필요합니다"
    };

    /// <summary>제공자 이름으로 시작하지 않는 실패 문장. 실제로 만들어지는 값만 담는다.</summary>
    private static readonly string[] GroqQuotaPrefixes =
    {
        "현재 groq 요청 한도를 초과했습니다.",
        "groq 모델 한도에 도달했습니다."
    };

    public static string Resolve(string? provider, string? responseText)
    {
        var trimmed = (responseText ?? string.Empty).Trim();
        if (trimmed.Length == 0)
        {
            return Empty;
        }

        var lowered = trimmed.ToLowerInvariant();
        if (string.Equals(trimmed, SanitizedEmptyText, StringComparison.Ordinal))
        {
            return Empty;
        }

        var providerPrefix = (provider ?? string.Empty).Trim().ToLowerInvariant();

        if (providerPrefix.Length > 0)
        {
            if (providerPrefix == "groq")
            {
                foreach (var prefix in GroqQuotaPrefixes)
                {
                    if (lowered.StartsWith(prefix, StringComparison.Ordinal))
                    {
                        return Error;
                    }
                }
            }

            if (lowered.StartsWith(providerPrefix, StringComparison.Ordinal))
            {
                var head = FirstLine(lowered);

                foreach (var marker in TimeoutMarkers)
                {
                    if (head.Contains(marker, StringComparison.Ordinal))
                    {
                        return Timeout;
                    }
                }

                foreach (var marker in EmptyMarkers)
                {
                    if (head.Contains(marker, StringComparison.Ordinal))
                    {
                        return Empty;
                    }
                }

                foreach (var marker in ErrorMarkers)
                {
                    if (head.Contains(marker, StringComparison.Ordinal))
                    {
                        return Error;
                    }
                }
            }
        }

        return Ok;
    }

    /// <summary>실패 문장은 한 줄이다. 긴 답변의 뒷부분을 판정에 쓰지 않기 위해 첫 줄만 본다.</summary>
    private static string FirstLine(string value)
    {
        var index = value.IndexOf('\n');
        if (index < 0)
        {
            return value;
        }

        return value[..index].TrimEnd('\r');
    }
}
