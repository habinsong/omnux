using System.Net;
using System.Linq;

namespace Omnux.Middleware;

public sealed partial class CodingApplicationService
{
    private const string CodingPreviewApiPrefix = "/api/coding-preview";

    /// <summary>
    /// 이 요청이 "이미 만든 결과를 그대로 실행해 달라"는 뜻인지 모델에게 한 번 묻는다.
    /// 어휘 목록으로 맞히려 들면 표현이 조금만 달라도 놓친다("그거 켜봐", "동작하는지 보여줘"…).
    /// 호출이 실패하거나 응답을 못 읽으면 어휘 폴백으로 판단한다.
    /// </summary>
    private async Task<bool> ShouldRunExistingCodingResultAsync(
        string provider,
        string model,
        string rawInput,
        CancellationToken cancellationToken
    )
    {
        if (!CodingRunRequestIntentPolicy.CouldBeFollowUpRunRequest(rawInput))
        {
            return false;
        }

        try
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeout.CancelAfter(TimeSpan.FromSeconds(30));
            var generated = await GenerateByProviderSafeAsync(
                provider,
                model,
                CodingRunRequestIntentPolicy.BuildClassificationPrompt(rawInput),
                timeout.Token,
                maxOutputTokens: 2048,
                timeoutOverrideSeconds: 25,
                tuning: LlmTuning.From("low", "standard")
            ).ConfigureAwait(false);
            if (CodingProviderFailurePolicy.Classify(generated.Text) == CodingProviderFailureKind.None
                && CodingRunRequestIntentPolicy.TryParse(generated.Text, out var runExisting))
            {
                Console.Error.WriteLine(
                    $"[coding-run-intent] runExisting={runExisting} source=llm provider={provider} request=\"{TrimForOutput(rawInput, 60).Replace("\n", " ", StringComparison.Ordinal)}\""
                );
                return runExisting;
            }
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            // 판정 실패는 치명적이지 않다. 아래 폴백으로 계속한다.
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[coding-run-intent] classification skipped: {ex.Message}");
        }

        var fallback = CodingRunRequestIntentPolicy.FallbackLooksLikeRunOnlyRequest(rawInput);
        Console.Error.WriteLine(
            $"[coding-run-intent] runExisting={fallback} source=fallback request=\"{TrimForOutput(rawInput, 60).Replace("\n", " ", StringComparison.Ordinal)}\""
        );
        return fallback;
    }

    /// <summary>
    /// "실행해봐" 요청을 직전 코딩 결과 실행으로 처리한다. 실행할 대상이 없으면 null 을 돌려
    /// 일반 빌드 경로로 넘긴다(실행할 게 없는데 실행만 하고 끝나면 사용자는 아무 결과도 못 본다).
    /// </summary>
    private async Task<CodingRunResult?> TryRerunLatestCodingResultAsync(
        SessionContext session,
        string rawInput,
        CancellationToken cancellationToken
    )
    {
        CodingResultExecutionResult executed;
        try
        {
            executed = await ExecuteLatestCodingResultAsync(session.Thread.Id, null, cancellationToken)
                .ConfigureAwait(false);
        }
        catch (InvalidOperationException ex)
        {
            // 왜 실행으로 못 갔는지 남긴다. 이유를 모르면 조용히 빌드 루프로 새 파일이 생겨 버린다.
            Console.Error.WriteLine($"[coding-run-intent] rerun unavailable: {ex.Message}");
            return null;
        }

        var view = _conversationStore.Get(session.Thread.Id) ?? session.Thread;
        var latest = view.LatestCodingResult;
        var execution = executed.Execution ?? latest?.Execution;
        if (execution == null)
        {
            return null;
        }

        var summary = string.IsNullOrWhiteSpace(executed.Message)
            ? "직전 결과를 실행했습니다."
            : executed.Message;
        _conversationStore.AppendMessage(session.Thread.Id, "user", rawInput, "coding-single");
        _conversationStore.AppendMessage(session.Thread.Id, "assistant", summary, "coding-single:rerun");
        view = _conversationStore.Get(session.Thread.Id) ?? view;
        return new CodingRunResult(
            "single",
            view.Id,
            executed.TargetProvider,
            executed.TargetModel,
            executed.Language,
            string.Empty,
            execution,
            Array.Empty<CodingWorkerResult>(),
            latest?.ChangedFiles ?? Array.Empty<string>(),
            summary,
            view,
            null,
            Evidence: executed.Evidence
        );
    }

    public async Task<CodingResultExecutionResult> ExecuteLatestCodingResultAsync(
        string conversationId,
        string? standardInput,
        CancellationToken cancellationToken,
        string? preferredTarget = null
    )
    {
        var normalizedConversationId = (conversationId ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalizedConversationId))
        {
            throw new InvalidOperationException("conversationId가 필요합니다.");
        }

        var conversation = _conversationStore.Get(normalizedConversationId)
            ?? throw new InvalidOperationException("대화를 찾을 수 없습니다.");
        var latest = conversation.LatestCodingResult
            ?? throw new InvalidOperationException("최근 코딩 결과가 없습니다.");
        var target = ResolveLatestCodingExecutionTarget(latest, preferredTarget)
            ?? throw new InvalidOperationException("다시 실행할 대상 파일이나 명령을 찾지 못했습니다.");
        var project = conversation.CodingProject;
        var directProject = project != null && IsPathUnderRoot(target.RunDirectory, project.Path)
            ? _projectBindings.Resolve(null, project) : null;
        using var projectLease = _projectBindings.Acquire(directProject, normalizedConversationId);
        var normalizedLanguage = CodingLanguagePolicy.NormalizeLanguageForCode(target.Language);

        if (string.Equals(normalizedLanguage, "html", StringComparison.OrdinalIgnoreCase))
        {
            var previewEntry = ResolveHtmlPreviewEntryPath(target.Execution, target.ChangedFiles, target.RunDirectory);
            if (string.IsNullOrWhiteSpace(previewEntry))
            {
                throw new InvalidOperationException("브라우저로 실행할 HTML 진입 파일을 찾지 못했습니다.");
            }

            var previewUrl = BuildCodingPreviewUrl(normalizedConversationId, target.TargetSegment, previewEntry);
            var previewLabel = target.WorkerIndex >= 0
                ? $"브라우저 프리뷰 준비 완료 · {target.Provider}/{target.Model}"
                : "브라우저 프리뷰 준비 완료";
            return new CodingResultExecutionResult(
                normalizedConversationId,
                normalizedLanguage,
                "browser",
                true,
                previewLabel,
                target.Provider,
                target.Model,
                null,
                previewUrl,
                previewEntry,
                BuildCodingEvidencePack(
                    "browser",
                    target.Execution,
                    target.ChangedFiles,
                    previewUrl,
                    previewEntry
                )
            );
        }

        var commandPlan = ResolveLatestCodingExecutionCommandPlan(target);
        if (string.IsNullOrWhiteSpace(commandPlan.ActualCommand))
        {
            throw new InvalidOperationException("다시 실행할 명령을 구성하지 못했습니다.");
        }

        if (!IsDynamicCodeExecutionEnabled())
        {
            var blockedExecution = new CodeExecutionResult(
                normalizedLanguage,
                target.RunDirectory,
                target.EntryFile,
                commandPlan.DisplayCommand,
                126,
                string.Empty,
                BuildDynamicCodeDisabledMessage(),
                "blocked"
            );
            return new CodingResultExecutionResult(
                normalizedConversationId,
                normalizedLanguage,
                "command",
                false,
                BuildDynamicCodeDisabledMessage(),
                target.Provider,
                target.Model,
                blockedExecution,
                Evidence: BuildCodingEvidencePack("command", blockedExecution, target.ChangedFiles)
            );
        }

        var normalizedStandardInput = NormalizeLatestCodingExecutionInput(standardInput);
        var shell = await RunWorkspaceCommandWithAutoInstallAsync(
            commandPlan.ActualCommand,
            target.RunDirectory,
            cancellationToken,
            normalizedStandardInput
        );
        var status = shell.TimedOut
            ? "timeout"
            : shell.ExitCode == 0
                ? "ok"
                : "error";
        var rerunMessage = BuildLatestCodingExecutionMessage(
            target.WorkerIndex >= 0,
            target.Provider,
            target.Model,
            shell.StdErr,
            normalizedStandardInput
        );
        var execution = new CodeExecutionResult(
            normalizedLanguage,
            target.RunDirectory,
            target.EntryFile,
            commandPlan.DisplayCommand,
            shell.ExitCode,
            TrimForOutput(shell.StdOut ?? string.Empty, 24000),
            TrimForOutput(shell.StdErr ?? string.Empty, 24000),
            status
        );

        var evidence = BuildCodingEvidencePack("command", execution, target.ChangedFiles);
        var updated = target.WorkerIndex < 0
            ? latest with { Execution = execution, Evidence = evidence }
            : latest with { Workers = latest.Workers.Select((worker, index) => index == target.WorkerIndex ? worker with { Execution = execution } : worker).ToArray() };
        if (!_conversationStore.TryReplaceLatestCodingResult(normalizedConversationId, latest, updated))
        {
            rerunMessage += " 새 작업으로 기록이 바뀌어 이번 실행 결과는 현재 화면에만 표시합니다.";
        }

        return new CodingResultExecutionResult(
            normalizedConversationId,
            normalizedLanguage,
            "command",
            shell.ExitCode == 0 && !shell.TimedOut,
            rerunMessage,
            target.Provider,
            target.Model,
            execution,
            Evidence: evidence
        );
    }

    private sealed record LatestCodingExecutionTarget(
        int WorkerIndex,
        string Provider,
        string Model,
        string Language,
        string RunDirectory,
        string EntryFile,
        string TargetSegment,
        CodeExecutionResult Execution,
        IReadOnlyList<string> ChangedFiles
    );

    private sealed record LatestCodingExecutionCommandPlan(
        string ActualCommand,
        string DisplayCommand
    );

    private LatestCodingExecutionTarget? ResolveLatestCodingExecutionTarget(ConversationCodingResultSnapshot latest, string? preferredTarget)
    {
        var candidates = new List<LatestCodingExecutionTarget>();
        candidates.Add(new LatestCodingExecutionTarget(
            -1,
            latest.Provider,
            latest.Model,
            latest.Language,
            NormalizeStoredRunDirectory(latest.Execution.RunDirectory),
            NormalizeStoredEntryFile(latest.Execution.EntryFile),
            "main",
            latest.Execution,
            latest.ChangedFiles ?? Array.Empty<string>()
        ));

        for (var index = 0; index < latest.Workers.Count; index++)
        {
            var worker = latest.Workers[index];
            candidates.Add(new LatestCodingExecutionTarget(
                index,
                worker.Provider,
                worker.Model,
                worker.Language,
                NormalizeStoredRunDirectory(worker.Execution.RunDirectory),
                NormalizeStoredEntryFile(worker.Execution.EntryFile),
                $"worker-{index}",
                worker.Execution,
                worker.ChangedFiles ?? Array.Empty<string>()
            ));
        }

        if (!string.IsNullOrWhiteSpace(preferredTarget))
        {
            candidates = candidates.Where(candidate => string.Equals(candidate.TargetSegment, preferredTarget, StringComparison.Ordinal)).ToList();
            if (candidates.Count == 0) throw new InvalidOperationException("선택한 코딩 결과를 찾을 수 없습니다.");
        }

        var ordered = candidates
            .Where(candidate => !string.IsNullOrWhiteSpace(candidate.RunDirectory))
            .OrderByDescending(candidate => IsSuccessfulCodingExecutionStatus(candidate.Execution.Status))
            .ThenBy(candidate => candidate.WorkerIndex < 0 ? 0 : 1)
            .ToArray();

        foreach (var candidate in ordered)
        {
            if (string.Equals(CodingLanguagePolicy.NormalizeLanguageForCode(candidate.Language), "html", StringComparison.OrdinalIgnoreCase))
            {
                var previewEntry = ResolveHtmlPreviewEntryPath(candidate.Execution, candidate.ChangedFiles, candidate.RunDirectory);
                if (!string.IsNullOrWhiteSpace(previewEntry))
                {
                    return candidate;
                }

                continue;
            }

            if (!string.IsNullOrWhiteSpace(ResolveLatestCodingExecutionCommandPlan(candidate).ActualCommand))
            {
                return candidate;
            }
        }

        return ordered.FirstOrDefault();
    }

    private LatestCodingExecutionCommandPlan ResolveLatestCodingExecutionCommandPlan(LatestCodingExecutionTarget target)
    {
        if (target.WorkerIndex >= 0 && string.Equals(target.Execution.Status, "skipped", StringComparison.OrdinalIgnoreCase)
            && target.ChangedFiles.Count == 0)
        {
            return new LatestCodingExecutionCommandPlan(string.Empty, string.Empty);
        }
        var preferredLaunchCommand = TryBuildPreferredLatestCodingLaunchCommand(target);
        if (!string.IsNullOrWhiteSpace(preferredLaunchCommand.ActualCommand))
        {
            return preferredLaunchCommand;
        }

        var normalizedCommand = CodingFallbackPolicy.NormalizeGeneratedRunCommand(target.Execution.Command);
        if (IsRunnableCodingExecutionCommand(normalizedCommand))
        {
            return new LatestCodingExecutionCommandPlan(normalizedCommand, normalizedCommand);
        }

        var fallbackCommand = BuildLatestCodingExecutionFallbackCommand(
            target.Language,
            target.RunDirectory,
            target.EntryFile,
            target.ChangedFiles
        );
        return new LatestCodingExecutionCommandPlan(fallbackCommand, fallbackCommand);
    }

    private LatestCodingExecutionCommandPlan TryBuildPreferredLatestCodingLaunchCommand(LatestCodingExecutionTarget target)
    {
        var normalizedLanguage = CodingLanguagePolicy.NormalizeLanguageForCode(target.Language);
        var availableFiles = (target.ChangedFiles ?? Array.Empty<string>())
            .Where(path => !string.IsNullOrWhiteSpace(path) && File.Exists(path))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
        var entryPath = ResolvePreferredExecutionEntryPath(normalizedLanguage, target.RunDirectory, target.EntryFile, availableFiles);
        if (string.IsNullOrWhiteSpace(entryPath))
        {
            return new LatestCodingExecutionCommandPlan(string.Empty, string.Empty);
        }

        if (string.Equals(normalizedLanguage, "python", StringComparison.OrdinalIgnoreCase))
        {
            var sourceFiles = availableFiles
                .Where(path => path.EndsWith(".py", StringComparison.OrdinalIgnoreCase))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .OrderBy(path => path, StringComparer.OrdinalIgnoreCase)
                .ToArray();
            var interactiveModules = CollectInteractivePythonModulesFromSources(sourceFiles);
            var displayCommand = $"python3 {EscapeShellArg(entryPath)}";
            if (interactiveModules.Count > 0)
            {
                return new LatestCodingExecutionCommandPlan(
                    BuildInteractivePythonLaunchCommand(target.RunDirectory, entryPath, sourceFiles, interactiveModules),
                    displayCommand
                );
            }

            return new LatestCodingExecutionCommandPlan(displayCommand, displayCommand);
        }

        if (string.Equals(normalizedLanguage, "javascript", StringComparison.OrdinalIgnoreCase))
        {
            var projectCommand = TryBuildNodeProjectRerunCommand(target.RunDirectory, availableFiles);
            if (!string.IsNullOrWhiteSpace(projectCommand))
            {
                return new LatestCodingExecutionCommandPlan(projectCommand, projectCommand);
            }

            var displayCommand = $"node {EscapeShellArg(entryPath)}";
            return new LatestCodingExecutionCommandPlan(displayCommand, displayCommand);
        }

        if (string.Equals(normalizedLanguage, "csharp", StringComparison.OrdinalIgnoreCase))
        {
            var projectCommand = TryBuildDotnetProjectRerunCommand(target.RunDirectory, availableFiles);
            if (!string.IsNullOrWhiteSpace(projectCommand))
            {
                return new LatestCodingExecutionCommandPlan(projectCommand, projectCommand);
            }
        }

        if (string.Equals(normalizedLanguage, "java", StringComparison.OrdinalIgnoreCase))
        {
            var projectCommand = TryBuildJvmProjectRerunCommand(target.RunDirectory, availableFiles);
            if (!string.IsNullOrWhiteSpace(projectCommand))
            {
                return new LatestCodingExecutionCommandPlan(projectCommand, projectCommand);
            }

            var actualCommand = BuildJavaFallbackCommand(target.RunDirectory, entryPath);
            return new LatestCodingExecutionCommandPlan(actualCommand, actualCommand);
        }

        if (string.Equals(normalizedLanguage, "kotlin", StringComparison.OrdinalIgnoreCase))
        {
            var projectCommand = TryBuildJvmProjectRerunCommand(target.RunDirectory, availableFiles);
            if (!string.IsNullOrWhiteSpace(projectCommand))
            {
                return new LatestCodingExecutionCommandPlan(projectCommand, projectCommand);
            }
        }

        if (string.Equals(normalizedLanguage, "c", StringComparison.OrdinalIgnoreCase))
        {
            var projectCommand = TryBuildNativeProjectRerunCommand(target.RunDirectory, availableFiles);
            if (!string.IsNullOrWhiteSpace(projectCommand))
            {
                return new LatestCodingExecutionCommandPlan(projectCommand, projectCommand);
            }

            var actualCommand = BuildCFallbackCommand(entryPath, availableFiles);
            return new LatestCodingExecutionCommandPlan(actualCommand, actualCommand);
        }

        if (string.Equals(normalizedLanguage, "cpp", StringComparison.OrdinalIgnoreCase))
        {
            var projectCommand = TryBuildNativeProjectRerunCommand(target.RunDirectory, availableFiles);
            if (!string.IsNullOrWhiteSpace(projectCommand))
            {
                return new LatestCodingExecutionCommandPlan(projectCommand, projectCommand);
            }

            var actualCommand = BuildCppFallbackCommand(entryPath, availableFiles);
            return new LatestCodingExecutionCommandPlan(actualCommand, actualCommand);
        }

        return new LatestCodingExecutionCommandPlan(string.Empty, string.Empty);
    }

    private static string? ResolvePreferredExecutionEntryPath(
        string normalizedLanguage,
        string runDirectory,
        string entryFile,
        IReadOnlyList<string> availableFiles
    )
    {
        if (!string.IsNullOrWhiteSpace(entryFile))
        {
            try
            {
                var explicitEntry = Path.IsPathRooted(entryFile)
                    ? Path.GetFullPath(entryFile)
                    : Path.GetFullPath(Path.Combine(runDirectory, entryFile));
                if (File.Exists(explicitEntry))
                {
                    return explicitEntry;
                }
            }
            catch
            {
            }
        }

        var selected = SelectEntryLikeChangedFile(normalizedLanguage, availableFiles);
        if (!string.IsNullOrWhiteSpace(selected))
        {
            return selected;
        }

        if (availableFiles.Count == 1 && File.Exists(availableFiles[0]))
        {
            return availableFiles[0];
        }

        return availableFiles
            .Where(path => !string.IsNullOrWhiteSpace(path) && File.Exists(path))
            .OrderBy(path => path, StringComparer.OrdinalIgnoreCase)
            .FirstOrDefault();
    }

    internal static string BuildInteractivePythonLaunchCommand(
        string runDirectory,
        string entryPath,
        IReadOnlyList<string> sourceFiles,
        IReadOnlyCollection<string> interactiveModules
    )
    {
        var sourceArgs = JoinShellArgs(
            (sourceFiles ?? Array.Empty<string>())
                .Where(path => !string.IsNullOrWhiteSpace(path))
                .Distinct(StringComparer.OrdinalIgnoreCase)
        );
        if (string.IsNullOrWhiteSpace(sourceArgs))
        {
            return string.Empty;
        }

        var workspaceSafe = EscapeShellArg(runDirectory);
        var moduleCheckCommand = BuildInteractivePythonModuleAvailabilityCommand(interactiveModules);
        var launchCommand = $"python3 {EscapeShellArg(entryPath)}";
        // macOS/Linux 에는 python 명령이 기본으로 없다(python3 만 있다).
        var runtimeLaunchCommand = OperatingSystem.IsWindows()
            ? $"python {EscapeShellArg(entryPath)}"
            : launchCommand;
        if (ShouldLaunchInteractivePythonInTerminal(interactiveModules))
        {
            return BuildInteractivePythonTerminalLaunchCommand(
                runDirectory,
                sourceArgs,
                moduleCheckCommand,
                runtimeLaunchCommand
            );
        }

        return BuildInteractivePythonDetachedLaunchCommand(
            runDirectory,
            sourceArgs,
            moduleCheckCommand,
            runtimeLaunchCommand
        );
    }

    private static string BuildInteractivePythonDetachedLaunchCommand(
        string runDirectory,
        string sourceArgs,
        string moduleCheckCommand,
        string launchCommand
    )
    {
        var workspaceSafe = EscapeShellArg(runDirectory);
        var stdoutLog = EscapeShellArg(Path.Combine(runDirectory, ".omnux-interactive-stdout.log"));
        var stderrLog = EscapeShellArg(Path.Combine(runDirectory, ".omnux-interactive-stderr.log"));
        return
            $"cd {workspaceSafe} && " +
            // 모듈 확인이 작업공간 .venv 파이썬을 쓰므로 여기서 __omni_py 를 먼저 정의해야 한다.
            $"{BuildPythonRunnerPrefixCommand()} && " +
            $"python3 -m py_compile {sourceArgs} && " +
            $"{moduleCheckCommand} && " +
            $"rm -f {stdoutLog} {stderrLog} && " +
            $"nohup {launchCommand} >{stdoutLog} 2>{stderrLog} </dev/null & " +
            "__omni_pid=$! && " +
            "sleep 2 && " +
            "if kill -0 \"$__omni_pid\" 2>/dev/null; then " +
            "printf '%s\\n' 'interactive app launched and left running until you close it'; " +
            "printf 'pid=%s\\n' \"$__omni_pid\"; " +
            "exit 0; " +
            "fi; " +
            "wait \"$__omni_pid\"; __omni_status=$?; " +
            $"if [ -s {stdoutLog} ]; then cat {stdoutLog}; fi; " +
            $"if [ -s {stderrLog} ]; then cat {stderrLog} >&2; fi; " +
            $"if [ $__omni_status -eq 0 ] && [ ! -s {stdoutLog} ] && [ ! -s {stderrLog} ]; then " +
            "printf '%s\\n' 'interactive app exited without stdout/stderr'; " +
            "fi; " +
            "exit $__omni_status";
    }

    private static string BuildInteractivePythonTerminalLaunchCommand(
        string runDirectory,
        string sourceArgs,
        string moduleCheckCommand,
        string launchCommand
    )
    {
        var workspaceSafe = EscapeShellArg(runDirectory);
        var terminalScript = $"cd {workspaceSafe} && {launchCommand}";
        if (!OperatingSystem.IsMacOS())
        {
            return
                $"cd {workspaceSafe} && " +
                $"{BuildPythonRunnerPrefixCommand()} && " +
                $"python3 -m py_compile {sourceArgs} && " +
                $"{moduleCheckCommand} && " +
                $"{{ nohup x-terminal-emulator -e sh -c {EscapeShellArg(terminalScript)} >/dev/null 2>&1 </dev/null & }} && " +
                "printf '%s\\n' 'interactive terminal app launched in a terminal window and will stay open until you close it'";
        }

        var activateStatement = EscapeShellArg("tell application \"Terminal\" to activate");
        var runStatement = EscapeShellArg(
            $"tell application \"Terminal\" to do script \"{EscapeAppleScriptString(terminalScript)}\""
        );
        return
            $"cd {workspaceSafe} && " +
            $"{BuildPythonRunnerPrefixCommand()} && " +
            $"python3 -m py_compile {sourceArgs} && " +
            $"{moduleCheckCommand} && " +
            $"osascript -e {activateStatement} -e {runStatement} >/dev/null && " +
            "printf '%s\\n' 'interactive terminal app launched in Terminal and will stay open until you close it'";
    }

    private static bool ShouldLaunchInteractivePythonInTerminal(IReadOnlyCollection<string> interactiveModules)
    {
        var needsTerminal = (interactiveModules ?? Array.Empty<string>())
            .Any(module => string.Equals(module, "curses", StringComparison.OrdinalIgnoreCase));
        // macOS 는 Terminal.app(osascript), Linux 는 Debian 계열 x-terminal-emulator(-e 규약)로 연다.
        return needsTerminal
            && (OperatingSystem.IsMacOS()
                || (OperatingSystem.IsLinux() && RefactorToolAvailability.FindExecutable(new[] { "x-terminal-emulator" }) is not null));
    }

    private static string EscapeAppleScriptString(string value)
    {
        return (value ?? string.Empty)
            .Replace("\\", "\\\\", StringComparison.Ordinal)
            .Replace("\"", "\\\"", StringComparison.Ordinal);
    }

    private static string NormalizeStoredRunDirectory(string? runDirectory)
    {
        var normalized = (runDirectory ?? string.Empty).Trim();
        return normalized == "-" ? string.Empty : normalized;
    }

    private static string NormalizeStoredEntryFile(string? entryFile)
    {
        var normalized = (entryFile ?? string.Empty).Trim();
        return normalized == "-" ? string.Empty : normalized;
    }

    private static bool IsSuccessfulCodingExecutionStatus(string? status)
    {
        return string.Equals((status ?? string.Empty).Trim(), "ok", StringComparison.OrdinalIgnoreCase)
            || string.Equals((status ?? string.Empty).Trim(), "success", StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsRunnableCodingExecutionCommand(string? command)
    {
        var normalized = (command ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return false;
        }

        return normalized switch
        {
            "-" => false,
            "(skipped)" => false,
            "(planning)" => false,
            "(none)" => false,
            "(draft-only)" => false,
            "(worker-independent-runs)" => false,
            _ => true
        };
    }

    private static string NormalizeLatestCodingExecutionInput(string? standardInput)
    {
        return (standardInput ?? string.Empty)
            .Replace("\r\n", "\n", StringComparison.Ordinal)
            .Replace("\r", "\n", StringComparison.Ordinal);
    }

    private static string BuildLatestCodingExecutionMessage(
        bool hasWorkerTarget,
        string provider,
        string model,
        string standardError,
        string standardInput
    )
    {
        if (LooksLikeStandardInputFailure(standardError))
        {
            var suffix = string.IsNullOrWhiteSpace(standardInput)
                ? "표준 입력이 필요합니다. 아래 stdin 입력 칸에 값을 줄바꿈으로 넣고 다시 실행하세요."
                : "표준 입력 형식이 맞지 않았습니다. stdin 입력 값을 조정해 다시 실행하세요.";
            return hasWorkerTarget
                ? $"최근 코딩 결과를 다시 실행했습니다. · {provider}/{model} · {suffix}"
                : $"최근 코딩 결과를 다시 실행했습니다. {suffix}";
        }

        return hasWorkerTarget
            ? $"최근 코딩 결과를 다시 실행했습니다. · {provider}/{model}"
            : "최근 코딩 결과를 다시 실행했습니다.";
    }

    private static bool LooksLikeStandardInputFailure(string? standardError)
    {
        var normalized = (standardError ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return false;
        }

        return normalized.Contains("EOFError", StringComparison.OrdinalIgnoreCase)
               || normalized.Contains("EOF when reading a line", StringComparison.OrdinalIgnoreCase)
               || normalized.Contains("No line found", StringComparison.OrdinalIgnoreCase)
               || normalized.Contains("no such element", StringComparison.OrdinalIgnoreCase)
               || normalized.Contains("readLine() returned null", StringComparison.OrdinalIgnoreCase)
               || normalized.Contains("input stream is closed", StringComparison.OrdinalIgnoreCase);
    }

    private string BuildLatestCodingExecutionFallbackCommand(
        string language,
        string runDirectory,
        string entryFile,
        IReadOnlyList<string> changedFiles
    )
    {
        var normalizedLanguage = CodingLanguagePolicy.NormalizeLanguageForCode(language);
        var availableFiles = (changedFiles ?? Array.Empty<string>())
            .Where(path => !string.IsNullOrWhiteSpace(path) && File.Exists(path))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        string? entryPath = null;
        if (!string.IsNullOrWhiteSpace(entryFile))
        {
            entryPath = Path.IsPathRooted(entryFile)
                ? Path.GetFullPath(entryFile)
                : Path.GetFullPath(Path.Combine(runDirectory, entryFile));
            if (!File.Exists(entryPath))
            {
                entryPath = null;
            }
        }

        entryPath ??= SelectEntryLikeChangedFile(normalizedLanguage, availableFiles);
        if (string.IsNullOrWhiteSpace(entryPath))
        {
            return string.Empty;
        }

        var safeEntry = EscapeShellArg(entryPath);
        return normalizedLanguage switch
        {
            "python" => OperatingSystem.IsWindows() ? $"python {safeEntry}" : $"python3 {safeEntry}",
            "javascript" => TryBuildNodeProjectRerunCommand(runDirectory, availableFiles) is { Length: > 0 } nodeCommand ? nodeCommand : BuildRequiredProgramCommand("node", $"node {safeEntry}", "node 없음"),
            "csharp" => TryBuildDotnetProjectRerunCommand(runDirectory, availableFiles),
            "java" => BuildJavaFallbackCommand(runDirectory, entryPath),
            "kotlin" => TryBuildJvmProjectRerunCommand(runDirectory, availableFiles),
            "c" => BuildCFallbackCommand(entryPath, availableFiles),
            "cpp" => BuildCppFallbackCommand(entryPath, availableFiles),
            _ => string.Empty
        };
    }

    private static string TryBuildNodeProjectRerunCommand(string runDirectory, IReadOnlyList<string> changedFiles)
    {
        var root = FindNearestRerunRootWithFile(runDirectory, changedFiles, "package.json");
        if (string.IsNullOrWhiteSpace(root))
        {
            return string.Empty;
        }

        var packageText = SafeReadAllText(Path.Combine(root, "package.json"));
        var rootSafe = EscapeShellArg(root);
        var cdRoot = OperatingSystem.IsWindows() ? $"cd /d {rootSafe}" : $"cd {rootSafe}";
        if (packageText.Contains("\"start\"", StringComparison.OrdinalIgnoreCase))
        {
            return $"{cdRoot} && npm install --no-fund --no-audit && npm start";
        }

        if (packageText.Contains("\"build\"", StringComparison.OrdinalIgnoreCase))
        {
            return $"{cdRoot} && npm install --no-fund --no-audit && npm run build";
        }

        return $"{cdRoot} && npm install --no-fund --no-audit";
    }

    private static string TryBuildDotnetProjectRerunCommand(string runDirectory, IReadOnlyList<string> changedFiles)
    {
        var projectFile = (changedFiles ?? Array.Empty<string>())
            .FirstOrDefault(path => path.EndsWith(".csproj", StringComparison.OrdinalIgnoreCase) && File.Exists(path))
            ?? Directory.EnumerateFiles(runDirectory, "*.csproj", SearchOption.AllDirectories).FirstOrDefault();
        return string.IsNullOrWhiteSpace(projectFile)
            ? string.Empty
            : $"dotnet restore {EscapeShellArg(projectFile)} && dotnet run --project {EscapeShellArg(projectFile)} --no-launch-profile";
    }

    private static string TryBuildJvmProjectRerunCommand(string runDirectory, IReadOnlyList<string> changedFiles)
    {
        var root = FindNearestRerunRootWithFile(runDirectory, changedFiles, "gradlew")
            ?? FindNearestRerunRootWithFile(runDirectory, changedFiles, "build.gradle")
            ?? FindNearestRerunRootWithFile(runDirectory, changedFiles, "build.gradle.kts");
        if (!string.IsNullOrWhiteSpace(root))
        {
            var cdRoot = OperatingSystem.IsWindows() ? $"cd /d {EscapeShellArg(root)}" : $"cd {EscapeShellArg(root)}";
            if (File.Exists(Path.Combine(root, "gradlew")))
            {
                var gradlew = OperatingSystem.IsWindows() ? "gradlew.bat" : "chmod +x ./gradlew && ./gradlew";
                return $"{cdRoot} && {gradlew} --no-daemon run";
            }

            return $"{cdRoot} && {BuildRequiredProgramCommand("gradle", "gradle --no-daemon run", "gradle 없음")}";
        }

        return string.Empty;
    }

    private static string TryBuildNativeProjectRerunCommand(string runDirectory, IReadOnlyList<string> changedFiles)
    {
        var root = FindNearestRerunRootWithFile(runDirectory, changedFiles, "CMakeLists.txt");
        if (!string.IsNullOrWhiteSpace(root))
        {
            var cdRoot = OperatingSystem.IsWindows() ? $"cd /d {EscapeShellArg(root)}" : $"cd {EscapeShellArg(root)}";
            var runCommand = OperatingSystem.IsWindows()
                ? "for /r build %f in (*.exe) do (%f & exit /b %ERRORLEVEL%) & echo 실행 파일을 찾지 못했습니다. 1>&2 & exit /b 1"
                : "__omni_bin=$(find build -type f -perm -111 | head -1); if [ -n \"$__omni_bin\" ]; then \"$__omni_bin\"; else echo '실행 파일을 찾지 못했습니다.'; exit 1; fi";
            return $"{cdRoot} && cmake -S . -B build && cmake --build build && {runCommand}";
        }

        root = FindNearestRerunRootWithFile(runDirectory, changedFiles, "Makefile");
        if (!string.IsNullOrWhiteSpace(root))
        {
            var cdRoot = OperatingSystem.IsWindows() ? $"cd /d {EscapeShellArg(root)}" : $"cd {EscapeShellArg(root)}";
            var runCommand = OperatingSystem.IsWindows()
                ? "for /r . %f in (*.exe) do (%f & exit /b %ERRORLEVEL%) & echo 실행 파일을 찾지 못했습니다. 1>&2 & exit /b 1"
                : "__omni_bin=$(find . -maxdepth 2 -type f -perm -111 | grep -v '/\\.' | head -1); if [ -n \"$__omni_bin\" ]; then \"$__omni_bin\"; else echo '실행 파일을 찾지 못했습니다.'; exit 1; fi";
            return $"{cdRoot} && make && {runCommand}";
        }

        return string.Empty;
    }

    private string BuildJavaFallbackCommand(string runDirectory, string entryPath)
    {
        var javaFiles = Directory.EnumerateFiles(runDirectory, "*.java", SearchOption.TopDirectoryOnly)
            .Select(EscapeShellArg)
            .ToArray();
        if (javaFiles.Length == 0)
        {
            javaFiles = new[] { EscapeShellArg(entryPath) };
        }

        var mainClass = Path.GetFileNameWithoutExtension(entryPath);
        return $"javac {string.Join(" ", javaFiles)} && java {EscapeShellArg(mainClass)}";
    }

    private string BuildCFallbackCommand(string entryPath, IReadOnlyList<string> changedFiles)
    {
        var cSources = (changedFiles ?? Array.Empty<string>())
            .Where(path => path.EndsWith(".c", StringComparison.OrdinalIgnoreCase) && File.Exists(path))
            .Select(EscapeShellArg)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
        if (cSources.Length == 0)
        {
            cSources = new[] { EscapeShellArg(entryPath) };
        }

        var output = OperatingSystem.IsWindows() ? "app.exe" : "app";
        var run = OperatingSystem.IsWindows() ? ".\\app.exe" : "./app";
        return $"cc -std=c11 -O2 {string.Join(" ", cSources)} -o {output} && {run}";
    }

    private string BuildCppFallbackCommand(string entryPath, IReadOnlyList<string> changedFiles)
    {
        var cppSources = (changedFiles ?? Array.Empty<string>())
            .Where(path => (path.EndsWith(".cpp", StringComparison.OrdinalIgnoreCase)
                            || path.EndsWith(".cc", StringComparison.OrdinalIgnoreCase)
                            || path.EndsWith(".cxx", StringComparison.OrdinalIgnoreCase))
                           && File.Exists(path))
            .Select(EscapeShellArg)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
        if (cppSources.Length == 0)
        {
            cppSources = new[] { EscapeShellArg(entryPath) };
        }

        var output = OperatingSystem.IsWindows() ? "app.exe" : "app";
        var run = OperatingSystem.IsWindows() ? ".\\app.exe" : "./app";
        if (OperatingSystem.IsWindows())
        {
            return $"(where c++ >NUL 2>NUL && c++ -std=c++17 -O2 {string.Join(" ", cppSources)} -o {output}) || (where g++ >NUL 2>NUL && g++ -std=c++17 -O2 {string.Join(" ", cppSources)} -o {output}) && {run}";
        }

        return $"compiler=$(command -v c++ || command -v g++ || true); if [ -n \"$compiler\" ]; then \"$compiler\" -std=c++17 -O2 {string.Join(" ", cppSources)} -o {output} && {run}; else echo 'c++ 없음'; exit 1; fi";
    }

    private static string? FindNearestRerunRootWithFile(string runDirectory, IReadOnlyList<string> changedFiles, string fileName)
    {
        foreach (var changedFile in changedFiles ?? Array.Empty<string>())
        {
            if (string.IsNullOrWhiteSpace(changedFile))
            {
                continue;
            }

            var dir = File.Exists(changedFile) ? Path.GetDirectoryName(changedFile) : changedFile;
            while (!string.IsNullOrWhiteSpace(dir) && IsPathUnderRoot(dir, runDirectory))
            {
                if (File.Exists(Path.Combine(dir, fileName)))
                {
                    return dir;
                }

                dir = Path.GetDirectoryName(dir);
            }
        }

        return File.Exists(Path.Combine(runDirectory, fileName)) ? runDirectory : null;
    }

    private static string ResolveHtmlPreviewEntryPath(
        CodeExecutionResult execution,
        IReadOnlyList<string> changedFiles,
        string runDirectory
    )
    {
        var candidatePaths = new List<string>();
        var entryFile = NormalizeStoredEntryFile(execution.EntryFile);
        if (!string.IsNullOrWhiteSpace(entryFile))
        {
            candidatePaths.Add(entryFile);
        }

        foreach (var path in changedFiles ?? Array.Empty<string>())
        {
            candidatePaths.Add(path);
        }

        foreach (var candidate in candidatePaths)
        {
            if (string.IsNullOrWhiteSpace(candidate))
            {
                continue;
            }

            var fullPath = Path.IsPathRooted(candidate)
                ? Path.GetFullPath(candidate)
                : Path.GetFullPath(Path.Combine(runDirectory, candidate));
            if (!File.Exists(fullPath) || !fullPath.EndsWith(".html", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            return Path.GetRelativePath(runDirectory, fullPath)
                .Replace(Path.DirectorySeparatorChar, '/');
        }

        var fallbackIndex = Path.Combine(runDirectory, "index.html");
        if (File.Exists(fallbackIndex))
        {
            return "index.html";
        }

        return string.Empty;
    }

    private static string BuildCodingPreviewUrl(string conversationId, string targetSegment, string previewEntry)
    {
        var safeConversationId = Uri.EscapeDataString((conversationId ?? string.Empty).Trim());
        var safeTarget = Uri.EscapeDataString((targetSegment ?? "main").Trim());
        var normalizedEntry = (previewEntry ?? "index.html")
            .Replace('\\', '/')
            .Trim('/')
            .Split('/', StringSplitOptions.RemoveEmptyEntries)
            .Select(Uri.EscapeDataString);
        return $"{CodingPreviewApiPrefix}/{safeConversationId}/{safeTarget}/{string.Join("/", normalizedEntry)}";
    }
}
