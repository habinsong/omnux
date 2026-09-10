using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class CodingTaskSignalPolicyTests
{
    [Fact]
    public void LooksLikeBrowserAppUsesPathAndCanonicalTokens()
    {
        Assert.True(CodingTaskSignalPolicy.LooksLikeBrowserApp("create index.html"));
        Assert.True(CodingTaskSignalPolicy.LooksLikeBrowserApp("react vite screen"));
        Assert.False(CodingTaskSignalPolicy.LooksLikeBrowserApp("브라우저 앱 만들어줘"));
    }

    [Fact]
    public void LooksLikeCliUsesCanonicalTokens()
    {
        Assert.True(CodingTaskSignalPolicy.LooksLikeCli("python cli with stdin"));
        Assert.False(CodingTaskSignalPolicy.LooksLikeCli("명령줄에서 실행해줘"));
    }

    [Fact]
    public void LooksLikeProgramRunRequestUsesStdoutCues()
    {
        Assert.True(CodingTaskSignalPolicy.LooksLikeProgramRunRequest("print 'ok' from main.py"));
        Assert.True(CodingTaskSignalPolicy.LooksLikeProgramRunRequest("run the program"));
        Assert.False(CodingTaskSignalPolicy.LooksLikeProgramRunRequest("실행해서 확인해줘"));
    }

    [Fact]
    public void LooksLikeCsharpProjectRequestUsesCanonicalTokens()
    {
        Assert.True(CodingTaskSignalPolicy.LooksLikeCsharpProjectRequest("nuget package"));
        Assert.True(CodingTaskSignalPolicy.LooksLikeCsharpProjectRequest("App.csproj"));
        Assert.False(CodingTaskSignalPolicy.LooksLikeCsharpProjectRequest("프로젝트 만들어줘"));
    }
}
