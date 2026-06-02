namespace Omnux.Middleware;

public sealed partial class RoutineApplicationService
{
    private async Task<RoutineGenerationResult> GenerateSplitRoutineResultAsync(
        string objective,
        RoutineModelStrategy strategy,
        string request,
        RoutineSchedule schedule,
        CancellationToken cancellationToken,
        Action<RoutineProgressUpdate>? progressCallback
    )
    {
        var chunks = new List<string>();
        var partLabels = new[] { "파트 1/3", "파트 2/3", "파트 3/3" };
        for (var i = 0; i < strategy.Models.Count; i++)
        {
            var model = strategy.Models[i];
            var prompt = objective + $"\n\n[{partLabels[Math.Min(i, partLabels.Length - 1)]}] 관점으로 설계/코드 초안을 작성하세요.";
            var generated = await _llmGateway.GenerateByProviderSafeAsync(
                "groq",
                model,
                prompt,
                cancellationToken,
                Math.Min(_context.CodingMaxOutputTokens, 2800)
            );
            chunks.Add($"[{model}]\n{generated.Text}");
        }

        var merged = string.Join("\n\n", chunks);
        var parsed = ParseRoutineGenerationCandidate(merged);
        if (!string.IsNullOrWhiteSpace(parsed.OriginalCode) && RoutineCodeNeedsRepair(parsed.Language, parsed.Code))
        {
            ReportRoutineRepairProgress(progressCallback);
            var repaired = await TryRepairRoutineCodeAsync(
                objective,
                merged,
                strategy.Models[0],
                request,
                schedule,
                cancellationToken
            );
            parsed = new RoutineGenerationCandidate(repaired.Language, repaired.Code, repaired.RawText, repaired.Code);
        }

        return BuildRoutineGenerationResult(
            plannerModel: "split",
            coderModel: string.Join(",", strategy.Models),
            rawText: parsed.RawText,
            language: parsed.Language,
            code: parsed.Code,
            request: request
        );
    }

    private async Task<RoutineGenerationResult> GenerateSingleRoutineResultAsync(
        string objective,
        RoutineModelStrategy strategy,
        string request,
        RoutineSchedule schedule,
        CancellationToken cancellationToken,
        Action<RoutineProgressUpdate>? progressCallback
    )
    {
        var model = strategy.Models[0];
        var generated = await _llmGateway.GenerateByProviderSafeAsync(
            "groq",
            model,
            objective,
            cancellationToken,
            Math.Min(_context.CodingMaxOutputTokens, 4200)
        );
        var parsed = ParseRoutineGenerationCandidate(generated.Text);
        if (!string.IsNullOrWhiteSpace(parsed.OriginalCode) && RoutineCodeNeedsRepair(parsed.Language, parsed.Code))
        {
            ReportRoutineRepairProgress(progressCallback);
            var repaired = await TryRepairRoutineCodeAsync(
                objective,
                generated.Text,
                model,
                request,
                schedule,
                cancellationToken
            );
            parsed = new RoutineGenerationCandidate(repaired.Language, repaired.Code, repaired.RawText, repaired.Code);
        }

        return BuildRoutineGenerationResult(
            plannerModel: model,
            coderModel: model,
            rawText: parsed.RawText,
            language: parsed.Language,
            code: parsed.Code,
            request: request
        );
    }

    private static RoutineGenerationCandidate ParseRoutineGenerationCandidate(string rawText)
    {
        var parsed = GeneratedCodeCandidatePolicy.ParseCodeCandidate(rawText, "bash");
        var language = parsed.Language is "bash" or "python" ? parsed.Language : "bash";
        var code = string.IsNullOrWhiteSpace(parsed.Code)
            ? string.Empty
            : EnsureRoutineShebang(parsed.Code, language);
        return new RoutineGenerationCandidate(language, code, rawText, parsed.Code);
    }

    private static RoutineGenerationResult BuildRoutineGenerationResult(
        string plannerModel,
        string coderModel,
        string rawText,
        string language,
        string code,
        string request
    )
    {
        var quality = ValidateRoutineGeneratedCode(language, code, request);
        return new RoutineGenerationResult(
            PlannerProvider: "groq",
            PlannerModel: plannerModel,
            CoderModel: coderModel,
            Plan: ExtractPlanText(rawText),
            Language: language,
            Code: code,
            QualityStatus: quality.Ok ? "ok" : "quality_failed",
            QualityWarnings: quality.Warnings
        );
    }

    private static void ReportRoutineRepairProgress(Action<RoutineProgressUpdate>? progressCallback)
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
    }

    private sealed record RoutineGenerationCandidate(
        string Language,
        string Code,
        string RawText,
        string OriginalCode
    );
}
