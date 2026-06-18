using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class AskSkillAutoSelectPolicyTests
{
    private static SkillManifest Skill(string name, string description = "")
    {
        return new SkillManifest(name, description, $"/skills/{name}.md", "project");
    }

    [Fact]
    public void SelectsSkillWhenJoinedNameAppearsInsideKoreanParticles()
    {
        var skills = new[] { Skill("code-review"), Skill("daily-brief") };
        Assert.Equal("code-review", AskSkillAutoSelectPolicy.SelectSingleConfident("이 PR codereview 해줘", skills));
        Assert.Equal("code-review", AskSkillAutoSelectPolicy.SelectSingleConfident("code review 스킬 기준으로 봐줘", skills));
    }

    [Fact]
    public void SelectsKoreanSkillNameWithParticleSuffix()
    {
        var skills = new[] { Skill("코드리뷰"), Skill("뉴스브리핑") };
        Assert.Equal("코드리뷰", AskSkillAutoSelectPolicy.SelectSingleConfident("이 변경 코드리뷰로 검토해줘", skills));
    }

    [Fact]
    public void ReturnsNullWhenMultipleSkillNamesMatch()
    {
        var skills = new[] { Skill("code-review"), Skill("review-notes") };
        Assert.Null(AskSkillAutoSelectPolicy.SelectSingleConfident("code review 하고 review notes 정리해줘", skills));
    }

    [Fact]
    public void ReturnsNullWhenNoSkillNameAppears()
    {
        var skills = new[] { Skill("code-review"), Skill("daily-brief") };
        Assert.Null(AskSkillAutoSelectPolicy.SelectSingleConfident("오늘 비트코인 시세 알려줘", skills));
    }

    [Fact]
    public void IgnoresTooShortSkillNames()
    {
        var skills = new[] { Skill("ai"), Skill("뉴스") };
        Assert.Null(AskSkillAutoSelectPolicy.SelectSingleConfident("ai 뉴스 알려줘", skills));
    }

    [Fact]
    public void RejectsShortSingleTokenNameViaTokenPath()
    {
        // 토큰 1개 + 길이<4 는 흔한 단어 오탐 위험 — 연결형 포함이 아니면 매칭 금지.
        var skills = new[] { Skill("rag") };
        Assert.Null(AskSkillAutoSelectPolicy.SelectSingleConfident("오늘 점심 메뉴 추천", skills));
    }

    [Theory]
    [InlineData("/skill code-review 해줘")]
    [InlineData("짧음")]
    [InlineData("")]
    public void ReturnsNullForSlashOrTooShortInput(string input)
    {
        var skills = new[] { Skill("code-review") };
        Assert.Null(AskSkillAutoSelectPolicy.SelectSingleConfident(input, skills));
    }

    [Theory]
    [InlineData(null, false)]
    [InlineData("1", false)]
    [InlineData("0", true)]
    [InlineData("off", true)]
    public void IsDisabledValueParsesEnvSemantics(string? raw, bool expected)
    {
        Assert.Equal(expected, AskSkillAutoSelectPolicy.IsDisabledValue(raw));
    }
}
