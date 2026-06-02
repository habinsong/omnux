using System.Globalization;
using System.Text;

namespace Omnux.Middleware;

public sealed partial class RoutineApplicationService
{
    private static string BuildRoutineExecutionText(RoutineDefinition routine, CodeExecutionResult exec)
    {
        var stdout = (exec.StdOut ?? string.Empty).Trim();
        var stderr = (exec.StdErr ?? string.Empty).Trim();
        var summary = new StringBuilder();
        summary.AppendLine($"[Routine:{routine.Id}] {routine.Title}");
        summary.AppendLine($"status={exec.Status} exit={exec.ExitCode}");
        summary.AppendLine($"model={routine.CoderModel}");
        summary.AppendLine($"script={routine.ScriptPath}");
        summary.AppendLine($"run_dir={exec.RunDirectory}");
        if (!string.IsNullOrWhiteSpace(stdout))
        {
            summary.AppendLine();
            summary.AppendLine("[stdout]");
            summary.AppendLine(stdout.Length <= 1600 ? stdout : stdout[..1600] + "...");
        }

        if (!string.IsNullOrWhiteSpace(stderr))
        {
            summary.AppendLine();
            summary.AppendLine("[stderr]");
            summary.AppendLine(stderr.Length <= 1200 ? stderr : stderr[..1200] + "...");
        }
        else if (string.IsNullOrWhiteSpace(stdout))
        {
            summary.AppendLine();
            summary.AppendLine("[stdout]");
            summary.AppendLine("(출력 없음)");
        }

        return summary.ToString().Trim();
    }

    private static string ResolveCronRunEntryStatus(CodeExecutionResult exec)
    {
        var normalized = NormalizeCronRunStatus(exec.Status);
        if (!string.IsNullOrWhiteSpace(normalized))
        {
            return normalized;
        }

        return exec.ExitCode == 0 ? "ok" : "error";
    }

    private static string? BuildCronRunEntryError(CodeExecutionResult exec, string output, string status)
    {
        if (!string.Equals(status, "error", StringComparison.Ordinal))
        {
            return null;
        }

        var stderr = (exec.StdErr ?? string.Empty).Trim();
        if (!string.IsNullOrWhiteSpace(stderr))
        {
            return TrimForCronError(stderr);
        }

        return TrimForCronError(output);
    }

    internal static string? BuildCronRunEntrySummary(string output)
    {
        var normalized = (output ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return null;
        }

        const int maxChars = 800;
        if (normalized.Length <= maxChars)
        {
            return normalized;
        }

        return normalized[..maxChars] + "...";
    }

    private static bool ShouldRunCronAgentTurnBridge(RoutineDefinition routine)
    {
        if (!string.Equals(
                NormalizeCronSessionTargetOrDefault(routine.CronSessionTarget),
                "isolated",
                StringComparison.Ordinal
            ))
        {
            return false;
        }

        return string.Equals(
            NormalizeCronPayloadKindOrDefault(routine.CronPayloadKind),
            "agentTurn",
            StringComparison.Ordinal
        );
    }

    private CodeExecutionResult ExecuteCronAgentTurnBridge(
        RoutineDefinition routine,
        CancellationToken cancellationToken
    )
    {
        var command = "sessions_spawn runtime=acp mode=run";
        if (cancellationToken.IsCancellationRequested)
        {
            var canceledStdOut = $"""
                                  [cron.agentTurn.bridge]
                                  routineId={routine.Id}
                                  status=error
                                  reason=canceled
                                  """;
            return new CodeExecutionResult(
                "cron-agentturn",
                ResolveWorkspaceRoot(),
                "-",
                command,
                1,
                canceledStdOut,
                "cancellation requested",
                "error"
            );
        }

        var payloadText = ResolveRoutineExecutionRequestText(routine.Request, routine.Title, routine.ScheduleSourceMode);
        var payloadModel = NormalizeOptionalCronPayloadString(routine.CronPayloadModel);
        var payloadThinking = NormalizeOptionalCronPayloadString(routine.CronPayloadThinking);
        var payloadTimeoutSeconds = routine.CronPayloadTimeoutSeconds;
        var payloadLightContext = routine.CronPayloadLightContext;

        var spawnTask = BuildCronAgentTurnSpawnTask(
            payloadText,
            payloadModel,
            payloadThinking,
            payloadTimeoutSeconds,
            payloadLightContext
        );
        var spawnResult = _sessionSpawnTool.Spawn(
            task: spawnTask,
            label: $"cron-{routine.Title}",
            runtime: "acp",
            runTimeoutSeconds: payloadTimeoutSeconds,
            timeoutSeconds: payloadTimeoutSeconds,
            thread: false,
            mode: "run",
            acpModel: payloadModel,
            acpThinking: payloadThinking,
            acpLightContext: payloadLightContext
        );

        if (string.Equals(spawnResult.Status, "accepted", StringComparison.OrdinalIgnoreCase)
            && !string.IsNullOrWhiteSpace(spawnResult.ChildSessionKey))
        {
            var optionNote = BuildCronAgentTurnOptionsBlock(
                payloadModel,
                payloadThinking,
                payloadTimeoutSeconds,
                payloadLightContext
            );
            if (!string.IsNullOrWhiteSpace(optionNote))
            {
                _ = _conversationStore.AppendMessage(
                    spawnResult.ChildSessionKey,
                    "system",
                    optionNote,
                    "cron_agentturn_options"
                );
            }
        }

        var accepted = string.Equals(spawnResult.Status, "accepted", StringComparison.OrdinalIgnoreCase);
        var resolvedCommand = $"{command} timeoutSeconds={(spawnResult.RunTimeoutSeconds).ToString(CultureInfo.InvariantCulture)}";
        var stdout = BuildCronAgentTurnBridgeStdOut(
            routine,
            spawnResult,
            payloadModel,
            payloadThinking,
            payloadTimeoutSeconds,
            payloadLightContext
        );
        var stderr = accepted
            ? string.Empty
            : string.IsNullOrWhiteSpace(spawnResult.Error)
                ? "sessions_spawn returned error"
                : spawnResult.Error!;

        return new CodeExecutionResult(
            "cron-agentturn",
            ResolveWorkspaceRoot(),
            "-",
            resolvedCommand,
            accepted ? 0 : 1,
            stdout,
            stderr,
            accepted ? "ok" : "error"
        );
    }

    private static string BuildCronAgentTurnSpawnTask(
        string message,
        string? model,
        string? thinking,
        int? timeoutSeconds,
        bool? lightContext
    )
    {
        var optionBlock = BuildCronAgentTurnOptionsBlock(model, thinking, timeoutSeconds, lightContext);
        if (string.IsNullOrWhiteSpace(optionBlock))
        {
            return message;
        }

        return $"{optionBlock}\n\n{message}";
    }

    private static string BuildCronAgentTurnBridgeStdOut(
        RoutineDefinition routine,
        SessionSpawnToolResult spawnResult,
        string? model,
        string? thinking,
        int? timeoutSeconds,
        bool? lightContext
    )
    {
        var builder = new StringBuilder();
        builder.AppendLine("[cron.agentTurn.bridge]");
        builder.AppendLine($"routineId={routine.Id}");
        builder.AppendLine($"spawnStatus={spawnResult.Status}");
        builder.AppendLine($"runtime={spawnResult.Runtime}");
        builder.AppendLine($"mode={spawnResult.Mode}");
        builder.AppendLine($"runId={spawnResult.RunId}");
        if (!string.IsNullOrWhiteSpace(spawnResult.ChildSessionKey))
        {
            builder.AppendLine($"childSessionKey={spawnResult.ChildSessionKey}");
        }
        if (!string.IsNullOrWhiteSpace(spawnResult.BackendSessionId))
        {
            builder.AppendLine($"backendSessionId={spawnResult.BackendSessionId}");
        }
        if (!string.IsNullOrWhiteSpace(spawnResult.ThreadBindingKey))
        {
            builder.AppendLine($"threadBindingKey={spawnResult.ThreadBindingKey}");
        }

        var optionBlock = BuildCronAgentTurnOptionsBlock(model, thinking, timeoutSeconds, lightContext);
        if (!string.IsNullOrWhiteSpace(optionBlock))
        {
            builder.AppendLine();
            builder.AppendLine(optionBlock);
        }

        return builder.ToString().Trim();
    }

    private static string? BuildCronAgentTurnOptionsBlock(
        string? model,
        string? thinking,
        int? timeoutSeconds,
        bool? lightContext
    )
    {
        var lines = new List<string>();
        if (!string.IsNullOrWhiteSpace(model))
        {
            lines.Add($"- model: {model}");
        }

        if (!string.IsNullOrWhiteSpace(thinking))
        {
            lines.Add($"- thinking: {thinking}");
        }

        if (timeoutSeconds.HasValue)
        {
            lines.Add($"- timeoutSeconds: {timeoutSeconds.Value.ToString(CultureInfo.InvariantCulture)}");
        }

        if (lightContext.HasValue)
        {
            lines.Add($"- lightContext: {(lightContext.Value ? "true" : "false")}");
        }

        if (lines.Count == 0)
        {
            return null;
        }

        return "[cron.agentTurn.options]\n" + string.Join("\n", lines);
    }

    internal static void AppendRoutineRunLogEntry(RoutineDefinition routine, RoutineRunLogEntry entry)
    {
        routine.CronRunLog ??= new List<RoutineRunLogEntry>();
        routine.CronRunLog.Add(entry);
        const int maxEntries = 200;
        if (routine.CronRunLog.Count <= maxEntries)
        {
            return;
        }

        var removeCount = routine.CronRunLog.Count - maxEntries;
        routine.CronRunLog.RemoveRange(0, removeCount);
    }
}
