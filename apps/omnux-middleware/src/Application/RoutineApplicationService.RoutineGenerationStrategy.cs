namespace Omnux.Middleware;

public sealed partial class RoutineApplicationService
{
    private async Task<RoutineModelStrategy> SelectRoutineCodingStrategyAsync(
        string objective,
        string? requestedProvider,
        string? requestedModel,
        CancellationToken cancellationToken
    )
    {
        static bool Has(IReadOnlySet<string> set, string modelId) => set.Contains(modelId);

        // 자동화 폼에서 담당 제공자를 골랐으면 그 제공자가 스크립트를 만든다.
        // 예전에는 무조건 Groq 이라, Gemini/DeepSeek 만 쓰는 사람은 자동화를 아예 못 만들었다.
        var chosenProvider = (requestedProvider ?? string.Empty).Trim().ToLowerInvariant();
        if (chosenProvider.Length > 0 && chosenProvider != "auto" && chosenProvider != "groq")
        {
            var chosenModel = string.IsNullOrWhiteSpace(requestedModel)
                ? ModelRegistry.GetDefaultModel(chosenProvider)
                : requestedModel!.Trim();
            return new RoutineModelStrategy("single", new[] { chosenModel }, "user_selected_provider", chosenProvider);
        }

        var availableModels = await _groqModelCatalog.GetModelsAsync(cancellationToken);
        var modelSet = availableModels.Select(x => x.Id).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var estimatedTokens = EstimatePromptTokens(objective);

        var maverickReady = Has(modelSet, RoutineModelMaverick) && !IsGroqRateLimitImminent(RoutineModelMaverick, 2200);
        var gptOssReady = Has(modelSet, RoutineModelGptOss) && !IsGroqRateLimitImminent(RoutineModelGptOss, 2200);
        var kimiReady = Has(modelSet, RoutineModelKimi) && !IsGroqRateLimitImminent(RoutineModelKimi, 2200);

        if (estimatedTokens <= 6000 && maverickReady)
        {
            return new RoutineModelStrategy("single", new[] { RoutineModelMaverick }, $"estimated_tpm={estimatedTokens}");
        }

        if (gptOssReady)
        {
            return new RoutineModelStrategy("single", new[] { RoutineModelGptOss }, $"fallback_from_maverick estimated_tpm={estimatedTokens}");
        }

        if (kimiReady)
        {
            return new RoutineModelStrategy("single", new[] { RoutineModelKimi }, "fallback_from_gptoss");
        }

        var split = new List<string>();
        if (Has(modelSet, RoutineModelMaverick))
        {
            split.Add(RoutineModelMaverick);
        }

        if (Has(modelSet, RoutineModelGptOss))
        {
            split.Add(RoutineModelGptOss);
        }

        if (Has(modelSet, RoutineModelKimi))
        {
            split.Add(RoutineModelKimi);
        }

        if (split.Count == 0)
        {
            split.Add(_llmRouter.GetSelectedGroqModel());
        }

        while (split.Count < 3)
        {
            split.Add(split[^1]);
        }

        return new RoutineModelStrategy("split", split.Take(3).ToArray(), "all_models_budget_limited");
    }

    /// <summary>스크립트 생성에 쓸 제공자의 키가 있는지. 고르지 않았으면 기본값 Groq 를 본다.</summary>
    private bool HasRoutineScriptProviderKey(string? requestedProvider)
    {
        var provider = (requestedProvider ?? string.Empty).Trim().ToLowerInvariant();
        return provider switch
        {
            "gemini" => _llmRouter.HasGeminiApiKey(),
            "deepseek" => _llmRouter.HasDeepseekApiKey(),
            "cerebras" => _llmRouter.HasCerebrasApiKey(),
            "nvidia" => _llmRouter.HasNvidiaApiKey(),
            // CLI 제공자는 키가 아니라 로그인 상태로 판단하므로 여기서 막지 않는다.
            "codex" or "copilot" or "grok" => true,
            _ => _llmRouter.HasGroqApiKey()
        };
    }

    /// <summary>키가 없을 때 사용자에게 보여 줄 안내.</summary>
    private static string BuildRoutineScriptProviderKeyMessage(string? requestedProvider, string action)
    {
        var provider = (requestedProvider ?? string.Empty).Trim().ToLowerInvariant();
        var label = provider.Length == 0 || provider == "auto" ? "Groq" : ModelRegistry.GetLabel(provider);
        return $"루틴 스크립트 {action} 실패: {label} API 키가 없어 실행 코드를 만들 수 없습니다. "
               + $"설정에서 {label} 키를 저장하거나, 담당 모델 제공자를 바꾸거나, 실행 모드를 일반 답변/URL 참조/브라우저 에이전트로 바꾸세요.";
    }
}
