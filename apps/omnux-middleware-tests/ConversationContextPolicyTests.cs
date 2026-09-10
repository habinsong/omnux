using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class ConversationContextPolicyTests
{
    [Theory]
    [InlineData("why is that?", true, false)]
    [InlineData("continue from the previous answer", true, false)]
    [InlineData("compare P2S and H2S", true, true)]
    [InlineData("ㅎㅇ", false, false)]
    public void ShouldUsePriorConversationContextClassifiesFollowupsAndStandaloneGreeting(
        string input,
        bool expectedUseContext,
        bool expectedAmbiguous
    )
    {
        var useContext = ConversationContextPolicy.ShouldUsePriorConversationContext(input, out var isAmbiguous);

        Assert.Equal(expectedUseContext, useContext);
        Assert.Equal(expectedAmbiguous, isAmbiguous);
    }

    [Theory]
    [InlineData("why is that?", true)]
    [InlineData("example?", true)]
    [InlineData("describe a new project structure", false)]
    public void LooksLikeStrongFollowupQuestionDetectsAnaphoricQuestions(string input, bool expected)
    {
        Assert.Equal(expected, ConversationContextPolicy.LooksLikeStrongFollowupQuestion(input));
    }

    [Theory]
    [InlineData("Explain how to use the OpenAI SDK", true)]
    [InlineData("more detail on that previous answer", false)]
    [InlineData("what", false)]
    public void LooksLikeExplicitStandaloneQuestionRequiresStandaloneTopic(string input, bool expected)
    {
        Assert.Equal(expected, ConversationContextPolicy.LooksLikeExplicitStandaloneQuestion(input));
    }

    [Fact]
    public void ExtractContextTokensDropsStopWordsAndNormalizesPunctuation()
    {
        var tokens = ConversationContextPolicy.ExtractContextTokens("the OpenAI-SDK, about this");

        Assert.Contains("openai-sdk", tokens);
        Assert.DoesNotContain("the", tokens);
        Assert.DoesNotContain("about", tokens);
        Assert.DoesNotContain("this", tokens);
    }

    [Fact]
    public void HasMeaningfulTokenOverlapAcceptsLongOrMultipleSharedTokens()
    {
        var longTokenLeft = ConversationContextPolicy.ExtractContextTokens("openai-sdk streaming");
        var longTokenRight = ConversationContextPolicy.ExtractContextTokens("openai-sdk retry");
        Assert.True(ConversationContextPolicy.HasMeaningfulTokenOverlap(longTokenLeft, longTokenRight));

        var shortLeft = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "ab", "cd" };
        var shortRight = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "ab", "cd" };
        Assert.True(ConversationContextPolicy.HasMeaningfulTokenOverlap(shortLeft, shortRight));

        var weakLeft = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "ab" };
        var weakRight = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "ab" };
        Assert.False(ConversationContextPolicy.HasMeaningfulTokenOverlap(weakLeft, weakRight));
    }

    [Theory]
    [InlineData("a", true)]
    [InlineData("openai", false)]
    [InlineData("what", true)]
    public void IsContextStopTokenUsesSharedStopList(string token, bool expected)
    {
        Assert.Equal(expected, ConversationContextPolicy.IsContextStopToken(token));
    }
}
