using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class AdaptiveContextCompressionPolicyTests
{
    [Fact]
    public void EvaluateSkipsShortConversation()
    {
        var thread = BuildThread(
            User("짧은 질문"),
            Assistant("짧은 답변")
        );

        var decision = AdaptiveContextCompressionPolicy.Evaluate(thread, DefaultContext());

        Assert.False(decision.ShouldCompress);
        Assert.Equal("not_enough_messages", decision.Reason);
    }

    [Fact]
    public void EvaluateTriggersOnCharacterThreshold()
    {
        var longText = new string('가', 400);
        var thread = BuildThread(Enumerable.Range(0, 10)
            .Select(index => index % 2 == 0 ? User(longText) : Assistant(longText))
            .ToArray());

        var decision = AdaptiveContextCompressionPolicy.Evaluate(
            thread,
            DefaultContext(compressChars: 3_000, keepRecentMessages: 4)
        );

        Assert.True(decision.ShouldCompress);
        Assert.Equal("char_threshold", decision.Reason);
        Assert.True(decision.TotalCharacters >= 3_000);
    }

    [Fact]
    public void EvaluateTriggersOnTokenThresholdBeforeCharacterThreshold()
    {
        var messages = Enumerable.Range(0, 14)
            .Select(index => index % 2 == 0
                ? User("토큰 임계치 테스트")
                : Assistant("짧은 답변", new TokenUsage(1_500, 2_000, 3_500, TokenUsageEstimator.SourceExact)))
            .ToArray();
        var thread = BuildThread(messages);

        var decision = AdaptiveContextCompressionPolicy.Evaluate(
            thread,
            DefaultContext(compressChars: 999_999, keepRecentMessages: 4)
        );

        Assert.True(decision.ShouldCompress);
        Assert.Equal("token_threshold", decision.Reason);
        Assert.True(decision.EstimatedTokens >= decision.ThresholdTokens);
    }

    private static ConversationMessageView User(string text)
    {
        return new ConversationMessageView("user", text, "test:user", DateTimeOffset.UtcNow);
    }

    private static ConversationMessageView Assistant(string text, TokenUsage? usage = null)
    {
        return new ConversationMessageView("assistant", text, "test:assistant", DateTimeOffset.UtcNow, usage);
    }

    private static ConversationThreadView BuildThread(params ConversationMessageView[] messages)
    {
        return new ConversationThreadView(
            "conv-1",
            "chat",
            "single",
            "테스트 대화",
            "기본",
            "일반",
            Array.Empty<string>(),
            DateTimeOffset.UtcNow,
            DateTimeOffset.UtcNow,
            messages,
            Array.Empty<string>(),
            null,
            TokenUsageEstimator.Combine(messages.Select(message => message.TokenUsage))
        );
    }

    private static ContextOptions DefaultContext(
        int compressChars = 12_000,
        int keepRecentMessages = 16
    )
    {
        return new ContextOptions(
            ConversationCompressChars: compressChars,
            ConversationKeepRecentMessages: keepRecentMessages,
            ConversationHistoryMessages: 18,
            CodingAgentMaxIterations: 5,
            CodingAgentMaxActionsPerIteration: 6,
            CodingCopilotMaxActionsPerIteration: 4,
            CodingWorkspaceSnapshotMaxEntries: 80,
            CodingRecentLoopHistoryForCopilot: 10,
            CodingEnableOneShotUiClone: true,
            ChatMaxOutputTokens: 8192,
            CodingMaxOutputTokens: 16384,
            LlmTimeoutSec: 60,
            SingleChatDefaultTimeoutSec: 90,
            CerebrasMinSingleChatTimeoutSec: 60,
            NvidiaMinSingleChatTimeoutSec: 120,
            EnableFastWebPipeline: true,
            WebDecisionTimeoutMs: 900,
            GeminiWebTimeoutMs: 60_000,
            WebDefaultNewsCount: 6,
            WebDefaultListCount: 8,
            CommandMaxLength: 12_000,
            MetricsPushIntervalSec: 2
        );
    }
}
