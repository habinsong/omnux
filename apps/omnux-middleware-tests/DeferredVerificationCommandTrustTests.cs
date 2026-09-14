using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class DeferredVerificationCommandTrustTests
{
    private static bool NotFrontend(string objective, string language) => false;

    [Theory]
    [InlineData("gofmt -l .")]
    [InlineData("gofmt -w .")]
    [InlineData("ls -la")]
    [InlineData("cat main.go")]
    [InlineData("echo done")]
    public void 실패할_수_없는_명령은_최종_검증으로_믿지_않는다(string command)
    {
        Assert.False(CodingExecutionSafetyPolicy.ShouldTrustDeferredVerificationCommand(
            "go",
            "소수를 출력하는 Go 프로그램을 만들어 주세요.",
            command,
            NotFrontend
        ));
    }

    [Theory]
    [InlineData("go test ./... && go build ./...")]
    [InlineData("go run .")]
    [InlineData("go vet ./...")]
    public void 빌드나_테스트를_하는_명령은_믿는다(string command)
    {
        Assert.True(CodingExecutionSafetyPolicy.ShouldTrustDeferredVerificationCommand(
            "go",
            "소수를 출력하는 Go 프로그램을 만들어 주세요.",
            command,
            NotFrontend
        ));
    }

    [Fact]
    public void 기존_파이썬_실행_명령은_그대로_믿는다()
    {
        Assert.True(CodingExecutionSafetyPolicy.ShouldTrustDeferredVerificationCommand(
            "python",
            "main.py 파일에서 ok 출력",
            "python3 main.py",
            NotFrontend
        ));
    }

    [Fact]
    public void 빈_명령은_믿지_않는다()
    {
        Assert.False(CodingExecutionSafetyPolicy.ShouldTrustDeferredVerificationCommand(
            "go",
            "Go 프로그램",
            "   ",
            NotFrontend
        ));
    }
}
