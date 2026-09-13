using System.Collections.Concurrent;
using System.Text.RegularExpressions;

namespace Omnux.Middleware;

/// <summary>
/// 제공자별 요청 예산. DeepSeek·Gemini 는 컨텍스트 창이 200K 급이라 예산을 작게 깎을 이유가 없다.
/// 게다가 두 제공자는 추론 토큰이 출력 예산 안에 들어가서, 예산을 작게 주면 추론이 예산을 다 먹고
/// 본문이 0 이 된다(실측: reasoning_tokens=8192, content=0, finish_reason=length).
/// Groq 무료 티어처럼 분당 토큰이 작은 제공자는 기존 값을 그대로 쓴다.
/// </summary>
public static class ProviderTokenBudgetPolicy
{
    /// <summary>상한을 사실상 두지 않는 제공자의 토큰 예산.</summary>
    public const int LargeWindowTokens = 200_000;

    /// <summary>그 외 제공자의 출력 예산 상한(기존 동작).</summary>
    public const int DefaultOutputTokenCap = 32_768;

    /// <summary>컨텍스트 프롬프트 상한(문자, 기존 동작).</summary>
    public const int DefaultContextPromptChars = 8_000;

    /// <summary>[최근 대화] 예산(문자, 기존 동작).</summary>
    public const int DefaultHistoryChars = 5_200;

    /// <summary>
    /// 큰 창 제공자의 최소 출력 예산. 추론 토큰이 출력 예산 안에 들어가므로 이보다 작게 주면
    /// 추론만 하다 본문이 비는 일이 생긴다(실측 16384 통과).
    /// </summary>
    public const int LargeWindowMinOutputTokens = 16_384;

    // 대화 이력은 메시지 수(ConversationHistoryMessages)로 이미 묶여 있다. 그래서 이 문자 예산은
    // "창이 큰 제공자에서는 실린 이력을 자르지 않는다"는 뜻이고, 무한정 커지지는 않는다.
    private const int LargeWindowContextPromptChars = 200_000;
    private const int LargeWindowHistoryChars = 150_000;

    /// <summary>컨텍스트 창이 커서 예산 상한이 사실상 의미 없는 제공자인지.</summary>
    public static bool HasLargeWindow(string? provider)
    {
        var normalized = (provider ?? string.Empty).Trim();
        return normalized.Equals("deepseek", StringComparison.OrdinalIgnoreCase)
               || normalized.Equals("gemini", StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>제공자별 출력 예산 상한.</summary>
    public static int ResolveOutputTokenCap(string? provider)
    {
        return HasLargeWindow(provider) ? LargeWindowTokens : DefaultOutputTokenCap;
    }

    /// <summary>
    /// 큰 창 제공자(DeepSeek·Gemini)에는 예산을 매기지 않는다 — 창 전체를 그대로 준다.
    /// 출력 토큰은 실제로 쓴 만큼만 과금되므로 크게 잡아도 손해가 없고, 작게 잡으면 추론에 밀려
    /// 답이 잘린다. 제공자가 그 값을 거부한 적이 있으면 그때 알아낸 한도를 쓴다.
    /// 창이 작은 제공자는 요청값을 그대로 둔다.
    /// </summary>
    public static int ResolveOutputTokens(string? provider, int requested)
    {
        if (!HasLargeWindow(provider))
        {
            return requested;
        }

        var window = ResolveWindowTokens(provider);
        return Math.Clamp(Math.Max(requested, window), LargeWindowMinOutputTokens, window);
    }

    /// <summary>제공자에 실제로 보낼 수 있는 출력 창. 거부당한 적이 있으면 그때 알아낸 한도.</summary>
    public static int ResolveWindowTokens(string? provider)
    {
        var key = NormalizeProviderKey(provider);
        return LearnedOutputLimits.TryGetValue(key, out var learned)
            ? Math.Clamp(learned, LargeWindowMinOutputTokens, LargeWindowTokens)
            : LargeWindowTokens;
    }

    // 제공자가 "max_tokens 는 N 이하" 라고 알려 주면 그 값을 기억해 다음 호출부터 그 한도로 보낸다.
    // 창 크기를 코드에 박아 두면 제공자가 올리거나 내릴 때마다 틀린다.
    private static readonly ConcurrentDictionary<string, int> LearnedOutputLimits = new(StringComparer.OrdinalIgnoreCase);

    private static readonly Regex OutputLimitRegex = new(
        @"(?:max_tokens|maxOutputTokens|max_output_tokens|max_completion_tokens)"
        + @"[^0-9]{0,60}?(?<limit>\d{3,7})",
        RegexOptions.Compiled | RegexOptions.IgnoreCase
    );

    /// <summary>
    /// 실패 응답에서 출력 한도를 읽어 기억한다. 기억이 갱신되면 true.
    /// </summary>
    public static bool TryLearnOutputLimit(string? provider, string? responseBody, out int limit)
    {
        limit = 0;
        if (!HasLargeWindow(provider) || string.IsNullOrWhiteSpace(responseBody))
        {
            return false;
        }

        var match = OutputLimitRegex.Match(responseBody);
        if (!match.Success
            || !int.TryParse(match.Groups["limit"].Value, out var parsed)
            || parsed < LargeWindowMinOutputTokens
            || parsed >= LargeWindowTokens)
        {
            return false;
        }

        var key = NormalizeProviderKey(provider);
        var previous = LearnedOutputLimits.TryGetValue(key, out var known) ? known : LargeWindowTokens;
        if (parsed >= previous)
        {
            return false;
        }

        LearnedOutputLimits[key] = parsed;
        limit = parsed;
        return true;
    }

    /// <summary>테스트에서 학습값을 비운다.</summary>
    public static void ResetLearnedOutputLimits() => LearnedOutputLimits.Clear();

    private static string NormalizeProviderKey(string? provider) => (provider ?? string.Empty).Trim().ToLowerInvariant();

    /// <summary>[컨텍스트 사용 규칙]+이력+새 요청을 합친 프롬프트의 문자 상한.</summary>
    public static int ResolveContextPromptChars(string? provider)
    {
        return HasLargeWindow(provider) ? LargeWindowContextPromptChars : DefaultContextPromptChars;
    }

    /// <summary>[최근 대화] 섹션에 쓸 문자 예산.</summary>
    public static int ResolveHistoryChars(string? provider)
    {
        return HasLargeWindow(provider) ? LargeWindowHistoryChars : DefaultHistoryChars;
    }
}
