namespace Omnux.Middleware;

internal static class NaturalCommandResolutionPolicy
{
    public const double DefaultMinConfidence = 0.72d;
    public const int DefaultInterpretMaxTokens = 260;

    public static async Task<NaturalCommandInterpretation?> ResolveAsync(
        IReadOnlyList<NaturalCommandInterpretCandidate> candidates,
        string prompt,
        Func<NaturalCommandInterpretCandidate, string, CancellationToken, Task<string>> generateTextAsync,
        CancellationToken cancellationToken,
        double minConfidence = DefaultMinConfidence
    )
    {
        if (candidates == null || candidates.Count == 0)
        {
            return null;
        }

        NaturalCommandInterpretation? best = null;
        foreach (var candidate in candidates)
        {
            try
            {
                var generatedText = await generateTextAsync(candidate, prompt, cancellationToken);
                if (!NaturalCommandInterpretationPolicy.TryParseNaturalCommandInterpretation(generatedText, out var parsed))
                {
                    continue;
                }

                if (parsed.Kind == "command" && parsed.Confidence >= minConfidence)
                {
                    return parsed;
                }

                if (best == null || parsed.Confidence > best.Confidence)
                {
                    best = parsed;
                }
            }
            catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
            {
                continue;
            }
            catch
            {
                // 자연어 제어는 실패 시 다음 후보 모델로 우회한다.
            }
        }

        return best;
    }
}
