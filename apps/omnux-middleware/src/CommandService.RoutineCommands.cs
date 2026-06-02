using System.Text;

namespace Omnux.Middleware;

public sealed partial class CommandService
{
    private async Task<string?> TryHandleRoutineCommandAsync(string text, string source, CancellationToken cancellationToken)
    {
        if (!text.StartsWith("/routine", StringComparison.OrdinalIgnoreCase)
            && !text.StartsWith("/routines", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        var tokens = text.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (tokens.Length == 1 || tokens[1].Equals("help", StringComparison.OrdinalIgnoreCase))
        {
            return RoutineCommandPolicy.BuildHelpText();
        }

        var action = tokens[1].ToLowerInvariant();
        if (action == "list")
        {
            return BuildRoutineListCommandResponse();
        }

        if (action == "create")
        {
            if (tokens.Length < 3)
            {
                return "사용법: /routine create <요청>";
            }

            var created = await CreateRoutineFromCommandTokensAsync(tokens, source, cancellationToken);
            return RoutineCommandPolicy.FormatActionResult(created);
        }

        if (action == "update")
        {
            if (tokens.Length < 4)
            {
                return "사용법: /routine update <routine-id> <요청>";
            }

            var updated = await UpdateRoutineFromCommandTokensAsync(tokens, cancellationToken);
            return RoutineCommandPolicy.FormatActionResult(updated);
        }

        if (action == "run")
        {
            if (tokens.Length < 3)
            {
                return "사용법: /routine run <routine-id>";
            }

            var result = await RunRoutineNowAsync(tokens[2], source, cancellationToken);
            return RoutineCommandPolicy.FormatActionResult(result);
        }

        if (action == "runs")
        {
            if (tokens.Length < 3)
            {
                return "사용법: /routine runs <routine-id>";
            }

            return BuildRoutineRunsCommandResponse(tokens[2]);
        }

        if (action == "detail")
        {
            if (tokens.Length < 4 || !long.TryParse(tokens[3], out var detailTs))
            {
                return "사용법: /routine detail <routine-id> <ts>";
            }

            return BuildRoutineDetailCommandResponse(tokens[2], detailTs);
        }

        if (action == "resend")
        {
            if (tokens.Length < 4 || !long.TryParse(tokens[3], out var resendTs))
            {
                return "사용법: /routine resend <routine-id> <ts>";
            }

            var result = await ResendRoutineRunToTelegramAsync(tokens[2], resendTs, cancellationToken);
            return RoutineCommandPolicy.FormatActionResult(result);
        }

        if (action == "on" || action == "off")
        {
            if (tokens.Length < 3)
            {
                return $"사용법: /routine {action} <routine-id>";
            }

            var enabled = action == "on";
            var result = SetRoutineEnabled(tokens[2], enabled);
            return RoutineCommandPolicy.FormatActionResult(result);
        }

        if (action == "delete")
        {
            if (tokens.Length < 3)
            {
                return "사용법: /routine delete <routine-id>";
            }

            var result = DeleteRoutine(tokens[2]);
            return RoutineCommandPolicy.FormatActionResult(result);
        }

        return "알 수 없는 /routine 명령입니다. /routine help를 확인하세요.";
    }

    private async Task<string?> TryHandleNaturalRoutineRequestAsync(string text, string source, CancellationToken cancellationToken)
    {
        if (!RoutineCommandPolicy.LooksLikeRoutineRequest(text))
        {
            return null;
        }

        var result = await CreateRoutineAsync(text, source, cancellationToken);
        return RoutineCommandPolicy.FormatActionResult(result);
    }

    private string BuildRoutineListCommandResponse()
    {
        var list = ListRoutines();
        if (list.Count == 0)
        {
            return "등록된 루틴이 없습니다.";
        }

        var builder = new StringBuilder();
        builder.AppendLine("[루틴 목록]");
        foreach (var item in list.Take(20))
        {
            var modeLabel = RoutineCommandPolicy.FormatExecutionModeLabel(item.ResolvedExecutionMode);
            builder.AppendLine($"- {item.Id} | {item.Title} | mode={modeLabel} | {(item.Enabled ? "ON" : "OFF")} | next={item.NextRunLocal}");
        }

        return builder.ToString().Trim();
    }

    private async Task<RoutineActionResult> CreateRoutineFromCommandTokensAsync(
        IReadOnlyList<string> tokens,
        string source,
        CancellationToken cancellationToken
    )
    {
        if (tokens[2].Equals("browser", StringComparison.OrdinalIgnoreCase))
        {
            if (!RoutineCommandPolicy.TryParseBrowserCommand(tokens.Skip(3), out var browserSpec, out var browserError))
            {
                return new RoutineActionResult(false, browserError, null);
            }

            return await CreateRoutineAsync(
                request: browserSpec.Request,
                title: null,
                executionMode: "browser_agent",
                agentProvider: browserSpec.Provider,
                agentModel: browserSpec.Model,
                agentStartUrl: browserSpec.StartUrl,
                agentTimeoutSeconds: null,
                agentToolProfile: browserSpec.ToolProfile,
                agentUsePlaywright: true,
                scheduleSourceMode: "auto",
                maxRetries: null,
                retryDelaySeconds: null,
                notifyPolicy: null,
                notifyTelegram: null,
                scheduleKind: null,
                scheduleTime: null,
                weekdays: null,
                dayOfMonth: null,
                timezoneId: null,
                runImmediately: true,
                source: source,
                cancellationToken: cancellationToken
            );
        }

        var request = string.Join(' ', tokens.Skip(2)).Trim();
        return await CreateRoutineAsync(request, source, cancellationToken);
    }

    private async Task<RoutineActionResult> UpdateRoutineFromCommandTokensAsync(
        IReadOnlyList<string> tokens,
        CancellationToken cancellationToken
    )
    {
        var routineId = tokens[2];
        if (tokens[3].Equals("browser", StringComparison.OrdinalIgnoreCase))
        {
            if (!RoutineCommandPolicy.TryParseBrowserCommand(tokens.Skip(4), out var browserSpec, out var browserError))
            {
                return new RoutineActionResult(false, browserError, null);
            }

            return await UpdateRoutineAsync(
                routineId: routineId,
                request: browserSpec.Request,
                title: null,
                executionMode: "browser_agent",
                agentProvider: browserSpec.Provider,
                agentModel: browserSpec.Model,
                agentStartUrl: browserSpec.StartUrl,
                agentTimeoutSeconds: null,
                agentToolProfile: browserSpec.ToolProfile,
                agentUsePlaywright: true,
                scheduleSourceMode: "auto",
                maxRetries: null,
                retryDelaySeconds: null,
                notifyPolicy: null,
                notifyTelegram: null,
                scheduleKind: null,
                scheduleTime: null,
                weekdays: null,
                dayOfMonth: null,
                timezoneId: null,
                cancellationToken: cancellationToken
            );
        }

        var request = string.Join(' ', tokens.Skip(3)).Trim();
        return await UpdateRoutineAsync(
            routineId: routineId,
            request: request,
            title: null,
            executionMode: null,
            agentProvider: null,
            agentModel: null,
            agentStartUrl: null,
            agentTimeoutSeconds: null,
            agentToolProfile: null,
            agentUsePlaywright: null,
            scheduleSourceMode: "auto",
            maxRetries: null,
            retryDelaySeconds: null,
            notifyPolicy: null,
            notifyTelegram: null,
            scheduleKind: null,
            scheduleTime: null,
            weekdays: null,
            dayOfMonth: null,
            timezoneId: null,
            cancellationToken: cancellationToken
        );
    }

    private string BuildRoutineRunsCommandResponse(string routineId)
    {
        var summary = ListRoutines().FirstOrDefault(item => item.Id.Equals(routineId, StringComparison.OrdinalIgnoreCase));
        if (summary == null)
        {
            return "루틴을 찾을 수 없습니다.";
        }

        var runs = (summary.Runs ?? Array.Empty<RoutineRunSummary>()).Take(12).ToArray();
        if (runs.Length == 0)
        {
            return $"루틴 `{summary.Id}` 의 실행 이력이 아직 없습니다.";
        }

        var builder = new StringBuilder();
        builder.AppendLine($"[루틴 실행 이력] {summary.Id}");
        foreach (var run in runs)
        {
            var telegramText = string.IsNullOrWhiteSpace(run.TelegramStatus) ? "-" : run.TelegramStatus;
            var compactSummary = TrimForOutput(run.Summary ?? string.Empty, 120);
            builder.AppendLine($"- ts={run.Ts} | {run.RunAtLocal} | {run.Status} | {run.Source} | telegram={telegramText}");
            if (!string.IsNullOrWhiteSpace(compactSummary))
            {
                builder.AppendLine($"  {compactSummary}");
            }
        }

        builder.AppendLine();
        builder.AppendLine("상세: /routine detail <routine-id> <ts>");
        builder.AppendLine("재전송: /routine resend <routine-id> <ts>");
        return builder.ToString().Trim();
    }

    private string BuildRoutineDetailCommandResponse(string routineId, long ts)
    {
        var detail = GetRoutineRunDetail(routineId, ts);
        if (!detail.Ok)
        {
            return $"루틴 상세 오류: {detail.Error ?? "실행 이력을 찾지 못했습니다."}";
        }

        var content = TrimForOutput(detail.Content ?? string.Empty, 2600);
        return $"""
                [루틴 실행 상세]
                id={detail.RoutineId}
                title={detail.Title}
                ts={detail.Ts}
                status={detail.Status}
                source={detail.Source}
                telegram={detail.TelegramStatus ?? "-"}
                artifact={detail.ArtifactPath ?? "-"}

                {content}
                """;
    }
}
