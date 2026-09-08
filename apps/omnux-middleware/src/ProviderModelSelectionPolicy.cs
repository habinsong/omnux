namespace Omnux.Middleware;

internal static class ProviderModelSelectionPolicy
{
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
