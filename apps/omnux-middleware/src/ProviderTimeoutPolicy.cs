namespace Omnux.Middleware;

internal static class ProviderTimeoutPolicy
{
    public static TimeSpan ResolveSharedHttpTimeout(ProviderOptions providers, ContextOptions context)
    {
        var llmTimeoutMs = Math.Max(5000, context.LlmTimeoutSec * 1000);
        var providerTimeoutMs = Math.Max(
            Math.Max(providers.NvidiaTimeoutSec, providers.CerebrasTimeoutSec),
            45
        ) * 1000;
        var geminiWebTimeoutMs = NormalizeGeminiGroundedTimeoutMs(context.GeminiWebTimeoutMs);
        return TimeSpan.FromMilliseconds(Math.Max(Math.Max(llmTimeoutMs, providerTimeoutMs + 5000), geminiWebTimeoutMs + 5000));
    }

    public static int ResolveSingleChatTimeoutSeconds(
        string normalizedProvider,
        ProviderOptions providers,
        ContextOptions context,
        int? overrideSeconds = null
    )
    {
        if (overrideSeconds.HasValue)
        {
            return Math.Max(1, overrideSeconds.Value);
        }

        return normalizedProvider switch
        {
            "groq" => Math.Max(90, context.LlmTimeoutSec * 3),
            "gemini" => Math.Max(90, context.LlmTimeoutSec * 3),
            "copilot" => Math.Max(120, context.LlmTimeoutSec * 3),
            "codex" => Math.Max(120, context.LlmTimeoutSec * 3),
            "grok" => Math.Max(120, context.LlmTimeoutSec * 3),
            "cerebras" => Math.Max(120, providers.CerebrasTimeoutSec * 3),
            "nvidia" => Math.Max(360, providers.NvidiaTimeoutSec * 2),
            "deepseek" => Math.Max(360, providers.DeepseekTimeoutSec * 2),
            _ => Math.Max(8, context.LlmTimeoutSec)
        };
    }

    public static int NormalizeGeminiGroundedTimeoutMs(int timeoutMs)
    {
        if (timeoutMs <= 0)
        {
            return 30000;
        }

        return Math.Clamp(timeoutMs, 5000, 60000);
    }

    /// <summary>
    /// 그라운딩 응답의 첫 텍스트까지 기다릴 시간.
    ///
    /// 서버측 검색은 첫 토큰 전에 검색 왕복을 끝내야 해서 일반 생성보다 훨씬 늦게 시작한다.
    /// 예전 상한 7초로는 gemini-3.5-flash 가 늘 걸렸고(실측 8.6초), 대화 맥락이 붙어 프롬프트가
    /// 커질수록 더 늦어져 사용자가 고른 모델이 매번 검색 전용 폴백 모델로 밀려났다.
    /// </summary>
    public static int NormalizeGeminiGroundedFirstChunkTimeoutMs(int totalTimeoutMs)
    {
        var normalizedTotal = NormalizeGeminiGroundedTimeoutMs(totalTimeoutMs);
        var derived = Math.Clamp(normalizedTotal / 2, 12000, 25000);
        return Math.Clamp(derived, 3000, normalizedTotal);
    }

    public static int NormalizeGeminiUrlContextFirstChunkTimeoutMs(int totalTimeoutMs)
    {
        var normalizedTotal = NormalizeGeminiGroundedTimeoutMs(totalTimeoutMs);
        var derived = Math.Min(30000, Math.Max(8000, normalizedTotal));
        return Math.Clamp(derived, 8000, normalizedTotal);
    }
}
