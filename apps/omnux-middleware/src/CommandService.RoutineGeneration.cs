using System.Text;

namespace Omnux.Middleware;

public sealed partial class CommandService
{
    private async Task<RoutineGenerationResult> GenerateRoutineImplementationAsync(
        string request,
        RoutineSchedule schedule,
        CancellationToken cancellationToken,
        Action<RoutineProgressUpdate>? progressCallback = null
    )
    {
        var systemPromptPath = Path.Combine(_routinePromptDir, "system_prompt.md");
        var baseConfigPath = Path.Combine(_routinePromptDir, "기본 구성.md");
        var systemPrompt = File.Exists(systemPromptPath) ? File.ReadAllText(systemPromptPath, Encoding.UTF8) : string.Empty;
        var baseConfig = File.Exists(baseConfigPath) ? File.ReadAllText(baseConfigPath, Encoding.UTF8) : string.Empty;
        var objective = BuildRoutineGenerationPrompt(request, schedule.Display, systemPrompt, baseConfig);
        ReportRoutineCreateProgress(
            progressCallback,
            "실행 코드를 만들 생성 전략을 고르는 중입니다.",
            34,
            "planning",
            "생성 전략 준비",
            "모델 가용성과 예산을 기준으로 최적 경로를 선택합니다.",
            2
        );
        var strategy = await SelectRoutineCodingStrategyAsync(objective, cancellationToken);
        ReportRoutineCreateProgress(
            progressCallback,
            "실행 구성을 생성하는 중입니다.",
            52,
            "implementation",
            "실행 구성 생성",
            $"선택 전략: {strategy.Mode} / 모델: {string.Join(", ", strategy.Models)}",
            3
        );

        if (strategy.Mode == "split")
        {
            var chunks = new List<string>();
            var partLabels = new[] { "파트 1/3", "파트 2/3", "파트 3/3" };
            for (var i = 0; i < strategy.Models.Count; i++)
            {
                var model = strategy.Models[i];
                var prompt = objective + $"\n\n[{partLabels[Math.Min(i, partLabels.Length - 1)]}] 관점으로 설계/코드 초안을 작성하세요.";
                var generated = await GenerateByProviderSafeAsync("groq", model, prompt, cancellationToken, Math.Min(_context.CodingMaxOutputTokens, 2800));
                chunks.Add($"[{model}]\n{generated.Text}");
            }

            var merged = string.Join("\n\n", chunks);
            var parsed = GeneratedCodeCandidatePolicy.ParseCodeCandidate(merged, "bash");
            var language = parsed.Language is "bash" or "python" ? parsed.Language : "bash";
            var code = string.IsNullOrWhiteSpace(parsed.Code)
                ? string.Empty
                : EnsureRoutineShebang(parsed.Code, language);
            if (!string.IsNullOrWhiteSpace(parsed.Code) && RoutineCodeNeedsRepair(language, code))
            {
                ReportRoutineCreateProgress(
                    progressCallback,
                    "생성 결과를 보정하는 중입니다.",
                    68,
                    "implementation",
                    "실행 구성 생성",
                    "초안을 점검한 뒤 실행 가능하도록 보정합니다.",
                    3
                );
                var repaired = await TryRepairRoutineCodeAsync(objective, merged, strategy.Models[0], request, schedule, cancellationToken);
                language = repaired.Language;
                code = repaired.Code;
                merged = repaired.RawText;
            }

            var quality = ValidateRoutineGeneratedCode(language, code, request);
            return new RoutineGenerationResult(
                PlannerProvider: "groq",
                PlannerModel: "split",
                CoderModel: string.Join(",", strategy.Models),
                Plan: ExtractPlanText(merged),
                Language: language,
                Code: code,
                QualityStatus: quality.Ok ? "ok" : "quality_failed",
                QualityWarnings: quality.Warnings
            );
        }

        var single = await GenerateByProviderSafeAsync("groq", strategy.Models[0], objective, cancellationToken, Math.Min(_context.CodingMaxOutputTokens, 4200));
        var singleParsed = GeneratedCodeCandidatePolicy.ParseCodeCandidate(single.Text, "bash");
        var singleLanguage = singleParsed.Language is "bash" or "python" ? singleParsed.Language : "bash";
        var singleCode = string.IsNullOrWhiteSpace(singleParsed.Code)
            ? string.Empty
            : EnsureRoutineShebang(singleParsed.Code, singleLanguage);
        if (!string.IsNullOrWhiteSpace(singleParsed.Code) && RoutineCodeNeedsRepair(singleLanguage, singleCode))
        {
            ReportRoutineCreateProgress(
                progressCallback,
                "생성 결과를 보정하는 중입니다.",
                68,
                "implementation",
                "실행 구성 생성",
                "초안을 점검한 뒤 실행 가능하도록 보정합니다.",
                3
            );
            var repaired = await TryRepairRoutineCodeAsync(objective, single.Text, strategy.Models[0], request, schedule, cancellationToken);
            singleLanguage = repaired.Language;
            singleCode = repaired.Code;
            single = single with { Text = repaired.RawText };
        }
        var singleQuality = ValidateRoutineGeneratedCode(singleLanguage, singleCode, request);
        return new RoutineGenerationResult(
            PlannerProvider: "groq",
            PlannerModel: strategy.Models[0],
            CoderModel: strategy.Models[0],
            Plan: ExtractPlanText(single.Text),
            Language: singleLanguage,
            Code: singleCode,
            QualityStatus: singleQuality.Ok ? "ok" : "quality_failed",
            QualityWarnings: singleQuality.Warnings
        );
    }

}
