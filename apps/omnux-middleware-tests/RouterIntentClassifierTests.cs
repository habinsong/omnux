using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class RouterIntentClassifierTests
{
    [Theory]
    [InlineData("OS_CONTROL", RouterIntent.OsControl)]
    [InlineData("os_control", RouterIntent.OsControl)]
    [InlineData("category: OS_CONTROL", RouterIntent.OsControl)]
    [InlineData("QUERY_SYSTEM", RouterIntent.QuerySystem)]
    [InlineData("DYNAMIC_CODE", RouterIntent.DynamicCode)]
    [InlineData("unknown text", RouterIntent.Unknown)]
    [InlineData("", RouterIntent.Unknown)]
    public void MapFromLlmContentRecognizesCategoryKeywords(string content, RouterIntent expected)
    {
        Assert.Equal(expected, RouterIntentClassifier.MapFromLlmContent(content));
    }

    [Fact]
    public void MapFromLlmContentPrefersOsControlWhenMultipleKeywordsAppear()
    {
        var intent = RouterIntentClassifier.MapFromLlmContent("os_control + dynamic_code mentioned");
        Assert.Equal(RouterIntent.OsControl, intent);
    }

    [Theory]
    [InlineData("/kill 1234", RouterIntent.OsControl)]
    [InlineData("please terminate the worker", RouterIntent.OsControl)]
    [InlineData("/metrics summary", RouterIntent.QuerySystem)]
    [InlineData("show me the latest status", RouterIntent.QuerySystem)]
    [InlineData("analyze the logs", RouterIntent.QuerySystem)]
    [InlineData("/code build a quick prototype", RouterIntent.DynamicCode)]
    [InlineData("write a python script for me", RouterIntent.DynamicCode)]
    [InlineData("just a greeting", RouterIntent.Unknown)]
    public void ClassifyHeuristicMatchesPrefixesAndKeywords(string input, RouterIntent expected)
    {
        Assert.Equal(expected, RouterIntentClassifier.ClassifyHeuristic(input));
    }

    [Fact]
    public void ClassifyHeuristicHandlesNullOrEmptyInput()
    {
        Assert.Equal(RouterIntent.Unknown, RouterIntentClassifier.ClassifyHeuristic(string.Empty));
        Assert.Equal(RouterIntent.Unknown, RouterIntentClassifier.ClassifyHeuristic(null!));
    }
}
