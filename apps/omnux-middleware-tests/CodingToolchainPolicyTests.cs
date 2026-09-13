using Omnux.Middleware;
using Xunit;

namespace Omnux.Middleware.Tests;

public class CodingToolchainPolicyTests
{
    [Fact]
    public void GoBuildCommandRequiresGo()
    {
        var required = CodingToolchainPolicy.DetectRequiredExecutables("cd '/tmp/run' && go build ./... && ./app");

        Assert.Contains("go", required);
    }

    [Fact]
    public void WordsContainingToolNameDoNotTrigger()
    {
        // "cargo" 가 경로 일부로 들어간 경우까지 툴체인 요구로 보면 안 된다.
        var required = CodingToolchainPolicy.DetectRequiredExecutables("python3 mycargo/run.py && echo gogo");

        Assert.DoesNotContain("cargo", required);
        Assert.DoesNotContain("go", required);
        Assert.Contains("python3", required);
    }

    [Fact]
    public void MultipleToolsAreDetectedOnce()
    {
        var required = CodingToolchainPolicy.DetectRequiredExecutables("cmake -S . -B build && cmake --build build && node index.js");

        Assert.Equal(new[] { "cmake", "node" }, required);
    }

    [Fact]
    public void MissingToolchainMessageNamesInstallStep()
    {
        var message = CodingToolchainPolicy.BuildMissingToolchainMessage(new[] { "go" });

        Assert.Contains("Go", message);
        Assert.Contains("golang-go", message);
    }

    [Fact]
    public void NothingMissingProducesEmptyMessage()
    {
        Assert.Equal(string.Empty, CodingToolchainPolicy.BuildMissingToolchainMessage(System.Array.Empty<string>()));
    }
}
