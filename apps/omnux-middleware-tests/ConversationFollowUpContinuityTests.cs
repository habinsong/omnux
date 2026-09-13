using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

/// <summary>
/// 후속 질문이 이전 대화와 이어지는지 판정하는 규칙을 언어와 무관하게 고정한다.
/// 한국어는 조사가 붙어 "파이썬"과 "파이썬으로"가 다른 토큰이 되는데, 정확 일치만 보던
/// 예전 규칙은 이어지는 한국어 질문의 주제 겹침을 늘 놓쳤다.
/// </summary>
public sealed class ConversationFollowUpContinuityTests
{
    private static IReadOnlySet<string> Tokens(string text) => ConversationContextPolicy.ExtractContextTokens(text);

    [Fact]
    public void KoreanParticleSuffixStillMatchesSameTopic()
    {
        Assert.True(ConversationContextPolicy.TokensReferToSameThing("파이썬", "파이썬으로"));
        Assert.True(ConversationContextPolicy.TokensReferToSameThing("리액트에서", "리액트"));
    }

    [Fact]
    public void EnglishPluralAndSuffixMatch()
    {
        Assert.True(ConversationContextPolicy.TokensReferToSameThing("python", "pythons"));
        Assert.True(ConversationContextPolicy.TokensReferToSameThing("database", "databases"));
    }

    [Fact]
    public void ShortUnrelatedTokensDoNotMatch()
    {
        // "파일"은 "파이썬"의 접두사가 아니다.
        Assert.False(ConversationContextPolicy.TokensReferToSameThing("파일", "파이썬"));
        // 알파벳은 4자 미만 접두사를 인정하지 않는다.
        Assert.False(ConversationContextPolicy.TokensReferToSameThing("cat", "category"));
    }

    [Fact]
    public void KoreanFollowUpSharesTopicWithPreviousTurn()
    {
        var previous = Tokens("파이썬 최신 안정 버전 알려줘");
        var followUp = Tokens("파이썬으로 예제 코드도 보여줘");

        Assert.True(ConversationContextPolicy.HasMeaningfulTokenOverlap(followUp, previous));
    }

    [Fact]
    public void UnrelatedKoreanQuestionDoesNotShareTopic()
    {
        var previous = Tokens("파이썬 최신 안정 버전 알려줘");
        var unrelated = Tokens("내일 서울 날씨 어때");

        Assert.False(ConversationContextPolicy.HasMeaningfulTokenOverlap(unrelated, previous));
    }

    [Fact]
    public void ShortKoreanFollowUpIsNotStandalone()
    {
        Assert.False(ConversationContextPolicy.LooksLikeExplicitStandaloneQuestion("더 자세히"));
        Assert.False(ConversationContextPolicy.LooksLikeExplicitStandaloneQuestion("다시 해줘"));
    }

    [Fact]
    public void SubstantialTopicTokenIgnoresParticlesAndFillers()
    {
        Assert.True(ConversationContextPolicy.IsSubstantialTopicToken("파이썬"));
        Assert.True(ConversationContextPolicy.IsSubstantialTopicToken("useeffect"));
        Assert.True(ConversationContextPolicy.IsSubstantialTopicToken("3.14.7"));
        Assert.False(ConversationContextPolicy.IsSubstantialTopicToken("맞아"));
        Assert.False(ConversationContextPolicy.IsSubstantialTopicToken("why"));
    }

    [Fact]
    public void PureVerificationFollowUpHasNoSubstantialTopic()
    {
        // "이거 맞아?" 류는 직전 답변을 되묻는 것이라 새 웹검색을 돌릴 이유가 없다.
        var tokens = Tokens("이거 맞아?");

        Assert.DoesNotContain(tokens, ConversationContextPolicy.IsSubstantialTopicToken);
    }

    [Fact]
    public void NewSubjectInShortQuestionIsSubstantial()
    {
        // 같은 대화에서 대상만 바꿔 물으면 되묻기가 아니다 — 검색이 돌아야 한다.
        var tokens = Tokens("도커 최신 버전은?");

        Assert.Contains(tokens, ConversationContextPolicy.IsSubstantialTopicToken);
    }
}
