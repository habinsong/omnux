namespace Omnux.Middleware;

public sealed partial class CommandService
{
    private async Task<RoutineModelStrategy> SelectRoutineCodingStrategyAsync(string objective, CancellationToken cancellationToken)
    {
        static bool Has(IReadOnlySet<string> set, string modelId) => set.Contains(modelId);

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
}
