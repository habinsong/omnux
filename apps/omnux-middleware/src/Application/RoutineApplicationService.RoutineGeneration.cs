using System.Text;

namespace Omnux.Middleware;

public sealed partial class RoutineApplicationService
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

        return strategy.Mode == "split"
            ? await GenerateSplitRoutineResultAsync(objective, strategy, request, schedule, cancellationToken, progressCallback)
            : await GenerateSingleRoutineResultAsync(objective, strategy, request, schedule, cancellationToken, progressCallback);
    }

}
