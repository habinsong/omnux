namespace Omnux.Middleware;

internal sealed record AdaptiveContextCompressionDecision(
    bool ShouldCompress,
    string Reason,
    int TotalCharacters,
    long EstimatedTokens,
    long ThresholdTokens,
    int MessageCount,
    int KeepRecentMessages
);

internal static class AdaptiveContextCompressionPolicy
{
    private const double TriggerWindowRatio = 0.70d;
    private const int MinCharacterThreshold = 2_000;
    private const int MinimumCompressibleMessages = 8;
    private const int MinimumContextWindowTokens = 16_000;

    public static AdaptiveContextCompressionDecision Evaluate(
        ConversationThreadView? thread,
        ContextOptions context
    )
    {
        var keepRecentMessages = Math.Max(2, context.ConversationKeepRecentMessages);
        if (thread == null || thread.Messages.Count <= keepRecentMessages || thread.Messages.Count < MinimumCompressibleMessages)
        {
            return new AdaptiveContextCompressionDecision(
                false,
                "not_enough_messages",
                0,
                0,
                ResolveThresholdTokens(context),
                thread?.Messages.Count ?? 0,
                keepRecentMessages
            );
        }

        var totalCharacters = thread.Messages.Sum(message => message.Text?.Length ?? 0);
        var estimatedTokens = EstimateConversationTokens(thread);
        var characterThreshold = Math.Max(MinCharacterThreshold, context.ConversationCompressChars);
        var thresholdTokens = ResolveThresholdTokens(context);
        var messageCountThreshold = Math.Max(keepRecentMessages * 3, MinimumCompressibleMessages);

        if (estimatedTokens >= thresholdTokens)
        {
            return CreateDecision(
                true,
                "token_threshold",
                totalCharacters,
                estimatedTokens,
                thresholdTokens,
                thread.Messages.Count,
                keepRecentMessages
            );
        }

        if (totalCharacters >= characterThreshold)
        {
            return CreateDecision(
                true,
                "char_threshold",
                totalCharacters,
                estimatedTokens,
                thresholdTokens,
                thread.Messages.Count,
                keepRecentMessages
            );
        }

        if (thread.Messages.Count >= messageCountThreshold)
        {
            return CreateDecision(
                true,
                "message_threshold",
                totalCharacters,
                estimatedTokens,
                thresholdTokens,
                thread.Messages.Count,
                keepRecentMessages
            );
        }

        return CreateDecision(
            false,
            "below_threshold",
            totalCharacters,
            estimatedTokens,
            thresholdTokens,
            thread.Messages.Count,
            keepRecentMessages
        );
    }

    private static AdaptiveContextCompressionDecision CreateDecision(
        bool shouldCompress,
        string reason,
        int totalCharacters,
        long estimatedTokens,
        long thresholdTokens,
        int messageCount,
        int keepRecentMessages
    )
    {
        return new AdaptiveContextCompressionDecision(
            shouldCompress,
            reason,
            totalCharacters,
            estimatedTokens,
            thresholdTokens,
            messageCount,
            keepRecentMessages
        );
    }

    private static long ResolveThresholdTokens(ContextOptions context)
    {
        var estimatedWindow = Math.Max(MinimumContextWindowTokens, Math.Max(1, context.ChatMaxOutputTokens) * 4L);
        return Math.Max(1L, (long)Math.Floor(estimatedWindow * TriggerWindowRatio));
    }

    private static long EstimateConversationTokens(ConversationThreadView thread)
    {
        long total = 0;
        foreach (var message in thread.Messages)
        {
            if (message.TokenUsage is { TotalTokens: > 0 } usage
                && string.Equals(message.Role, "assistant", StringComparison.OrdinalIgnoreCase))
            {
                total += usage.TotalTokens;
                continue;
            }

            total += TokenUsageEstimator.Estimate(string.Empty, message.Text).TotalTokens;
        }

        return Math.Max(0L, total);
    }
}
