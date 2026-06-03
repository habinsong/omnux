using System.Security.Cryptography;
using System.Text;

namespace Omnux.Middleware;

public sealed record PromptCachePlan(
    bool Eligible,
    string CacheKey,
    string AffinityKey,
    int StaticPrefixChars,
    long EstimatedStaticPrefixTokens,
    string Strategy,
    string Reason
);

internal static class PromptCachePolicy
{
    public const int MinStaticPrefixTokens = 256;
    private const int HashChars = 24;

    private static readonly string[] PrefixMarkers =
    {
        "\n\n사용자 입력:\n",
        "\n사용자 입력:\n",
        "\n\nUser request:\n",
        "\nUser request:\n",
        "\n\nCurrent request:\n",
        "\nCurrent request:\n",
        "\n\n[사용자]",
        "\n[사용자]"
    };

    public static PromptCachePlan Analyze(
        string provider,
        string model,
        string prompt
    )
    {
        var normalizedProvider = NormalizeToken(provider, "unknown").ToLowerInvariant();
        var normalizedModel = NormalizeToken(model, "unknown");
        var prefix = ExtractStaticPrefix(prompt ?? string.Empty, out var strategy);
        var staticChars = prefix.Length;
        var estimatedTokens = TokenUsageEstimator.Estimate(prefix, string.Empty).PromptTokens;
        if (staticChars == 0)
        {
            return new PromptCachePlan(
                false,
                string.Empty,
                string.Empty,
                0,
                0,
                strategy,
                "no_static_prefix"
            );
        }

        var cacheKey = BuildHash($"{normalizedProvider}\n{normalizedModel}\n{prefix}", HashChars);
        var affinityKey = BuildHash($"{normalizedProvider}\n{normalizedModel}\n{cacheKey}", 16);
        var eligible = estimatedTokens >= MinStaticPrefixTokens;
        return new PromptCachePlan(
            eligible,
            cacheKey,
            affinityKey,
            staticChars,
            estimatedTokens,
            strategy,
            eligible ? "eligible_static_prefix" : "static_prefix_below_threshold"
        );
    }

    private static string ExtractStaticPrefix(string prompt, out string strategy)
    {
        var normalized = (prompt ?? string.Empty).Replace("\r\n", "\n", StringComparison.Ordinal);
        var bestIndex = -1;
        var bestMarker = string.Empty;
        foreach (var marker in PrefixMarkers)
        {
            var index = normalized.LastIndexOf(marker, StringComparison.OrdinalIgnoreCase);
            if (index > bestIndex)
            {
                bestIndex = index;
                bestMarker = marker;
            }
        }

        if (bestIndex > 0)
        {
            strategy = "prefix_marker";
            return normalized[..bestIndex].Trim();
        }

        strategy = string.IsNullOrWhiteSpace(bestMarker) ? "none" : "prefix_marker";
        return string.Empty;
    }

    private static string BuildHash(string value, int chars)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(value ?? string.Empty));
        var hex = Convert.ToHexString(bytes).ToLowerInvariant();
        return hex.Length <= chars ? hex : hex[..chars];
    }

    private static string NormalizeToken(string? value, string fallback)
    {
        var normalized = (value ?? string.Empty).Trim();
        if (normalized.Length == 0)
        {
            return fallback;
        }

        return normalized.Length <= 160 ? normalized : normalized[..160];
    }
}
