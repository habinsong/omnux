namespace Omnux.Middleware;

/// <summary>제공자 호출 자체가 실패한 유형. 모델 응답 품질 문제와 구분해야 루프가 헛돌지 않는다.</summary>
public enum CodingProviderFailureKind
{
    None,
    RateLimited,
    RequestTooLarge,
    Auth,
    Timeout,
    Other
}

/// <summary>
/// LlmRouter 가 실패를 예외가 아니라 한국어 문자열로 돌려주기 때문에, 코딩 루프는 그 문자열을
/// "모델이 만든 계획"으로 착각하고 파싱 실패 → 재시도 → 다시 429 를 반복했다. 실제로 Groq 무료
/// 티어(TPM 8000)에서 30분 동안 파일 한 개도 못 만들고 사용자에게 아무 메시지도 안 갔다.
/// 이 정책이 그 문자열을 실패로 분류해 루프를 즉시 끊고 원인을 그대로 올린다.
/// </summary>
public static class CodingProviderFailurePolicy
{
    public static CodingProviderFailureKind Classify(string? responseText)
    {
        var text = (responseText ?? string.Empty).Trim();
        if (text.Length == 0)
        {
            return CodingProviderFailureKind.None;
        }

        // 실패 메시지는 항상 짧다. 긴 본문 안에 우연히 들어간 같은 낱말로 오판하지 않는다.
        if (text.Length > 400)
        {
            return CodingProviderFailureKind.None;
        }

        if (text.Contains("한도를 초과", StringComparison.Ordinal)
            || text.Contains("rate limit", StringComparison.OrdinalIgnoreCase)
            || text.Contains("요청 실패: 429", StringComparison.Ordinal)
            || text.Contains("할당량", StringComparison.Ordinal)
            || text.Contains("잠시 후 다시 시도", StringComparison.Ordinal))
        {
            return CodingProviderFailureKind.RateLimited;
        }

        if (text.Contains("요청 실패: 413", StringComparison.Ordinal)
            || text.Contains("request too large", StringComparison.OrdinalIgnoreCase))
        {
            return CodingProviderFailureKind.RequestTooLarge;
        }

        if (text.Contains("API 키가 설정되지 않았습니다", StringComparison.Ordinal)
            || text.Contains("인증 실패", StringComparison.Ordinal)
            || text.Contains("요청 실패: 401", StringComparison.Ordinal)
            || text.Contains("요청 실패: 403", StringComparison.Ordinal))
        {
            return CodingProviderFailureKind.Auth;
        }

        if (text.Contains("응답 시간이 초과", StringComparison.Ordinal))
        {
            return CodingProviderFailureKind.Timeout;
        }

        if (text.Contains("요청 실패:", StringComparison.Ordinal) || text.Contains("호출 오류:", StringComparison.Ordinal))
        {
            return CodingProviderFailureKind.Other;
        }

        return CodingProviderFailureKind.None;
    }

    /// <summary>프롬프트를 줄여 다시 시도할 가치가 있는 실패인지.</summary>
    public static bool ShouldRetryCompact(CodingProviderFailureKind kind)
    {
        return kind is CodingProviderFailureKind.RateLimited or CodingProviderFailureKind.RequestTooLarge;
    }

    /// <summary>더 시도해도 소용없는 실패인지(키/권한 문제).</summary>
    public static bool IsFatal(CodingProviderFailureKind kind) => kind == CodingProviderFailureKind.Auth;

    public static string BuildUserMessage(
        string provider,
        string model,
        CodingProviderFailureKind kind,
        string? rawText = null
    )
    {
        var label = ModelRegistry.GetLabel(provider);
        var detail = (rawText ?? string.Empty).Trim();
        if (detail.Length > 200)
        {
            detail = detail[..200] + "…";
        }

        var head = kind switch
        {
            CodingProviderFailureKind.RateLimited =>
                $"{label}({model}) 요청 한도에 걸려 작업을 진행하지 못했습니다. 컨텍스트를 '간결'로 낮추거나 다른 모델을 골라 주세요.",
            CodingProviderFailureKind.RequestTooLarge =>
                $"{label}({model})에 보낼 프롬프트가 너무 큽니다. 컨텍스트를 '간결'로 낮추거나 요청을 나눠 주세요.",
            CodingProviderFailureKind.Auth =>
                $"{label} API 키를 확인해 주세요. 인증이 거절돼 작업을 시작하지 못했습니다.",
            CodingProviderFailureKind.Timeout =>
                $"{label}({model}) 응답이 제한 시간 안에 오지 않았습니다. 다시 시도하거나 더 빠른 모델을 골라 주세요.",
            _ => $"{label}({model}) 호출이 실패해 작업을 진행하지 못했습니다."
        };

        return detail.Length == 0 ? head : $"{head}\n\n제공자 응답: {detail}";
    }
}
