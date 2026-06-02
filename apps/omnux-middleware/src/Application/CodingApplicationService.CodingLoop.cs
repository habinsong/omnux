using System.Text.Json;

namespace Omnux.Middleware;

public sealed partial class CodingApplicationService
{
    private static string BuildCodingQualityBrief(string objective, string languageHint)
    {
        return CodingQualityBriefPolicy.Build(objective, languageHint, IsFrontendLikeCodingTask, IsGameLikeCodingTask);
    }

    private async Task<CodingWorkerResult> RunCodingWorkerAsync(
        string provider,
        string model,
        string prompt,
        string languageHint,
        CancellationToken cancellationToken,
        Action<CodingProgressUpdate>? progressCallback = null,
        string progressMode = "worker",
        bool allowRunActions = true,
        string role = "",
        string? workspaceRootOverride = null
    )
    {
        if (!allowRunActions)
        {
            return await RunDraftCodingWorkerAsync(
                provider,
                model,
                prompt,
                languageHint,
                cancellationToken,
                role
            );
        }

        var outcome = await RunAutonomousCodingLoopAsync(
            provider,
            model,
            prompt,
            languageHint,
            "worker",
            cancellationToken,
            progressCallback,
            progressMode,
            allowRunActions,
            workspaceRootOverride: workspaceRootOverride
        );
        return new CodingWorkerResult(
            provider,
            model,
            outcome.Language,
            outcome.Code,
            outcome.RawResponse + "\n\n[loop]\n" + outcome.Summary,
            outcome.Execution,
            outcome.ChangedFiles,
            role,
            outcome.Summary,
            outcome.TokenUsage
        );
    }

    private async Task<CodingWorkerResult> RunDraftCodingWorkerAsync(
        string provider,
        string model,
        string objective,
        string languageHint,
        CancellationToken cancellationToken,
        string role = ""
    )
    {
        var requestedPaths = CodingFallbackPolicy.ExtractRequestedCodingPaths(objective, languageHint);
        var profile = ResolveCodingExecutionProfile(provider, model, objective, languageHint, requestedPaths);
        var draftPrompt = BuildDraftCodingWorkerPrompt(objective, languageHint);
        var generated = await GenerateByProviderSafeAsync(
            provider,
            model,
            draftPrompt,
            cancellationToken,
            ResolveDraftGenerationMaxOutputTokens(profile),
            useRawCodexPrompt: true,
            optimizeCodexForCoding: profile.OptimizeCodexCli,
            timeoutOverrideSeconds: profile.RequestTimeoutSeconds
        );

        var rawResponse = (generated.Text ?? string.Empty).Trim();
        var parsed = CodingFallbackPolicy.ExtractFallbackCode(rawResponse, languageHint, objective);
        var draftTokenUsage = generated.TokenUsage;
        if (string.IsNullOrWhiteSpace(parsed.Code))
        {
            var codeOnlyPrompt = BuildFallbackCodeOnlyPrompt(objective, languageHint);
            var fallback = await GenerateByProviderSafeAsync(
                provider,
                model,
                codeOnlyPrompt,
                cancellationToken,
                ResolveDraftGenerationMaxOutputTokens(profile),
                useRawCodexPrompt: true,
                optimizeCodexForCoding: profile.OptimizeCodexCli,
                timeoutOverrideSeconds: profile.RequestTimeoutSeconds
            );
            var fallbackRaw = (fallback.Text ?? string.Empty).Trim();
            var fallbackParsed = CodingFallbackPolicy.ExtractFallbackCode(fallbackRaw, languageHint, objective);
            if (!string.IsNullOrWhiteSpace(fallbackParsed.Code))
            {
                parsed = fallbackParsed;
                rawResponse = string.IsNullOrWhiteSpace(rawResponse) ? fallbackRaw : $"{rawResponse}\n\n[code-only-fallback]\n{fallbackRaw}";
            }

            draftTokenUsage = TokenUsageEstimator.Combine(draftTokenUsage, fallback.TokenUsage);
        }

        var resolvedLanguage = string.IsNullOrWhiteSpace(parsed.Language)
            ? CodingLanguagePolicy.ResolveInitialCodingLanguage(languageHint, objective)
            : CodingLanguagePolicy.NormalizeLanguageForCode(parsed.Language);
        var execution = new CodeExecutionResult(
            resolvedLanguage,
            "-",
            "-",
            "(draft-only)",
            0,
            string.Empty,
            string.Empty,
            "skipped"
        );

        return new CodingWorkerResult(
            provider,
            model,
            resolvedLanguage,
            parsed.Code,
            string.IsNullOrWhiteSpace(rawResponse) ? "초안 생성 결과가 비어 있습니다." : rawResponse,
            execution,
            Array.Empty<string>(),
            role,
            string.IsNullOrWhiteSpace(rawResponse) ? "초안 생성 결과가 비어 있습니다." : TrimForOutput(rawResponse, 1800),
            draftTokenUsage
        );
    }

    private async Task<AutonomousCodingOutcome> RunAutonomousCodingLoopAsync(
        string provider,
        string model,
        string objective,
        string languageHint,
        string modeLabel,
        CancellationToken cancellationToken,
        Action<CodingProgressUpdate>? progressCallback = null,
        string? progressModeOverride = null,
        bool allowRunActions = true,
        string? workspaceRootOverride = null,
        int repairAttempt = 0
    )
    {
        var workspaceRoot = ResolveCodingWorkspaceRoot(workspaceRootOverride);
        var requestedPaths = CodingFallbackPolicy.ExtractRequestedCodingPaths(objective, languageHint);
        var profile = ResolveCodingExecutionProfile(provider, model, objective, languageHint, requestedPaths);
        var oneShotMode = ShouldUseOneShotMode(profile, objective, languageHint);
        var maxIterations = ResolveMaxIterations(profile, oneShotMode);
        var maxActions = ResolveMaxActions(profile, oneShotMode);
        var iterations = new List<string>();
        TokenUsage? totalTokenUsage = null;
        var progressMode = string.IsNullOrWhiteSpace(progressModeOverride) ? modeLabel : progressModeOverride;

        var currentLanguage = CodingLanguagePolicy.ResolveInitialCodingLanguage(languageHint, objective);
        var expectedOutput = CodingFallbackPolicy.ExtractExpectedConsoleOutput(objective);
        var lastCode = string.Empty;
        var lastWritePath = "-";
        var lastRawResponse = string.Empty;
        var changedFiles = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var deferredRunCommand = string.Empty;
        var hasDeferredRunAction = false;
        var consecutivePlanParseFailures = 0;
        var consecutiveNoActionPlans = 0;
        var attemptedDirectRecovery = ShouldAttemptEarlyDirectRecovery(profile, objective, languageHint, requestedPaths);
        var lastExecution = new CodeExecutionResult(
            currentLanguage,
            workspaceRoot,
            "-",
            "(none)",
            0,
            "아직 실행 명령이 없습니다.",
            string.Empty,
            "skipped"
        );

        progressCallback?.Invoke(BuildCodingProgressUpdate(
            progressMode,
            provider,
            model,
            "start",
            "요청을 해석하고 작업 범위를 정리합니다.",
            0,
            maxIterations,
            3,
            false,
            "request",
            "요청 분석",
            CodingProgressPolicy.BuildObjectiveDetail(objective, languageHint),
            1,
            VisibleCodingStageTotal
        ));

        var initialSnapshot = BuildWorkspaceSnapshot(workspaceRoot, profile);
        progressCallback?.Invoke(BuildCodingProgressUpdate(
            progressMode,
            provider,
            model,
            "scanning",
            "현재 작업공간 상태를 확인합니다.",
            0,
            maxIterations,
            10,
            false,
            "workspace",
            "작업공간 점검",
            CodingProgressPolicy.BuildWorkspaceDetail(initialSnapshot),
            2,
            VisibleCodingStageTotal
        ));

        var directRecovery = attemptedDirectRecovery
            ? await TryApplyProviderDirectRecoveryAsync(
                profile,
                provider,
                model,
                objective,
                languageHint,
                workspaceRoot,
                requestedPaths,
                cancellationToken,
                progressCallback,
                progressMode,
                maxIterations
            )
            : null;
        if (directRecovery != null)
        {
            progressCallback?.Invoke(BuildCodingProgressUpdate(
                progressMode,
                provider,
                model,
                "done",
                "코딩 작업이 완료되었습니다.",
                maxIterations,
                maxIterations,
                100,
                true,
                "verification",
                "최종 실행 및 검증",
                $"직생성 복구 적용 · 상태: {directRecovery.Execution.Status}",
                6,
                VisibleCodingStageTotal
            ));
            return directRecovery;
        }

        if (profile.AllowDeterministicStdoutFastPath
            && CodingDeterministicOutputRepairPolicy.ShouldTrySingleFileOutputRepair(currentLanguage, requestedPaths, expectedOutput))
        {
            progressCallback?.Invoke(BuildCodingProgressUpdate(
                progressMode,
                provider,
                model,
                "planning",
                "단순 단일 파일 출력 요청이라 빠른 결정론적 경로를 적용합니다.",
                1,
                maxIterations,
                28,
                false,
                "planning",
                "구현 계획",
                "요청 파일을 직접 생성하고 stdout까지 바로 검증합니다.",
                3,
                VisibleCodingStageTotal
            ));

            var deterministicOutcome = await TryApplyDeterministicSingleFileOutputRepairAsync(
                objective,
                currentLanguage,
                workspaceRoot,
                requestedPaths,
                expectedOutput,
                cancellationToken
            );
            if (deterministicOutcome.Applied)
            {
                var changedPaths = new[] { deterministicOutcome.ChangedPath };
                var fastPathSummary = BuildAutonomousCodingSummary(
                    new[] { "deterministic_fast_path=single_file_output" },
                    changedPaths,
                    deterministicOutcome.Execution,
                    maxIterations
                );
                progressCallback?.Invoke(BuildCodingProgressUpdate(
                    progressMode,
                    provider,
                    model,
                    "done",
                    "코딩 작업이 완료되었습니다.",
                    maxIterations,
                    maxIterations,
                    100,
                    true,
                    "verification",
                    "최종 실행 및 검증",
                    $"최종 상태: {deterministicOutcome.Execution.Status} (exit={deterministicOutcome.Execution.ExitCode})",
                    6,
                    VisibleCodingStageTotal
                ));
                return new AutonomousCodingOutcome(
                    currentLanguage,
                    deterministicOutcome.Code,
                    "[deterministic-fast-path]",
                    deterministicOutcome.Execution,
                    changedPaths,
                    fastPathSummary
                );
            }
        }

        for (var i = 1; i <= maxIterations; i++)
        {
            var snapshot = i == 1 ? initialSnapshot : BuildWorkspaceSnapshot(workspaceRoot, profile);
            var recent = BuildRecentLoopLogs(iterations, profile);
            var loopPrompt = BuildCodingLoopPrompt(
                objective,
                languageHint,
                modeLabel,
                workspaceRoot,
                profile,
                oneShotMode,
                i,
                maxIterations,
                maxActions,
                snapshot,
                recent,
                lastExecution
            );

            var generated = await GenerateByProviderSafeAsync(
                provider,
                model,
                loopPrompt,
                cancellationToken,
                GetCodingPlanMaxOutputTokens(profile),
                useRawCodexPrompt: true,
                codexWorkingDirectoryOverride: workspaceRoot,
                optimizeCodexForCoding: profile.OptimizeCodexCli,
                timeoutOverrideSeconds: profile.RequestTimeoutSeconds
            );
            totalTokenUsage = TokenUsageEstimator.Combine(totalTokenUsage, generated.TokenUsage);
            lastRawResponse = generated.Text;
            var plan = CodingLoopPlanParser.Parse(generated.Text);
            if (plan == null)
            {
                consecutivePlanParseFailures++;
                consecutiveNoActionPlans = 0;
                iterations.Add($"iter={i} plan_parse_failed");
                progressCallback?.Invoke(BuildCodingProgressUpdate(
                    progressMode,
                    provider,
                    model,
                    "retry",
                    $"반복 {i}/{maxIterations}: 계획 파싱 실패로 다음 반복에서 복구합니다.",
                    i,
                    maxIterations,
                    Math.Clamp((int)Math.Round((double)i / maxIterations * 55d), 18, 54),
                    false,
                    "planning",
                    "구현 계획",
                    "응답 형식을 다시 정렬한 뒤 계획을 재생성합니다.",
                    3,
                    VisibleCodingStageTotal
                ));
                if (consecutivePlanParseFailures >= 2)
                {
                    iterations.Add($"iter={i} plan_parse_abort");
                    break;
                }

                continue;
            }

            consecutivePlanParseFailures = 0;
            var actionResults = new List<string>();
            var actions = plan.Actions.Take(maxActions).ToArray();
            progressCallback?.Invoke(BuildCodingProgressUpdate(
                progressMode,
                provider,
                model,
                "planning",
                $"반복 {i}/{maxIterations}: 이번 구현 계획을 정리했습니다.",
                i,
                maxIterations,
                Math.Clamp((int)Math.Round((double)i / maxIterations * 45d), 16, 48),
                false,
                "planning",
                "구현 계획",
                CodingProgressPolicy.BuildPlanDetail(plan, actions, actions.Any(action => string.Equals(action.Type, "run", StringComparison.OrdinalIgnoreCase))),
                3,
                VisibleCodingStageTotal
            ));
            if (actions.Length == 0)
            {
                consecutiveNoActionPlans++;
                actionResults.Add("actions=none");
                iterations.Add($"iter={i} analysis={TrimForOutput(plan.Analysis ?? string.Empty)} | {string.Join(" ; ", actionResults)}");
                progressCallback?.Invoke(BuildCodingProgressUpdate(
                    progressMode,
                    provider,
                    model,
                    "idle",
                    $"반복 {i}/{maxIterations}: 이번 반복에는 실행할 액션이 없습니다.",
                    i,
                    maxIterations,
                    Math.Clamp((int)Math.Round((double)i / maxIterations * 58d), 20, 60),
                    false,
                    "planning",
                    "구현 계획",
                    "생성된 계획에 실질 액션이 없어 다음 반복으로 넘어갑니다.",
                    3,
                    VisibleCodingStageTotal
                ));
                if (plan.Done)
                {
                    break;
                }

                if (consecutiveNoActionPlans >= 2)
                {
                    iterations.Add($"iter={i} actions_none_abort");
                    break;
                }

                continue;
            }

            consecutiveNoActionPlans = 0;
            var iterationChangedPaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var action in actions)
            {
                if (string.Equals(action.Type, "run", StringComparison.OrdinalIgnoreCase))
                {
                    var candidateCommand = CodingFallbackPolicy.NormalizeGeneratedRunCommand(action.Command);
                    if (string.IsNullOrWhiteSpace(candidateCommand))
                    {
                        actionResults.Add("run_deferred:empty_command");
                    }
                    else if (CodingExecutionSafetyPolicy.IsDangerousGeneratedRunCommand(candidateCommand))
                    {
                        actionResults.Add($"run_blocked_unsafe:{TrimForOutput(candidateCommand, 120)}");
                    }
                    else
                    {
                        deferredRunCommand = candidateCommand;
                        hasDeferredRunAction = true;
                        actionResults.Add($"run_deferred:{TrimForOutput(candidateCommand, 120)}");
                    }

                    continue;
                }

                var exec = await ExecuteCodingLoopActionAsync(action, workspaceRoot, requestedPaths, provider, cancellationToken);
                actionResults.Add(exec.Message);
                if (exec.Execution != null)
                {
                    lastExecution = exec.Execution;
                }

                if (!string.IsNullOrWhiteSpace(exec.LastWrittenFile))
                {
                    lastWritePath = exec.LastWrittenFile;
                }

                if (!string.IsNullOrWhiteSpace(exec.CodePreview))
                {
                    lastCode = exec.CodePreview;
                    currentLanguage = CodingLanguagePolicy.GuessLanguageFromPath(exec.LastWrittenFile, currentLanguage);
                }

                if (exec.Changed && !string.IsNullOrWhiteSpace(exec.ChangedPath))
                {
                    changedFiles.Add(exec.ChangedPath);
                    iterationChangedPaths.Add(exec.ChangedPath);
                }
            }

            iterations.Add($"iter={i} analysis={TrimForOutput(plan.Analysis ?? string.Empty)} | {string.Join(" ; ", actionResults)}");
            progressCallback?.Invoke(BuildCodingProgressUpdate(
                progressMode,
                provider,
                model,
                "writing",
                $"반복 {i}/{maxIterations}: 파일 생성/수정을 진행했습니다.",
                i,
                maxIterations,
                Math.Clamp((int)Math.Round((double)i / maxIterations * 78d), 28, 82),
                false,
                "writing",
                "파일 생성 및 수정",
                CodingProgressPolicy.BuildWriteDetail(iterationChangedPaths, hasDeferredRunAction),
                4,
                VisibleCodingStageTotal
            ));
            if (plan.Done && (lastExecution.Status == "ok" || lastExecution.Status == "skipped"))
            {
                break;
            }
        }

        if (changedFiles.Count == 0)
        {
            progressCallback?.Invoke(BuildCodingProgressUpdate(
                progressMode,
                provider,
                model,
                "fallback",
                "변경 파일이 없어 복구 생성 경로를 시도합니다.",
                maxIterations,
                maxIterations,
                86,
                false,
                "recovery",
                "마무리 및 복구",
                "플랜 결과가 비어 있어 코드 블록 기반 복구 생성을 시도합니다.",
                5,
                VisibleCodingStageTotal
            ));

            var preferBundleFallback = !attemptedDirectRecovery && ShouldPreferFileBundleFallback(profile, objective, requestedPaths);
            var appliedBundleFallback = false;
            if (preferBundleFallback)
            {
                var bundlePrompt = BuildFallbackFileBundlePrompt(objective, currentLanguage, requestedPaths);
                var bundleGenerated = await GenerateByProviderSafeAsync(
                    provider,
                    model,
                    bundlePrompt,
                    cancellationToken,
                    ResolveDirectGenerationMaxOutputTokens(profile, bundleMode: true),
                    useRawCodexPrompt: true,
                    codexWorkingDirectoryOverride: workspaceRoot,
                    optimizeCodexForCoding: profile.OptimizeCodexCli,
                    timeoutOverrideSeconds: profile.RequestTimeoutSeconds
                );
                totalTokenUsage = TokenUsageEstimator.Combine(totalTokenUsage, bundleGenerated.TokenUsage);
                lastRawResponse = bundleGenerated.Text;
                var fallbackBundle = CodingFallbackPolicy.ExtractFallbackFileBundle(bundleGenerated.Text, currentLanguage, objective);
                if (fallbackBundle.Files.Count > 0)
                {
                    currentLanguage = fallbackBundle.Language;
                    foreach (var file in fallbackBundle.Files)
                    {
                        var normalizedContent = NormalizeProviderGeneratedFileContent(provider, file.Path, file.Content);
                        var writeAction = new CodingLoopAction("write_file", file.Path, normalizedContent, string.Empty);
                        var writeResult = await ExecuteCodingLoopActionAsync(writeAction, workspaceRoot, requestedPaths, provider, cancellationToken);
                        if (!string.IsNullOrWhiteSpace(writeResult.LastWrittenFile))
                        {
                            lastWritePath = writeResult.LastWrittenFile;
                        }

                        if (!string.IsNullOrWhiteSpace(writeResult.CodePreview))
                        {
                            lastCode = writeResult.CodePreview;
                        }

                        if (writeResult.Changed && !string.IsNullOrWhiteSpace(writeResult.ChangedPath))
                        {
                            changedFiles.Add(writeResult.ChangedPath);
                        }
                    }

                    if (!string.IsNullOrWhiteSpace(fallbackBundle.RunCommand))
                    {
                        deferredRunCommand = fallbackBundle.RunCommand;
                        hasDeferredRunAction = true;
                    }

                    iterations.Add($"fallback=bundle:{fallbackBundle.Files.Count}");
                    appliedBundleFallback = true;
                }
            }

            if (!appliedBundleFallback && !attemptedDirectRecovery)
            {
                var fallbackPrompt = BuildFallbackCodeOnlyPrompt(objective, currentLanguage);
                var fallbackGenerated = await GenerateByProviderSafeAsync(
                    provider,
                    model,
                    fallbackPrompt,
                    cancellationToken,
                    ResolveDirectGenerationMaxOutputTokens(profile, bundleMode: false),
                    useRawCodexPrompt: true,
                    codexWorkingDirectoryOverride: workspaceRoot,
                    optimizeCodexForCoding: profile.OptimizeCodexCli,
                    timeoutOverrideSeconds: profile.RequestTimeoutSeconds
                );
                totalTokenUsage = TokenUsageEstimator.Combine(totalTokenUsage, fallbackGenerated.TokenUsage);
                lastRawResponse = fallbackGenerated.Text;
                var fallbackCode = CodingFallbackPolicy.ExtractFallbackCode(fallbackGenerated.Text, currentLanguage, objective);
                if (!string.IsNullOrWhiteSpace(fallbackCode.Code))
                {
                    var fallbackPath = CodingFallbackPolicy.SuggestFallbackEntryPath(fallbackCode.Language, objective, requestedPaths);
                    var normalizedCode = NormalizeProviderGeneratedFileContent(provider, fallbackPath, fallbackCode.Code);
                    var writeAction = new CodingLoopAction("write_file", fallbackPath, normalizedCode, string.Empty);
                    var writeResult = await ExecuteCodingLoopActionAsync(writeAction, workspaceRoot, requestedPaths, provider, cancellationToken);
                    iterations.Add($"fallback=write:{writeResult.LastWrittenFile}");

                    if (!string.IsNullOrWhiteSpace(writeResult.LastWrittenFile))
                    {
                        lastWritePath = writeResult.LastWrittenFile;
                    }

                    if (!string.IsNullOrWhiteSpace(writeResult.CodePreview))
                    {
                        lastCode = writeResult.CodePreview;
                    }

                    currentLanguage = fallbackCode.Language;
                    if (writeResult.Changed && !string.IsNullOrWhiteSpace(writeResult.ChangedPath))
                    {
                        changedFiles.Add(writeResult.ChangedPath);
                    }
                }
                else if (!preferBundleFallback)
                {
                    var bundlePrompt = BuildFallbackFileBundlePrompt(objective, currentLanguage, requestedPaths);
                    var bundleGenerated = await GenerateByProviderSafeAsync(
                        provider,
                        model,
                        bundlePrompt,
                        cancellationToken,
                        ResolveDirectGenerationMaxOutputTokens(profile, bundleMode: true),
                        useRawCodexPrompt: true,
                        codexWorkingDirectoryOverride: workspaceRoot,
                        optimizeCodexForCoding: profile.OptimizeCodexCli,
                        timeoutOverrideSeconds: profile.RequestTimeoutSeconds
                    );
                    totalTokenUsage = TokenUsageEstimator.Combine(totalTokenUsage, bundleGenerated.TokenUsage);
                    lastRawResponse = string.IsNullOrWhiteSpace(bundleGenerated.Text)
                        ? fallbackGenerated.Text
                        : bundleGenerated.Text;
                    var fallbackBundle = CodingFallbackPolicy.ExtractFallbackFileBundle(bundleGenerated.Text, currentLanguage, objective);
                    if (fallbackBundle.Files.Count > 0)
                    {
                        currentLanguage = fallbackBundle.Language;
                        foreach (var file in fallbackBundle.Files)
                        {
                            var normalizedContent = NormalizeProviderGeneratedFileContent(provider, file.Path, file.Content);
                            var writeAction = new CodingLoopAction("write_file", file.Path, normalizedContent, string.Empty);
                            var writeResult = await ExecuteCodingLoopActionAsync(writeAction, workspaceRoot, requestedPaths, provider, cancellationToken);
                            if (!string.IsNullOrWhiteSpace(writeResult.LastWrittenFile))
                            {
                                lastWritePath = writeResult.LastWrittenFile;
                            }

                            if (!string.IsNullOrWhiteSpace(writeResult.CodePreview))
                            {
                                lastCode = writeResult.CodePreview;
                            }

                            if (writeResult.Changed && !string.IsNullOrWhiteSpace(writeResult.ChangedPath))
                            {
                                changedFiles.Add(writeResult.ChangedPath);
                            }
                        }

                        if (!string.IsNullOrWhiteSpace(fallbackBundle.RunCommand))
                        {
                            deferredRunCommand = fallbackBundle.RunCommand;
                            hasDeferredRunAction = true;
                        }

                        iterations.Add($"fallback=bundle:{fallbackBundle.Files.Count}");
                    }
                    else
                    {
                        iterations.Add("fallback=no_code");
                    }
                }
                else
                {
                    iterations.Add("fallback=no_code");
                }
            }
            else if (!appliedBundleFallback && attemptedDirectRecovery)
            {
                iterations.Add("fallback=direct_recovery_already_attempted");
            }
        }

        if (changedFiles.Count == 0
            && profile.EnableGameScaffoldFallback
            && TryGenerateDeterministicWebShooterScaffold(objective, currentLanguage, out var shooterFiles))
        {
            foreach (var scaffold in shooterFiles)
            {
                var writeAction = new CodingLoopAction("write_file", scaffold.Path, scaffold.Content, string.Empty);
                var writeResult = await ExecuteCodingLoopActionAsync(writeAction, workspaceRoot, requestedPaths, provider, cancellationToken);
                if (writeResult.Changed && !string.IsNullOrWhiteSpace(writeResult.ChangedPath))
                {
                    changedFiles.Add(writeResult.ChangedPath);
                    lastWritePath = writeResult.LastWrittenFile;
                    lastCode = writeResult.CodePreview;
                }
            }

            if (changedFiles.Count > 0)
            {
                iterations.Add("fallback=scaffold:web_shooter");
                currentLanguage = "html";
            }
        }

        if (changedFiles.Count == 0 && TryGenerateDeterministicUiCloneScaffold(objective, workspaceRoot, out var scaffoldFiles))
        {
            foreach (var scaffold in scaffoldFiles)
            {
                var writeAction = new CodingLoopAction("write_file", scaffold.Path, scaffold.Content, string.Empty);
                var writeResult = await ExecuteCodingLoopActionAsync(writeAction, workspaceRoot, requestedPaths, provider, cancellationToken);
                if (writeResult.Changed && !string.IsNullOrWhiteSpace(writeResult.ChangedPath))
                {
                    changedFiles.Add(writeResult.ChangedPath);
                    lastWritePath = writeResult.LastWrittenFile;
                    lastCode = writeResult.CodePreview;
                }
            }

            iterations.Add($"fallback=scaffold:{string.Join(",", scaffoldFiles.Select(x => x.Path))}");
            currentLanguage = "html";
        }

        var workspaceRecoveredCount = MergeWorkspaceMaterializedFiles(workspaceRoot, changedFiles);
        if (workspaceRecoveredCount > 0)
        {
            var preferredRecoveredPath = requestedPaths
                .Select(path => ResolveWorkspacePath(workspaceRoot, path))
                .FirstOrDefault(path => !string.IsNullOrWhiteSpace(path) && File.Exists(path))
                ?? changedFiles.FirstOrDefault(path => !string.IsNullOrWhiteSpace(path) && File.Exists(path))
                ?? lastWritePath;
            if (!string.IsNullOrWhiteSpace(preferredRecoveredPath))
            {
                lastWritePath = preferredRecoveredPath;
                currentLanguage = CodingLanguagePolicy.GuessLanguageFromPath(lastWritePath, currentLanguage);
            }

            iterations.Add(changedFiles.Count == workspaceRecoveredCount
                ? $"workspace_scan_recovered={workspaceRecoveredCount}"
                : $"workspace_scan_merged={workspaceRecoveredCount}");
        }

        if (changedFiles.Count > 0)
        {
            currentLanguage = CodingLanguagePolicy.ResolveFinalResultLanguage(currentLanguage, languageHint, objective, changedFiles);
            progressCallback?.Invoke(BuildCodingProgressUpdate(
                progressMode,
                provider,
                model,
                "finalizing",
                "최종 실행 전에 변경 사항을 정리합니다.",
                maxIterations,
                maxIterations,
                92,
                false,
                "recovery",
                "마무리 및 복구",
                $"{changedFiles.Count}개 파일 변경을 기준으로 마지막 검증 명령을 준비합니다.",
                5,
                VisibleCodingStageTotal
            ));
        }

        if (allowRunActions)
        {
            var shouldUseDeferredRunCommand = ShouldTrustDeferredVerificationCommand(currentLanguage, objective, deferredRunCommand);
            var expectedOutputLines = CodingExpectedOutputPolicy.ExtractExpectedConsoleOutputLines(objective);
            var finalDisplayCommand = !shouldUseDeferredRunCommand
                ? BuildVerificationDisplayCommand(currentLanguage, changedFiles, workspaceRoot, objective, requestedPaths, expectedOutput)
                : DescribeCommandWithExpectedOutput(CodingFallbackPolicy.NormalizeGeneratedRunCommand(deferredRunCommand), expectedOutput, expectedOutputLines);
            var finalCommand = !shouldUseDeferredRunCommand
                ? BuildVerificationCommand(currentLanguage, changedFiles, workspaceRoot, objective, requestedPaths, expectedOutput)
                : WrapCommandWithExpectedOutputAssertion(deferredRunCommand, expectedOutput, expectedOutputLines);
            if (!string.IsNullOrWhiteSpace(finalCommand))
            {
                progressCallback?.Invoke(BuildCodingProgressUpdate(
                    progressMode,
                    provider,
                    model,
                    "verifying",
                    "최종 실행 및 검증을 1회 수행합니다.",
                    maxIterations,
                    maxIterations,
                    97,
                    false,
                    "verification",
                    "최종 실행 및 검증",
                    $"실행 명령: {TrimForOutput(finalDisplayCommand, 180)}",
                    6,
                    VisibleCodingStageTotal
                ));
                var shell = await RunWorkspaceCommandWithAutoInstallAsync(finalCommand, workspaceRoot, cancellationToken);
                lastExecution = new CodeExecutionResult(
                    "bash",
                    workspaceRoot,
                    "-",
                    finalDisplayCommand,
                    shell.ExitCode,
                    shell.StdOut,
                    shell.StdErr,
                    shell.TimedOut ? "timeout" : (shell.ExitCode == 0 ? "ok" : "error")
                );
                lastExecution = ApplyCodingQualityGateToExecution(
                    objective,
                    currentLanguage,
                    workspaceRoot,
                    changedFiles,
                    lastExecution
                );
            }
        }

        if (allowRunActions
            && (changedFiles.Count == 0
                || !string.Equals(lastExecution.Status, "ok", StringComparison.OrdinalIgnoreCase)))
        {
            var structuredRepair = await TryApplyDeterministicStructuredMultiFileRepairAsync(
                objective,
                currentLanguage,
                workspaceRoot,
                requestedPaths,
                cancellationToken
            );
            if (structuredRepair.Applied)
            {
                foreach (var path in structuredRepair.ChangedPaths)
                {
                    changedFiles.Add(path);
                }

                lastWritePath = structuredRepair.ChangedPaths.FirstOrDefault() ?? lastWritePath;
                lastCode = structuredRepair.Code;
                currentLanguage = structuredRepair.Language;
                lastExecution = structuredRepair.Execution;
                iterations.Add("deterministic_repair=structured_multi_file");
                progressCallback?.Invoke(BuildCodingProgressUpdate(
                    progressMode,
                    provider,
                    model,
                    "repair",
                    string.Equals(lastExecution.Status, "ok", StringComparison.OrdinalIgnoreCase)
                        ? "다중 파일 실패를 결정론적으로 복구했습니다."
                        : changedFiles.Count == 0
                            ? "생성 파일이 없어 다중 파일 결정론적 복구를 시도했지만 아직 실패 상태입니다."
                            : "다중 파일 결정론적 복구를 시도했지만 아직 실패 상태입니다.",
                    maxIterations,
                    maxIterations,
                    99,
                    false,
                    "verification",
                    "최종 실행 및 검증",
                    TrimForOutput($"실행 명령: {lastExecution.Command}", 220),
                    6,
                    VisibleCodingStageTotal
                ));
            }
        }

        if (allowRunActions
            && !string.Equals(lastExecution.Status, "ok", StringComparison.OrdinalIgnoreCase)
            && !string.Equals(lastExecution.Status, "skipped", StringComparison.OrdinalIgnoreCase))
        {
            var deterministicRepair = await TryApplyDeterministicSingleFileOutputRepairAsync(
                objective,
                currentLanguage,
                workspaceRoot,
                requestedPaths,
                expectedOutput,
                cancellationToken
            );
            if (deterministicRepair.Applied)
            {
                changedFiles.Add(deterministicRepair.ChangedPath);
                lastWritePath = deterministicRepair.ChangedPath;
                lastCode = deterministicRepair.Code;
                currentLanguage = CodingLanguagePolicy.GuessLanguageFromPath(deterministicRepair.ChangedPath, currentLanguage);
                lastExecution = deterministicRepair.Execution;
                iterations.Add("deterministic_repair=single_file_output");
                progressCallback?.Invoke(BuildCodingProgressUpdate(
                    progressMode,
                    provider,
                    model,
                    "repair",
                    string.Equals(lastExecution.Status, "ok", StringComparison.OrdinalIgnoreCase)
                        ? "단순 출력 파일 실패를 결정론적으로 복구했습니다."
                        : "단순 출력 파일 결정론적 복구를 시도했지만 아직 실패 상태입니다.",
                    maxIterations,
                    maxIterations,
                    99,
                    false,
                    "verification",
                    "최종 실행 및 검증",
                    TrimForOutput($"실행 명령: {lastExecution.Command}", 220),
                    6,
                    VisibleCodingStageTotal
                ));
            }
        }

        var orderedChangedFiles = changedFiles
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(x => x, StringComparer.OrdinalIgnoreCase)
            .ToArray();
        orderedChangedFiles = CleanupRedundantSingleFileArtifacts(workspaceRoot, objective, requestedPaths, orderedChangedFiles);
        var summary = BuildAutonomousCodingSummary(iterations, orderedChangedFiles, lastExecution, maxIterations);

        if (allowRunActions
            && repairAttempt < ResolveMaxCodingRepairPasses(objective, currentLanguage)
            && orderedChangedFiles.Length > 0
            && !string.Equals(lastExecution.Status, "ok", StringComparison.OrdinalIgnoreCase)
            && !string.Equals(lastExecution.Status, "skipped", StringComparison.OrdinalIgnoreCase))
        {
            progressCallback?.Invoke(BuildCodingProgressUpdate(
                progressMode,
                provider,
                model,
                "repair",
                "최종 검증 실패로 수정 반복을 한 번 더 수행합니다.",
                maxIterations,
                maxIterations,
                98,
                false,
                "verification",
                "최종 실행 및 검증",
                TrimForOutput($"실패 원인: {lastExecution.StdErr}", 220),
                6,
                VisibleCodingStageTotal
            ));

            var repairObjective = BuildCodingRepairObjectivePrompt(objective, currentLanguage, workspaceRoot, lastExecution, orderedChangedFiles);
            var repairOutcome = await RunAutonomousCodingLoopAsync(
                provider,
                model,
                repairObjective,
                currentLanguage,
                modeLabel,
                cancellationToken,
                progressCallback,
                progressModeOverride,
                allowRunActions,
                workspaceRoot,
                repairAttempt + 1
            );
            var mergedChangedFiles = orderedChangedFiles
                .Concat(repairOutcome.ChangedFiles ?? Array.Empty<string>())
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .OrderBy(x => x, StringComparer.OrdinalIgnoreCase)
                .ToArray();
            mergedChangedFiles = CleanupRedundantSingleFileArtifacts(workspaceRoot, objective, requestedPaths, mergedChangedFiles);
            var mergedRawResponse = string.IsNullOrWhiteSpace(lastRawResponse)
                ? repairOutcome.RawResponse
                : string.IsNullOrWhiteSpace(repairOutcome.RawResponse)
                    ? lastRawResponse
                    : $"{lastRawResponse}\n\n[repair-pass]\n{repairOutcome.RawResponse}";
            var mergedSummary = string.IsNullOrWhiteSpace(repairOutcome.Summary)
                ? summary
                : string.Equals(repairOutcome.Execution.Status, "ok", StringComparison.OrdinalIgnoreCase)
                    ? $"{repairOutcome.Summary}\n\n[repair-note]\n초기 최종 검증 실패를 1회 복구한 뒤 성공했습니다."
                    : $"{summary}\n\n[repair-pass]\n{repairOutcome.Summary}";
            return new AutonomousCodingOutcome(
                string.IsNullOrWhiteSpace(repairOutcome.Language) ? currentLanguage : repairOutcome.Language,
                string.IsNullOrWhiteSpace(repairOutcome.Code) ? lastCode : repairOutcome.Code,
                mergedRawResponse,
                repairOutcome.Execution,
                mergedChangedFiles,
                mergedSummary,
                TokenUsageEstimator.Combine(totalTokenUsage, repairOutcome.TokenUsage)
            );
        }

        if (File.Exists(lastWritePath))
        {
            try
            {
                lastCode = await File.ReadAllTextAsync(lastWritePath, cancellationToken);
            }
            catch
            {
            }
        }
        progressCallback?.Invoke(BuildCodingProgressUpdate(
            progressMode,
            provider,
            model,
            "done",
            "코딩 작업이 완료되었습니다.",
            maxIterations,
            maxIterations,
            100,
            true,
            "verification",
            "최종 실행 및 검증",
            $"최종 상태: {lastExecution.Status} (exit={lastExecution.ExitCode})",
            6,
            VisibleCodingStageTotal
        ));
        return new AutonomousCodingOutcome(currentLanguage, lastCode, lastRawResponse, lastExecution, orderedChangedFiles, summary, totalTokenUsage);
    }

    private static bool ShouldTrustDeferredVerificationCommand(string language, string objective, string command)
    {
        return CodingExecutionSafetyPolicy.ShouldTrustDeferredVerificationCommand(language, objective, command, IsFrontendLikeCodingTask);
    }

    private static bool IsInteractiveProgramObjective(string objective, string normalizedLanguage)
    {
        return CodingExecutionSafetyPolicy.IsInteractiveProgramObjective(objective, normalizedLanguage, IsFrontendLikeCodingTask);
    }

    private async Task<CodingLoopActionResult> ExecuteCodingLoopActionAsync(
        CodingLoopAction action,
        string workspaceRoot,
        IReadOnlyList<string> requestedPaths,
        string provider,
        CancellationToken cancellationToken
    )
    {
        return await CodingLoopActionExecutor.ExecuteAsync(
            action,
            workspaceRoot,
            requestedPaths,
            provider,
            ResolveActionPathOrFallback,
            ResolveWorkspacePath,
            NormalizeProviderGeneratedFileContent,
            async (command, root, token) =>
            {
                var shell = await RunWorkspaceCommandWithAutoInstallAsync(command, root, token);
                return new CodingLoopShellResult(shell.ExitCode, shell.StdOut, shell.StdErr, shell.TimedOut);
            },
            cancellationToken
        );
    }

    private static string BuildFallbackCodeOnlyPrompt(string objective, string languageHint)
    {
        var resolvedLanguage = CodingLanguagePolicy.ResolveInitialCodingLanguage(languageHint, objective);
        var projectProfile = ResolveCodingProjectProfile(objective, languageHint);
        return CodingFallbackPolicy.BuildCodeOnlyPrompt(
            objective,
            resolvedLanguage,
            projectProfile.ProjectKind,
            BuildLanguagePromptRuleLines(string.Empty, string.Empty, resolvedLanguage, objective)
        );
    }

    private static string BuildFallbackFileBundlePrompt(
        string objective,
        string languageHint,
        IReadOnlyList<string>? requestedPaths = null
    )
    {
        var resolvedLanguage = CodingLanguagePolicy.ResolveInitialCodingLanguage(languageHint, objective);
        var projectProfile = ResolveCodingProjectProfile(objective, languageHint, requestedPaths);
        return CodingFallbackPolicy.BuildFileBundlePrompt(
            objective,
            resolvedLanguage,
            new CodingFallbackProjectProfile(
                projectProfile.ProjectKind,
                projectProfile.EntryFiles,
                projectProfile.BuildTool,
                projectProfile.TestTool,
                projectProfile.RunCommands
            ),
            BuildLanguagePromptRuleLines(string.Empty, string.Empty, resolvedLanguage, objective, requestedPaths),
            requestedPaths
        );
    }

    private static string BuildCodingRepairObjectivePrompt(
        string objective,
        string languageHint,
        string workspaceRoot,
        CodeExecutionResult lastExecution,
        IReadOnlyCollection<string> changedFiles
    )
    {
        return CodingFallbackPolicy.BuildRepairObjectivePrompt(new CodingRepairObjectivePromptRequest(
            objective,
            languageHint,
            workspaceRoot,
            lastExecution,
            changedFiles,
            BuildLanguagePromptRuleLines(string.Empty, string.Empty, languageHint, objective ?? string.Empty),
            CodingLanguagePolicy.NormalizeLanguageForCode(languageHint) == "python" && IsInteractiveProgramObjective(objective ?? string.Empty, "python")
        ));
    }

    private static string[] CleanupRedundantSingleFileArtifacts(
        string workspaceRoot,
        string objective,
        IReadOnlyList<string> requestedPaths,
        IReadOnlyList<string> changedFiles
    )
    {
        return CodingArtifactCleanupPolicy.CleanupRedundantSingleFileArtifacts(
            workspaceRoot,
            objective,
            requestedPaths,
            changedFiles,
            ResolveWorkspacePath
        );
    }

    private static bool ShouldPreferFileBundleFallback(string objective, IReadOnlyList<string>? requestedPaths)
    {
        var projectProfile = ResolveCodingProjectProfile(objective, "auto", requestedPaths);
        return CodingFallbackDecisionPolicy.ShouldPreferFileBundleFallback(
            objective,
            requestedPaths,
            IsExplicitSingleFileSimpleTask(objective, "auto", requestedPaths),
            projectProfile.PrefersMultiFile,
            includeExplicitMultiFileTextSignals: true
        );
    }

    private async Task<(bool Applied, string ChangedPath, string Code, CodeExecutionResult Execution)> TryApplyDeterministicSingleFileOutputRepairAsync(
        string objective,
        string languageHint,
        string workspaceRoot,
        IReadOnlyList<string> requestedPaths,
        string expectedOutput,
        CancellationToken cancellationToken
    )
    {
        if (!CodingDeterministicOutputRepairPolicy.ShouldTrySingleFileOutputRepair(languageHint, requestedPaths, expectedOutput))
        {
            return (false, string.Empty, string.Empty, new CodeExecutionResult("bash", workspaceRoot, "-", "(skipped)", 0, string.Empty, string.Empty, "skipped"));
        }

        var requestedPath = requestedPaths[0];
        string fullPath;
        try
        {
            fullPath = ResolveWorkspacePath(workspaceRoot, requestedPath);
        }
        catch
        {
            return (false, string.Empty, string.Empty, new CodeExecutionResult("bash", workspaceRoot, "-", "(blocked unsafe path)", 1, string.Empty, "workspace 밖 경로는 코딩탭 자동 작업에서 사용할 수 없습니다.", "error"));
        }
        var directory = Path.GetDirectoryName(fullPath);
        if (!string.IsNullOrWhiteSpace(directory))
        {
            Directory.CreateDirectory(directory);
        }

        var code = CodingDeterministicOutputRepairPolicy.BuildPythonPrintCode(expectedOutput);
        await File.WriteAllTextAsync(fullPath, code, cancellationToken);

        var baseCommand = $"python3 {EscapeShellArg(requestedPath)}";
        var shell = await RunWorkspaceCommandWithAutoInstallAsync(
            WrapCommandWithVerificationAssertions(baseCommand, expectedOutput, new[] { fullPath }),
            workspaceRoot,
            cancellationToken
        );
        var execution = new CodeExecutionResult(
            "bash",
            workspaceRoot,
            "-",
            DescribeVerificationCommand(baseCommand, expectedOutput, new[] { fullPath }),
            shell.ExitCode,
            shell.StdOut,
            shell.StdErr,
            shell.TimedOut ? "timeout" : (shell.ExitCode == 0 ? "ok" : "error")
        );
        return (true, fullPath, code, execution);
    }

    private static bool TryGenerateDeterministicUiCloneScaffold(
        string objective,
        string workspaceRoot,
        out IReadOnlyList<ScaffoldFileSpec> files
    )
    {
        _ = workspaceRoot;
        return CodingDeterministicScaffoldPolicy.TryGenerateUiCloneScaffold(objective, out files);
    }

    private static bool TryGenerateDeterministicWebShooterScaffold(
        string objective,
        string languageHint,
        out IReadOnlyList<ScaffoldFileSpec> files
    )
    {
        return CodingDeterministicScaffoldPolicy.TryGenerateWebShooterScaffold(objective, languageHint, out files);
    }

    private const int VisibleCodingStageTotal = 6;
    private const int MaxCodingRepairPasses = 1;

    private static int ResolveMaxCodingRepairPasses(string objective, string languageHint)
    {
        return CodingLoopTuningPolicy.ResolveMaxRepairPasses(
            objective,
            languageHint,
            IsGameLikeCodingTask,
            IsFrontendLikeCodingTask,
            LooksLikeBrowserAppObjective,
            MaxCodingRepairPasses
        );
    }

    private static CodingProgressUpdate BuildCodingProgressUpdate(
        string progressMode,
        string provider,
        string model,
        string phase,
        string message,
        int iteration,
        int maxIterations,
        int percent,
        bool done,
        string stageKey = "",
        string stageTitle = "",
        string stageDetail = "",
        int stageIndex = 0,
        int stageTotal = 0
    )
    {
        return CodingProgressPolicy.BuildUpdate(
            progressMode,
            provider,
            model,
            phase,
            message,
            iteration,
            maxIterations,
            percent,
            done,
            stageKey,
            stageTitle,
            stageDetail,
            stageIndex,
            stageTotal
        );
    }

    private string BuildCodingLoopPrompt(
        string objective,
        string languageHint,
        string modeLabel,
        string workspaceRoot,
        string provider,
        string model,
        bool oneShotMode,
        int iteration,
        int maxIterations,
        int maxActions,
        string workspaceSnapshot,
        string recentLogs,
        CodeExecutionResult lastExecution
    )
    {
        var resolvedLanguage = CodingLanguagePolicy.ResolveInitialCodingLanguage(languageHint, objective);
        return CodingPromptPolicy.BuildLoopPrompt(new CodingLoopPromptPolicyRequest(
            objective,
            resolvedLanguage,
            modeLabel,
            workspaceRoot,
            provider,
            model,
            oneShotMode,
            iteration,
            maxIterations,
            maxActions,
            workspaceSnapshot,
            recentLogs,
            lastExecution,
            BuildCodingQualityBrief(objective, resolvedLanguage),
            BuildProviderModelPromptRuleLines(provider, model),
            BuildLanguagePromptRuleLines(provider, model, resolvedLanguage, objective),
            BuildCodingVerificationRuleLines()
        ));
    }

    private static string BuildCodingAgentObjectivePrompt(string input, string languageHint, string modeLabel)
    {
        var resolvedLanguage = CodingLanguagePolicy.ResolveInitialCodingLanguage(languageHint, input);
        return CodingPromptPolicy.BuildAgentObjectivePrompt(
            input,
            modeLabel,
            resolvedLanguage,
            BuildLanguagePromptRuleLines(string.Empty, string.Empty, resolvedLanguage, input)
        );
    }

    private static string BuildDraftCodingWorkerPrompt(string objective, string languageHint)
    {
        var resolvedLanguage = CodingLanguagePolicy.ResolveInitialCodingLanguage(languageHint, objective);
        return CodingPromptPolicy.BuildDraftWorkerPrompt(
            objective,
            resolvedLanguage,
            BuildLanguagePromptRuleLines(string.Empty, string.Empty, resolvedLanguage, objective ?? string.Empty)
        );
    }

    private static string? GetStringProperty(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var value))
        {
            return null;
        }

        return value.ValueKind == JsonValueKind.String ? value.GetString() : value.ToString();
    }

    private static string BuildOrchestrationCodingAggregatePrompt(
        string input,
        IReadOnlyList<CodingWorkerResult> workers,
        string languageHint
    )
    {
        return CodingPromptPolicy.BuildOrchestrationAggregatePrompt(input, workers, languageHint);
    }

    private static string BuildMultiCodingAggregatePrompt(
        string input,
        IReadOnlyList<CodingWorkerResult> workers,
        string languageHint
    )
    {
        return CodingPromptPolicy.BuildMultiAggregatePrompt(input, workers, languageHint);
    }

    private static string BuildMultiCodingSummaryPrompt(string originalInput, IReadOnlyList<CodingWorkerResult> workers)
    {
        var digests = workers
            .Select(worker => new CodingWorkerSummaryDigest(worker.Provider, worker.Model, BuildCodingWorkerDigest(worker)))
            .ToArray();
        return CodingPromptPolicy.BuildMultiSummaryPrompt(originalInput, digests);
    }

}
