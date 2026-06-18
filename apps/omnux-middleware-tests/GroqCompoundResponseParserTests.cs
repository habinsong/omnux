using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class GroqCompoundResponseParserTests
{
    // 2026-06 실측 응답을 축약한 픽스처 (executed_tools[].search_results = 배열 형태)
    private const string RealShapeFixture = """
    {
      "id": "req_x",
      "model": "groq/compound-mini",
      "choices": [
        {
          "message": {
            "role": "assistant",
            "content": "- 핵심 사실 A — 출처: https://a.example/news\n- 핵심 사실 B",
            "reasoning": "...",
            "executed_tools": [
              {
                "index": 0,
                "type": "search",
                "arguments": "{\"query\":\"오늘 뉴스\"}",
                "output": "...",
                "search_results": [
                  { "title": "A 뉴스", "url": "https://a.example/news", "content": "본문 A", "score": 0.91 },
                  { "title": "B 뉴스", "url": "https://b.example/news", "content": "본문 B", "score": 0.85 },
                  { "title": "A 뉴스 중복", "url": "https://a.example/news", "content": "중복", "score": 0.8 }
                ]
              }
            ]
          }
        }
      ],
      "usage": { "total_tokens": 5549 }
    }
    """;

    [Fact]
    public void TryParseExtractsTextModelAndDedupedSources()
    {
        var answer = GroqCompoundResponseParser.TryParse(RealShapeFixture);
        Assert.NotNull(answer);
        Assert.StartsWith("- 핵심 사실 A", answer!.Text);
        Assert.Equal("groq/compound-mini", answer.Model);
        Assert.Equal(2, answer.Sources.Count);
        Assert.Equal("A 뉴스", answer.Sources[0].Title);
        Assert.Equal("https://a.example/news", answer.Sources[0].Url);
        Assert.Equal("본문 A", answer.Sources[0].Snippet);
    }

    [Fact]
    public void TryParseSupportsWrappedResultsObject()
    {
        const string wrapped = """
        {
          "model": "groq/compound",
          "choices": [{ "message": {
            "content": "답변",
            "executed_tools": [{ "type": "search", "search_results": { "results": [
              { "title": "T", "url": "https://t.example", "content": "c" }
            ] } }]
          } }]
        }
        """;
        var answer = GroqCompoundResponseParser.TryParse(wrapped);
        Assert.NotNull(answer);
        Assert.Single(answer!.Sources);
        Assert.Equal("https://t.example", answer.Sources[0].Url);
    }

    [Fact]
    public void TryParseReturnsAnswerWithoutSourcesWhenNoTools()
    {
        const string noTools = """
        { "model": "groq/compound-mini", "choices": [{ "message": { "content": "그냥 답변" } }] }
        """;
        var answer = GroqCompoundResponseParser.TryParse(noTools);
        Assert.NotNull(answer);
        Assert.Equal("그냥 답변", answer!.Text);
        Assert.Empty(answer.Sources);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("not json")]
    [InlineData("{}")]
    [InlineData("""{ "choices": [] }""")]
    [InlineData("""{ "choices": [{ "message": { "content": "" } }] }""")]
    public void TryParseReturnsNullForInvalidOrEmptyResponses(string? body)
    {
        Assert.Null(GroqCompoundResponseParser.TryParse(body));
    }

    [Fact]
    public void TryParseCapsSourceCountAndSnippetLength()
    {
        var longContent = new string('x', GroqCompoundResponseParser.SourceSnippetMaxChars + 100);
        var items = string.Join(",", Enumerable.Range(0, GroqCompoundResponseParser.MaxSources + 4)
            .Select(i => $$"""{ "title": "t{{i}}", "url": "https://s{{i}}.example", "content": "{{longContent}}" }"""));
        var body = $$"""
        { "model": "m", "choices": [{ "message": {
          "content": "답",
          "executed_tools": [{ "search_results": [{{items}}] }]
        } }] }
        """;
        var answer = GroqCompoundResponseParser.TryParse(body);
        Assert.NotNull(answer);
        Assert.Equal(GroqCompoundResponseParser.MaxSources, answer!.Sources.Count);
        Assert.EndsWith("…", answer.Sources[0].Snippet);
        Assert.Equal(GroqCompoundResponseParser.SourceSnippetMaxChars + 1, answer.Sources[0].Snippet.Length);
    }

    [Fact]
    public void ResolveCompoundModelDefaultsToMini()
    {
        Assert.Equal("groq/compound-mini", GroqCompoundResponseParser.DefaultCompoundModel);
    }
}
