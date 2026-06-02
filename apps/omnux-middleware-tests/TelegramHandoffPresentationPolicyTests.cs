using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class TelegramHandoffPresentationPolicyTests
{
    [Fact]
    public void BuildTelegramHandoffResultShowsDesktopPanelAndHandoffPath()
    {
        var snapshot = new ProjectNotebookSnapshot(
            new ProjectNotebook(
                "project-1",
                "/workspace/project",
                "/state/notebooks/project-1/learnings.md",
                "/state/notebooks/project-1/decisions.md",
                "/state/notebooks/project-1/verification.md",
                "/state/notebooks/project-1/handoff.md"
            ),
            Document("/state/notebooks/project-1/learnings.md", false, string.Empty),
            Document("/state/notebooks/project-1/decisions.md", true, "결정"),
            Document("/state/notebooks/project-1/verification.md", true, "검증"),
            Document("/state/notebooks/project-1/handoff.md", true, "# Handoff\n다음 작업"),
            "2026-06-02T00:00:00Z"
        );

        var text = TelegramHandoffPresentationPolicy.BuildTelegramHandoffResult(
            new NotebookActionResult(true, "최신 handoff를 생성했습니다.", snapshot)
        );

        Assert.Contains("[데스크톱 handoff 생성]", text);
        Assert.Contains("Notebooks 화면의 Handoff 패널", text);
        Assert.Contains("handoffPath=/state/notebooks/project-1/handoff.md", text);
        Assert.Contains("텔레그램에서는 요약과 트리거만 확인", text);
    }

    private static NotebookDocumentSnapshot Document(string path, bool exists, string preview)
    {
        return new NotebookDocumentSnapshot(
            path,
            exists,
            preview.Length,
            "2026-06-02T00:00:00Z",
            preview,
            preview,
            false
        );
    }
}
