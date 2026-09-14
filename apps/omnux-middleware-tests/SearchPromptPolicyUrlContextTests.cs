using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class SearchPromptPolicyUrlContextTests
{
    private static string Build(string? fetchedPageContext)
    {
        return SearchPromptPolicy.BuildGeminiUrlContextAnswerPrompt(
            "이 페이지에 뭐가 있어?",
            new[] { "https://example.com/a", "https://example.com/b" },
            memoryHint: string.Empty,
            allowMarkdownTable: false,
            enforceTelegramOutputStyle: false,
            includeGoogleSearch: false,
            webDefaultNewsCount: 5,
            webDefaultListCount: 5,
            repositoryContext: null,
            fetchedPageContext: fetchedPageContext
        );
    }

    [Fact]
    public void 직접_받아_온_원문은_1차_근거로_들어간다()
    {
        var prompt = Build("[페이지 원문]\n### https://example.com/a\n본문 내용입니다.");

        Assert.Contains("[페이지 원문]", prompt);
        Assert.Contains("본문 내용입니다.", prompt);
        Assert.Contains("[직접 받아 온 페이지 원문]이 1차 근거다", prompt);
        // 보조 메모리 블록("충돌 시 무시")에 섞이면 모델이 원문을 읽고도 무시한다.
        Assert.DoesNotContain("사용자 선호 메모리", prompt);
    }

    [Fact]
    public void 원문이_없으면_1차_근거_안내도_넣지_않는다()
    {
        var prompt = Build(null);

        Assert.DoesNotContain("[직접 받아 온 페이지 원문]", prompt);
    }

    [Fact]
    public void 확인되지_않은_것을_없다고_단정하게_시키지_않는다()
    {
        var prompt = Build(null);

        Assert.Contains("'확인되지 않았다'고 말해라", prompt);
        Assert.Contains("'존재하지 않는다'로 바꿔 말하지 마라", prompt);
        Assert.DoesNotContain("확인되지 않으면 없다고 말해라", prompt);
    }
}
