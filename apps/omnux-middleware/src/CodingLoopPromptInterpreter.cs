namespace Omnux.Middleware;

/// <summary>
/// 사용자 프롬프트를 코딩 루프 프롬프트로 만들고, 제공자 응답을 계획으로 파싱한다.
/// 실제 LLM 호출은 호출자가 넘긴 generate 에 맡긴다. 검사는 픽스처 generate 만 쓴다.
/// </summary>
internal static class CodingLoopPromptInterpreter
{
    public static CodingLoopPlan Interpret(string userPrompt, string languageHint, Func<string, string> generatePlanText)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(userPrompt);
        ArgumentNullException.ThrowIfNull(generatePlanText);

        var language = CodingLanguagePolicy.ResolveInitialCodingLanguage(languageHint, userPrompt);
        var quality = CodingQualityBriefPolicy.Build(userPrompt, languageHint, static (_, _) => false, static (_, _) => false);
        var lastExecution = new CodeExecutionResult(language, ".", "-", "(none)", 0, string.Empty, string.Empty, "skipped");
        var loopPrompt = CodingPromptPolicy.BuildLoopPrompt(
            new CodingLoopPromptPolicyRequest(
                userPrompt,
                language,
                "single",
                ".",
                "fixture",
                "fixture-model",
                true,
                1,
                1,
                4,
                "(empty)",
                string.Empty,
                lastExecution,
                quality,
                Array.Empty<string>(),
                Array.Empty<string>(),
                Array.Empty<string>()
            )
        );
        var generated = generatePlanText(loopPrompt);
        return CodingLoopPlanParser.Parse(generated)
            ?? throw new InvalidOperationException("계획 JSON을 해석하지 못했습니다.");
    }
}
