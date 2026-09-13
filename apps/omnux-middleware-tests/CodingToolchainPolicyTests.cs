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

public class CodingProviderFailurePolicyEmptyResponseTests
{
    [Fact]
    public void EmptyProviderResponseIsAFailureNotAPlan()
    {
        // DeepSeek 추론이 예산을 다 먹으면 본문이 비어 이 문자열이 온다. 계획으로 파싱하면 안 된다.
        Assert.Equal(
            CodingProviderFailureKind.Other,
            CodingProviderFailurePolicy.Classify("DeepSeek 응답이 비어 있습니다.")
        );
        Assert.Equal(
            CodingProviderFailureKind.Other,
            CodingProviderFailurePolicy.Classify("Gemini 응답이 비어 있습니다.")
        );
    }

    [Fact]
    public void NormalModelTextIsNotTreatedAsFailure()
    {
        Assert.Equal(
            CodingProviderFailureKind.None,
            CodingProviderFailurePolicy.Classify("{\"analysis\":\"파일을 만든다\",\"actions\":[]}")
        );
    }
}
