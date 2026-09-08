using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class CodingPromptPolicyTests
{
    [Fact]
    public void BuildLoopPromptIncludesExecutionStateRulesAndProvidedPolicyLines()
    {
        var prompt = CodingPromptPolicy.BuildLoopPrompt(new CodingLoopPromptPolicyRequest(
            Objective: "CLI를 만들어줘",
            ResolvedLanguage: "python",
            ModeLabel: "단일 모델 코딩",
            WorkspaceRoot: "/tmp/work",
            Provider: "codex",
            Model: "gpt-5",
            OneShotMode: false,
            Iteration: 2,
            MaxIterations: 4,
            MaxActions: 3,
            WorkspaceSnapshot: "total_files=1",
            RecentLogs: "iter=1 write:app.py",
            LastExecution: new CodeExecutionResult(
                "python",
                "/tmp/work",
                "app.py",
                "python3 app.py",
                1,
                "stdout",
                "stderr",
                "error"
            ),
            QualityBrief: "- acceptance=ok",
            ProviderRuleLines: new[] { "- provider rule" },
            LanguageRuleLines: new[] { "- language rule" },
            VerificationRuleLines: new[] { "- verification rule" }
        ));

        Assert.Contains("반드시 JSON 객체만 출력하라", prompt);
        Assert.Contains("모델: codex:gpt-5", prompt);
        Assert.Contains("status=error", prompt);
        Assert.Contains("- provider rule", prompt);
        Assert.Contains("- language rule", prompt);
        Assert.Contains("- verification rule", prompt);
        Assert.Contains("type 허용값: mkdir, write_file, append_file, edit_file, read_file, delete_file, run", prompt);
        Assert.Contains("edit_file", prompt);
        // 에이전트가 루프 중 run 으로 직접 검증하도록 안내하는지 확인한다.
        Assert.Contains("run 으로 빌드/테스트/실행을 직접 수행", prompt);
    }

    [Fact]
    public void BuildLoopPromptInjectsRetrievalBlockWhenProvided()
    {
        var prompt = CodingPromptPolicy.BuildLoopPrompt(new CodingLoopPromptPolicyRequest(
            Objective: "CLI를 만들어줘",
            ResolvedLanguage: "python",
            ModeLabel: "단일 모델 코딩",
            WorkspaceRoot: "/tmp/work",
            Provider: "codex",
            Model: "gpt-5",
            OneShotMode: false,
            Iteration: 1,
            MaxIterations: 4,
            MaxActions: 3,
            WorkspaceSnapshot: "total_files=1",
            RecentLogs: "(none)",
            LastExecution: new CodeExecutionResult("python", "/tmp/work", "-", "(none)", 0, "", "", "skipped"),
            QualityBrief: "- acceptance=ok",
            ProviderRuleLines: new[] { "- provider rule" },
            LanguageRuleLines: new[] { "- language rule" },
            VerificationRuleLines: new[] { "- verification rule" },
            RetrievalBlock: "### memory:notes/cli (score 0.91)\n기존 CLI 컨벤션 메모"
        ));

        Assert.Contains("[참조 자료]", prompt);
        Assert.Contains("기존 CLI 컨벤션 메모", prompt);
        // 참조 자료는 목표 뒤·품질 브리프 앞에 위치한다(목표 우선 보장).
        Assert.True(prompt.IndexOf("[목표]", StringComparison.Ordinal) < prompt.IndexOf("[참조 자료]", StringComparison.Ordinal));
        Assert.True(prompt.IndexOf("[참조 자료]", StringComparison.Ordinal) < prompt.IndexOf("[품질 브리프]", StringComparison.Ordinal));
    }

    [Fact]
    public void BuildLoopPromptOmitsRetrievalSectionWhenBlockEmpty()
    {
        var prompt = CodingPromptPolicy.BuildLoopPrompt(new CodingLoopPromptPolicyRequest(
            Objective: "CLI를 만들어줘",
            ResolvedLanguage: "python",
            ModeLabel: "단일 모델 코딩",
            WorkspaceRoot: "/tmp/work",
            Provider: "codex",
            Model: "gpt-5",
            OneShotMode: false,
            Iteration: 1,
            MaxIterations: 4,
            MaxActions: 3,
            WorkspaceSnapshot: "total_files=1",
            RecentLogs: "(none)",
            LastExecution: new CodeExecutionResult("python", "/tmp/work", "-", "(none)", 0, "", "", "skipped"),
            QualityBrief: "- acceptance=ok",
            ProviderRuleLines: new[] { "- provider rule" },
            LanguageRuleLines: new[] { "- language rule" },
            VerificationRuleLines: new[] { "- verification rule" }
        ));

        Assert.DoesNotContain("[참조 자료]", prompt);
    }

    [Fact]
    public void BuildAgentObjectivePromptIncludesDummyBanAndLanguageRules()
    {
        var prompt = CodingPromptPolicy.BuildAgentObjectivePrompt(
            "테스트 CLI 작성",
            "단일 모델 코딩",
            "python",
            new[] { "- Python rule" }
        );

        Assert.Contains("목표: 사용자의 코딩 요청을 로컬 프로젝트에서 실제로 완성하세요.", prompt);
        Assert.Contains("테스트용 초기화 로그, 빈 함수, 껍데기 UI, placeholder 데이터만으로 완료 처리 금지", prompt);
        Assert.Contains("- Python rule", prompt);
        Assert.Contains("사용자 요청:", prompt);
        Assert.Contains("테스트 CLI 작성", prompt);
    }

    [Fact]
    public void BuildDraftWorkerPromptRequiresLanguageAndFileBlocks()
    {
        var prompt = CodingPromptPolicy.BuildDraftWorkerPrompt(
            "앱 초안 작성",
            "typescript",
            new[] { "- TypeScript rule" }
        );

        Assert.Contains("너는 병렬 코딩 워커 초안 생성기다.", prompt);
        Assert.Contains("LANGUAGE=<언어>", prompt);
        Assert.Contains("FILE: <핵심 파일 상대경로>", prompt);
        Assert.Contains("- TypeScript rule", prompt);
    }

    [Fact]
    public void BuildMultiAggregatePromptSummarizesWorkers()
    {
        var worker = new CodingWorkerResult(
            "gemini",
            "flash",
            "python",
            "print('ok')",
            string.Empty,
            new CodeExecutionResult("python", "/tmp/work", "app.py", "python3 app.py", 0, "ok", string.Empty, "ok"),
            new[] { "app.py" }
        );

        var prompt = CodingPromptPolicy.BuildMultiAggregatePrompt("CLI 작성", new[] { worker }, "python");

        Assert.Contains("다중 코딩 통합", prompt);
        Assert.Contains("[Worker gemini:flash]", prompt);
        Assert.Contains("changed_files=app.py", prompt);
        Assert.Contains("code:", prompt);
    }

    [Fact]
    public void BuildMultiSummaryPromptUsesPreparedDigests()
    {
        var prompt = CodingPromptPolicy.BuildMultiSummaryPrompt(
            "원본 요청",
            new[]
            {
                new CodingWorkerSummaryDigest("codex", "gpt-5", "상태 ok\n변경 app.py")
            }
        );

        Assert.Contains("[공통 요약]", prompt);
        Assert.Contains("[codex:gpt-5]", prompt);
        Assert.Contains("상태 ok", prompt);
    }
}
