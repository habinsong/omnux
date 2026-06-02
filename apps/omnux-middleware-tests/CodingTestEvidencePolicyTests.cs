using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class CodingTestEvidencePolicyTests
{
    [Fact]
    public void ShouldRequireTestEvidenceRequiresProjectStyleWork()
    {
        Assert.True(CodingTestEvidencePolicy.ShouldRequireTestEvidence(
            "웹 대시보드 기능 추가",
            "typescript",
            new[] { "src/app.tsx", "index.html" },
            preferMultiFile: true
        ));

        Assert.False(CodingTestEvidencePolicy.ShouldRequireTestEvidence(
            "main.py 파일 하나에 ok 출력",
            "python",
            new[] { "main.py" },
            preferMultiFile: false
        ));
    }

    [Fact]
    public void HasTestEvidenceDetectsTestFilesAndTestCommands()
    {
        Assert.True(CodingTestEvidencePolicy.HasTestEvidence(
            new[] { "tests/test_app.cs" },
            "dotnet build"
        ));

        Assert.True(CodingTestEvidencePolicy.HasTestEvidence(
            Array.Empty<string>(),
            "npm test"
        ));

        Assert.False(CodingTestEvidencePolicy.HasTestEvidence(
            new[] { "src/app.cs" },
            "dotnet build"
        ));
    }
}
