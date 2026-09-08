namespace Omnux.Middleware;

internal static class ProviderModelSelectionPolicy
{
    private static readonly string[] KnownLlmProviders =
    {
        "gemini", "groq", "cerebras", "nvidia", "copilot", "codex", "grok"
    };

    public static string NormalizeProviderAliases(string? provider)
    {
        var value = (provider ?? string.Empty).Trim().ToLowerInvariant();
        if (value == "nvidia-nim" || value == "nvidia_nim" || value == "nim")
        {
            value = "nvidia";
        }

        return value;
    }

    /// <summary>
    /// 실제 LLM 프로바이더 키인지 판별한다. "local"/"browser"/"system" 같은 의사(pseudo) 프로바이더는 false.
    /// </summary>
    public static bool IsKnownLlmProvider(string? provider)
    {
        return Array.IndexOf(KnownLlmProviders, NormalizeProviderAliases(provider)) >= 0;
    }

    /// <summary>
    /// 턴 종료 후 정비 작업(제목 생성/압축 요약)이 재사용할 모델 힌트를 정제한다.
    /// 의사 프로바이더의 라벨(예: provider="local", model="assistant_info" / provider="browser", model=어댑터명)이나
    /// 플레이스홀더("-")를 그대로 넘기면 실제 프로바이더에 없는 모델명으로 호출돼 404 model_not_found 가 난다.
    /// 신뢰할 수 없는 힌트는 null 로 떨어뜨려 프로바이더 기본 모델을 쓰게 한다.
    /// </summary>
    public static string? SanitizeMaintenanceModel(string? preferredProvider, string? preferredModel)
    {
        if (!IsKnownLlmProvider(preferredProvider))
        {
            return null;
        }

        var trimmed = (preferredModel ?? string.Empty).Trim();
        if (trimmed.Length == 0 || trimmed == "-")
        {
            return null;
        }

        return trimmed;
    }

    public static bool IsPinnedCopilotProvider(string? provider)
    {
        return string.Equals((provider ?? string.Empty).Trim(), "copilot", StringComparison.OrdinalIgnoreCase);
    }

    public static string? NormalizePinnedProviderModelSelection(
        string provider,
        string? modelOverride,
        string defaultCopilotModel,
        Func<string?, string?> normalizeModelSelection
    )
    {
        var selected = normalizeModelSelection(modelOverride);
        if (!string.IsNullOrWhiteSpace(selected))
        {
            return selected;
        }

        if (IsPinnedCopilotProvider(provider))
        {
            return defaultCopilotModel;
        }

        return selected;
    }

    public static bool IsPinnedCopilotModel(string provider, string model, string defaultCopilotModel)
    {
        return IsPinnedCopilotProvider(provider)
            && string.Equals((model ?? string.Empty).Trim(), defaultCopilotModel, StringComparison.OrdinalIgnoreCase);
    }
}
