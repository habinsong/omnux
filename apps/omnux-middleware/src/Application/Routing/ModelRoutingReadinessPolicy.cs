namespace Omnux.Middleware;

internal sealed record ModelRoutingPlan(
    string Complexity,
    string RecommendedTier,
    bool CascadeEligible,
    long EstimatedInputTokens,
    string Signals,
    string Reason
);

internal static class ModelRoutingReadinessPolicy
{
    public const string Simple = "simple";
    public const string Moderate = "moderate";
    public const string Complex = "complex";

    public static ModelRoutingPlan Analyze(string provider, string model, string prompt)
    {
        var normalizedPrompt = (prompt ?? string.Empty).Trim();
        var estimatedTokens = TokenUsageEstimator.Estimate(normalizedPrompt, string.Empty).PromptTokens;
        var signals = new List<string>();
        var complexSignals = 0;
        var moderateSignals = 0;

        if (estimatedTokens >= 6_000)
        {
            signals.Add("large_prompt");
            complexSignals += 2;
        }
        else if (estimatedTokens >= 1_800)
        {
            signals.Add("medium_prompt");
            moderateSignals += 1;
        }

        if (ContainsAny(normalizedPrompt, "architecture", "아키텍처", "설계", "대공사", "migration", "마이그레이션"))
        {
            signals.Add("architecture");
            complexSignals += 1;
        }

        if (ContainsAny(normalizedPrompt, "debug", "failing", "stack trace", "디버그", "오류", "실패", "테스트 실패"))
        {
            signals.Add("debugging");
            moderateSignals += 1;
        }

        if (ContainsAny(normalizedPrompt, "implement", "refactor", "코드 수정", "구현", "리팩터", "리팩토링"))
        {
            signals.Add("code_change");
            moderateSignals += 1;
        }

        if (ContainsAny(normalizedPrompt, "compare", "analyze", "reason", "비교", "분석", "추론"))
        {
            signals.Add("reasoning");
            moderateSignals += 1;
        }

        if (ContainsAny(normalizedPrompt, "summarize", "format", "extract", "classify", "요약", "정리", "추출", "분류", "포맷"))
        {
            signals.Add("transform");
        }

        var complexity = ResolveComplexity(estimatedTokens, complexSignals, moderateSignals, signals);
        var tier = complexity switch
        {
            Complex => "frontier",
            Moderate => "balanced",
            _ => "economy"
        };
        var cascadeEligible = complexity != Complex && estimatedTokens <= 6_000 && !IsPinnedHighControlProvider(provider);
        var reason = BuildReason(complexity, estimatedTokens, signals);

        return new ModelRoutingPlan(
            complexity,
            tier,
            cascadeEligible,
            Math.Max(0L, estimatedTokens),
            string.Join(",", signals.Distinct(StringComparer.Ordinal).Take(8)),
            reason
        );
    }

    private static string ResolveComplexity(
        long estimatedTokens,
        int complexSignals,
        int moderateSignals,
        IReadOnlyList<string> signals
    )
    {
        if (estimatedTokens >= 6_000 || complexSignals >= 2 || (complexSignals >= 1 && moderateSignals >= 2))
        {
            return Complex;
        }

        if (estimatedTokens >= 1_800 || complexSignals >= 1 || moderateSignals >= 2)
        {
            return Moderate;
        }

        if (moderateSignals == 1 && !signals.Contains("transform", StringComparer.Ordinal))
        {
            return Moderate;
        }

        return Simple;
    }

    private static bool IsPinnedHighControlProvider(string? provider)
    {
        var normalized = (provider ?? string.Empty).Trim().ToLowerInvariant();
        return normalized is "codex" or "copilot";
    }

    private static bool ContainsAny(string text, params string[] needles)
    {
        return needles.Any(needle => text.Contains(needle, StringComparison.OrdinalIgnoreCase));
    }

    private static string BuildReason(string complexity, long estimatedTokens, IReadOnlyList<string> signals)
    {
        var signalText = signals.Count == 0
            ? "no_special_signals"
            : string.Join("+", signals.Distinct(StringComparer.Ordinal).Take(4));
        return $"{complexity}:tokens={Math.Max(0L, estimatedTokens)}:{signalText}";
    }
}
