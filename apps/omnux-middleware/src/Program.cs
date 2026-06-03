namespace Omnux.Middleware;

internal static class Program
{
    public static async Task Main(string[] args)
    {
        var config = AppConfig.LoadFromEnvironment();
        var paths = config.Paths;
        var providers = config.Providers;
        var gateway = config.Gateway;
        var context = config.Context;
        var pathResolver = DefaultStatePathResolver.CreateDefault();
        var runtimeSettings = new RuntimeSettings(config);
        ICoreRuntimeClient coreClient = new DotNetCoreRuntimeClient();
        var copilotWrapper = new CopilotCliWrapper(
            providers.CopilotCliBinary,
            providers.CopilotDirectBinary,
            providers.CopilotModel,
            paths.CopilotUsageStatePath,
            Math.Max(context.LlmTimeoutSec, 120)
        );
        var codexWrapper = new CodexCliWrapper(
            providers.CodexBinary,
            runtimeSettings,
            paths.WorkspaceRootDir,
            providers.CodexModel,
            Math.Max(context.LlmTimeoutSec, 120)
        );
        var searchServices = ConfigureSearchServices(providers, context, runtimeSettings);
        var sandboxClient = new PythonSandboxClient(providers.PythonBinary, paths.SandboxExecutorPath);
        var doctorService = ConfigureDoctorService(
            config,
            pathResolver,
            runtimeSettings,
            coreClient,
            copilotWrapper,
            codexWrapper,
            searchServices,
            sandboxClient
        );

        using var cts = new CancellationTokenSource();
        Console.CancelKeyPress += (_, eventArgs) =>
        {
            eventArgs.Cancel = true;
            cts.Cancel();
        };

        Console.WriteLine("[core-runtime] .NET core runtime is active.");

        if (await DoctorCli.TryHandleAsync(args, doctorService, cts.Token))
        {
            return;
        }

        using var telegramClient = new TelegramClient(runtimeSettings);
        using var groqModelCatalog = new GroqModelCatalog(providers, context, runtimeSettings);
        using var cerebrasModelCatalog = new CerebrasModelCatalog(providers, runtimeSettings);
        using var llmRouter = new LlmRouter(providers, paths, context, runtimeSettings, cerebrasModelCatalog);
        var persistence = ConfigurePersistence(config, pathResolver);
        var codeRunner = new UniversalCodeRunner(paths.CodeRunsRootDir, config.CodeExecutionTimeoutSec, providers.PythonBinary);
        var providerRegistry = new ProviderRegistry(llmRouter, copilotWrapper, codexWrapper);
        var routingPolicyStore = new FileRoutingPolicyStore(pathResolver);
        var routingPolicyResolver = new RoutingPolicyResolver(routingPolicyStore);
        var projectContextServices = ConfigureProjectContextServices(pathResolver, config);
        var workflowServices = ConfigureWorkflowServices(
            config,
            pathResolver,
            persistence,
            llmRouter,
            routingPolicyResolver,
            projectContextServices.Loader
        );
        var refactorServices = ConfigureRefactorServices(config, pathResolver);
        var toolServices = ConfigureToolServices(config, runtimeSettings, persistence.ConversationStore, refactorServices.DiffPreview);
        var auditLogger = new AuditLogger(config.AuditLogPath);
        var appServices = ConfigureApplicationServices(
            config,
            pathResolver,
            runtimeSettings,
            routingPolicyResolver,
            auditLogger,
            llmRouter,
            copilotWrapper,
            codexWrapper,
            telegramClient,
            coreClient,
            doctorService,
            workflowServices.Notebook,
            refactorServices.AnchorRead,
            refactorServices.AnchorEdit,
            refactorServices.DiffPreview,
            refactorServices.LspRefactor,
            refactorServices.AstGrepRefactor,
            projectContextServices.Loader,
            workflowServices.TaskGraph,
            workflowServices.Plan,
            workflowServices.PlanReview,
            workflowServices.TaskGraphCoordinator,
            persistence.ConversationStoreService,
            persistence.MemoryNoteStoreService,
            toolServices.MemorySearch,
            toolServices.MemoryGet,
            toolServices.SessionList,
            toolServices.SessionHistory,
            toolServices.SessionSend,
            toolServices.SessionSpawn,
            toolServices.WebFetch,
            toolServices.Browser,
            toolServices.Canvas,
            toolServices.Nodes
        );
        var llmPreferenceContext = new LlmPreferenceContext(config, copilotWrapper.GetSelectedModel());
        var telegramLlmMutationApplicationService = new TelegramLlmMutationApplicationService(
            config.Providers,
            llmPreferenceContext,
            llmRouter.GetSelectedGroqModel,
            llmRouter.TrySetSelectedGroqModel,
            copilotWrapper.TrySetSelectedModel
        );
        var llmSettingsApplicationService = new LlmSettingsApplicationService(
            config.Providers,
            llmPreferenceContext,
            telegramLlmMutationApplicationService,
            llmRouter.GetSelectedGroqModel
        );
        var llmControlApplicationService = new LlmControlApplicationService(
            groqModelCatalog,
            copilotWrapper,
            llmRouter,
            llmSettingsApplicationService,
            llmPreferenceContext,
            providers
        );
        var slashCommandHandlers = new List<ISlashCommandHandler>
        {
            new StaticSlashCommandHandler(),
            new DoctorSlashCommandHandler(appServices.Doctor),
            new NotebookSlashCommandHandler(appServices.Notebook),
            new HandoffSlashCommandHandler(appServices.Notebook),
            new PlanSlashCommandHandler(appServices.Plan),
            new TaskSlashCommandHandler(appServices.TaskGraph),
            new MemorySlashCommandHandler(appServices.Memory, appServices.Conversation),
            new ChannelSettingsSlashCommandHandler(llmSettingsApplicationService),
            new LlmControlSlashCommandHandler(llmControlApplicationService),
        };
        var slashCommandRouter = new SlashCommandRouter(slashCommandHandlers);
        var telegramCodingSettingsApplicationService = new TelegramCodingSettingsApplicationService(llmPreferenceContext);
        var executionContext = new ExecutionContext();
        var routineRegistry = new RoutineRegistry(persistence.RoutineStore);
        var commandService = new CommandService(
            config,
            llmRouter,
            groqModelCatalog,
            coreClient,
            telegramClient,
            runtimeSettings,
            providerRegistry,
            routingPolicyResolver,
            toolServices.Registry,
            searchServices.Gateway,
            searchServices.Guard,
            searchServices.AnswerComposer,
            toolServices.WebFetch,
            toolServices.MemorySearch,
            toolServices.MemoryGet,
            toolServices.SessionList,
            toolServices.SessionHistory,
            toolServices.SessionSend,
            toolServices.SessionSpawn,
            toolServices.Browser,
            toolServices.Canvas,
            toolServices.Nodes,
            copilotWrapper,
            codexWrapper,
            sandboxClient,
            persistence.MemoryNoteStoreService,
            persistence.ConversationStoreService,
            persistence.RunArtifactStore,
            codeRunner,
            auditLogger,
            doctorService,
            workflowServices.Plan,
            workflowServices.PlanReview,
            workflowServices.TaskGraph,
            workflowServices.TaskGraphCoordinator,
            projectContextServices.Loader,
            workflowServices.Notebook,
            refactorServices.AnchorRead,
            refactorServices.AnchorEdit,
            refactorServices.DiffPreview,
            refactorServices.LspRefactor,
            refactorServices.AstGrepRefactor,
            appServices.Settings,
            appServices.Refactor,
            appServices.Context,
            appServices.Cleanup,
            appServices.Conversation,
            appServices.Tool,
            appServices.TelemetryTracer,
            llmSettingsApplicationService,
            llmControlApplicationService,
            slashCommandRouter,
            telegramLlmMutationApplicationService,
            telegramCodingSettingsApplicationService,
            llmPreferenceContext,
            executionContext,
            routineRegistry
        );
        slashCommandHandlers.Add(new CoreRuntimeSlashCommandHandler(
            coreClient,
            auditLogger,
            config.Security.KillAllowlistCsv,
            commandService.RecordRoutedEvent
        ));
        appServices.Memory.ConfigureCreateMemoryNoteDelegate(commandService.CreateMemoryNoteAsync);
        appServices.Conversation.ConfigureClearActiveSkillDelegate(commandService.ClearActiveSkillForConversation);
        appServices.Tool.ConfigureCronAndSearchDelegates(new ToolApplicationService.CronSearchDelegates(
            commandService.GetCronStatus,
            commandService.ListCronJobs,
            commandService.ListCronRuns,
            commandService.AddCronJob,
            commandService.UpdateCronJob,
            commandService.RunCronJobAsync,
            commandService.WakeCron,
            commandService.RemoveCronJob,
            commandService.SearchWebAsync
        ));
        var commandExecutionService = new CommandExecutionService(commandService, executionContext);
        var routineLlmGateway = commandService.CreateRoutineLlmGateway();
        var routineSearchGateway = commandService.CreateRoutineSearchGateway();
        var routineLogicGraphRunner = commandService.CreateRoutineLogicGraphRunner();
        var routineApplicationService = new RoutineApplicationService(
            config.Providers,
            config.Paths,
            config.Context,
            config.Security,
            llmRouter,
            groqModelCatalog,
            persistence.ConversationStoreService,
            persistence.RunArtifactStore,
            codeRunner,
            telegramClient,
            toolServices.SessionSpawn,
            routineRegistry,
            routineLlmGateway,
            routineSearchGateway,
            routineLogicGraphRunner
        );
        slashCommandHandlers.Add(new RoutineSlashCommandHandler(routineApplicationService));
        commandService.ConfigureRoutineApplicationService(routineApplicationService);
        var codingCommandGateway = commandService.CreateCodingCommandGateway();
        var codingApplicationService = new CodingApplicationService(
            config.Providers,
            config.Paths,
            config.Security,
            config.Context,
            config.Execution,
            persistence.ConversationStoreService,
            persistence.RunArtifactStore,
            codeRunner,
            auditLogger,
            codingCommandGateway
        );
        commandService.ConfigureCodingApplicationService(codingApplicationService);
        slashCommandHandlers.Add(new CodingSlashCommandHandler(codingApplicationService));
        var logicGraphRuntimeCoordinator = new LogicGraphRuntimeCoordinator(pathResolver);
        commandService.ConfigureLogicGraphRuntime(pathResolver, logicGraphRuntimeCoordinator);
        var runtimeServices = ConfigureRuntimeServices(
            config,
            pathResolver,
            llmRouter,
            groqModelCatalog,
            cerebrasModelCatalog,
            telegramClient,
            persistence.AuthSessionStore,
            commandExecutionService,
            runtimeSettings,
            appServices,
            routineApplicationService,
            codingApplicationService,
            commandService,
            workflowServices.TaskGraphCoordinator,
            auditLogger
        );

        Console.WriteLine($"[middleware] starting (ws={gateway.WebSocketPort}, core=dotnet)");

        var memoryIndexTask = Task.CompletedTask;
        try
        {
            var webTask = runtimeServices.WebSocketGateway.RunAsync(cts.Token);
            memoryIndexTask = StartMemoryIndexBootstrap(paths, cts.Token);
            if (gateway.EnableGatewayStartupProbe)
            {
                var startupProbe = new GatewayStartupProbe(gateway, paths, gateway.WebSocketPort);
                _ = startupProbe.RunAsync(cts.Token);
            }

            var agentSpawnQueueTask = RunAgentSpawnQueueLoopAsync(toolServices.SessionSpawn, cts.Token);
            var agentWatchdogTask = RunAgentWatchdogLoopAsync(toolServices.SessionSpawn, cts.Token);
            var telegramTask = runtimeServices.TelegramUpdateLoop.RunAsync(cts.Token);
            var firstCompleted = await Task.WhenAny(webTask, telegramTask, agentSpawnQueueTask, agentWatchdogTask);

            if (firstCompleted.IsFaulted)
            {
                cts.Cancel();
                await Task.WhenAll(webTask, telegramTask, agentSpawnQueueTask, agentWatchdogTask);
            }

            await Task.WhenAll(webTask, telegramTask, agentSpawnQueueTask, agentWatchdogTask);
        }
        finally
        {
            cts.Cancel();
            await WaitForShutdownTaskAsync(memoryIndexTask, "memory-index", TimeSpan.FromSeconds(10));
            await workflowServices.TaskGraphCoordinator.StopAsync();
            await logicGraphRuntimeCoordinator.StopAsync();
            toolServices.Browser.Dispose();
        }
    }

    private static PersistenceServices ConfigurePersistence(
        AppConfig config,
        IStatePathResolver pathResolver
    )
    {
        var paths = config.Paths;
        var sessionManager = new SessionManager(paths.AuthSessionStatePath);
        var memoryNoteStore = new MemoryNoteStore(paths.MemoryNotesRootDir);
        var conversationStore = new ConversationStore(paths.ConversationStatePath);
        return new PersistenceServices(
            sessionManager,
            memoryNoteStore,
            conversationStore,
            memoryNoteStore,
            conversationStore,
            sessionManager,
            new FileRoutineStore(paths.RoutineStatePath),
            new FilePlanStore(pathResolver),
            new FileTaskGraphStore(pathResolver),
            new FileRunArtifactStore(paths.RoutineRunsRootDir),
            new FileNotebookStore(pathResolver)
        );
    }

    private static bool IsMemoryIndexBootstrapEnabled()
    {
        var value = Env.Get("OMNUX_SKIP_MEMORY_INDEX_BOOTSTRAP");
        return string.IsNullOrWhiteSpace(value)
               || !(value.Equals("1", StringComparison.OrdinalIgnoreCase)
                    || value.Equals("true", StringComparison.OrdinalIgnoreCase)
                    || value.Equals("yes", StringComparison.OrdinalIgnoreCase));
    }

    private static Task StartMemoryIndexBootstrap(PathOptions paths, CancellationToken cancellationToken)
    {
        if (!IsMemoryIndexBootstrapEnabled())
        {
            Console.WriteLine("[memory-index] bootstrap skipped by OMNUX_SKIP_MEMORY_INDEX_BOOTSTRAP");
            return Task.CompletedTask;
        }

        return Task.Run(
            () =>
            {
                if (!cancellationToken.IsCancellationRequested)
                {
                    BootstrapMemoryIndex(paths);
                }
            },
            CancellationToken.None
        );
    }

    private static async Task WaitForShutdownTaskAsync(Task task, string name, TimeSpan timeout)
    {
        if (task.IsCompleted)
        {
            await ObserveShutdownTaskAsync(task, name);
            return;
        }

        var completed = await Task.WhenAny(task, Task.Delay(timeout));
        if (completed != task)
        {
            Console.Error.WriteLine($"[{name}] shutdown continued before task completed.");
            return;
        }

        await ObserveShutdownTaskAsync(task, name);
    }

    private static async Task ObserveShutdownTaskAsync(Task task, string name)
    {
        try
        {
            await task;
        }
        catch (OperationCanceledException)
        {
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[{name}] shutdown observed task error: {ex.Message}");
        }
    }

    private static SearchServices ConfigureSearchServices(
        ProviderOptions providers,
        ContextOptions context,
        RuntimeSettings runtimeSettings
    )
    {
        var geminiGroundedRetriever = new GeminiGroundedRetriever(providers, context, runtimeSettings);
        var searchEvidencePackBuilder = new DefaultSearchEvidencePackBuilder();
        var searchGuard = new DefaultSearchGuard();
        var searchGateway = new LegacyGeminiGroundingSearchGateway(geminiGroundedRetriever, searchEvidencePackBuilder);
        var searchAnswerComposer = new EvidenceFallbackSearchAnswerComposer(searchGateway, searchGuard);
        return new SearchServices(searchGateway, searchGuard, searchAnswerComposer);
    }

    private static DoctorService ConfigureDoctorService(
        AppConfig config,
        IStatePathResolver pathResolver,
        RuntimeSettings runtimeSettings,
        ICoreRuntimeClient coreClient,
        CopilotCliWrapper copilotWrapper,
        CodexCliWrapper codexWrapper,
        SearchServices searchServices,
        PythonSandboxClient sandboxClient
    )
    {
        return new DoctorService(
            new IDoctorCheck[]
            {
                new CoreSocketDoctorCheck(config.Paths, coreClient),
                new WorkspaceDoctorCheck(config.Paths, pathResolver),
                new SandboxDoctorCheck(config.Providers, config.Paths, config.Doctor, sandboxClient),
                new SqliteDoctorCheck(),
                new ProviderSecretsDoctorCheck(runtimeSettings),
                new CodexDoctorCheck(codexWrapper),
                new CopilotDoctorCheck(copilotWrapper),
                new TelegramDoctorCheck(config.Security, runtimeSettings),
                new SearchPipelineDoctorCheck(
                    config.Providers,
                    config.Context,
                    runtimeSettings,
                    searchServices.Gateway,
                    searchServices.Guard,
                    searchServices.AnswerComposer
                )
            },
            new FileDoctorReportStore(pathResolver),
            config.Doctor
        );
    }

    private static ProjectContextServices ConfigureProjectContextServices(
        IStatePathResolver pathResolver,
        AppConfig config
    )
    {
        var instructionLoader = new AgentInstructionLoader(pathResolver, config);
        var skillManifestLoader = new SkillManifestLoader(pathResolver);
        var commandTemplateLoader = new CommandTemplateLoader(pathResolver);
        var projectContextLoader = new ProjectContextLoader(
            instructionLoader,
            skillManifestLoader,
            commandTemplateLoader
        );
        return new ProjectContextServices(
            instructionLoader,
            skillManifestLoader,
            commandTemplateLoader,
            projectContextLoader
        );
    }

    private static WorkflowServices ConfigureWorkflowServices(
        AppConfig config,
        IStatePathResolver pathResolver,
        PersistenceServices persistence,
        LlmRouter llmRouter,
        RoutingPolicyResolver routingPolicyResolver,
        ProjectContextLoader projectContextLoader
    )
    {
        var planService = new PlanService(
            persistence.PlanStore,
            llmRouter,
            routingPolicyResolver,
            config.Paths,
            persistence.ConversationStoreService,
            persistence.MemoryNoteStoreService,
            projectContextLoader
        );
        var planReviewService = new PlanReviewService(llmRouter, routingPolicyResolver, projectContextLoader);
        var taskGraphService = new TaskGraphService(persistence.TaskGraphStore, planService);
        var taskGraphCoordinator = new BackgroundTaskCoordinator(taskGraphService, pathResolver);
        var notebookService = new NotebookService(persistence.NotebookStore, projectContextLoader);
        return new WorkflowServices(
            planService,
            planReviewService,
            taskGraphService,
            taskGraphCoordinator,
            notebookService
        );
    }

    private static void BootstrapMemoryIndex(PathOptions paths)
    {
        var memoryIndexSchemaBootstrap = new MemoryIndexSchemaBootstrap(paths);
        try
        {
            var memoryIndexSnapshot = memoryIndexSchemaBootstrap.EnsureInitialized();
            var memoryIndexDocumentSync = new MemoryIndexDocumentSync(paths, memoryIndexSnapshot);
            var syncSnapshot = memoryIndexDocumentSync.SyncOnce();
            if (memoryIndexSnapshot.FtsAvailable)
            {
                Console.WriteLine($"[memory-index] ready db={memoryIndexSnapshot.DbPath} fts=available");
            }
            else
            {
                Console.WriteLine(
                    $"[memory-index] ready db={memoryIndexSnapshot.DbPath} fts=unavailable error={memoryIndexSnapshot.FtsError}"
                );
            }

            Console.WriteLine(
                "[memory-index] sync "
                + $"scanned={syncSnapshot.ScannedDocuments} "
                + $"indexed={syncSnapshot.IndexedDocuments} "
                + $"skipped={syncSnapshot.SkippedDocuments} "
                + $"removed={syncSnapshot.RemovedDocuments} "
                + $"memory={syncSnapshot.MemoryDocuments} "
                + $"sessions={syncSnapshot.SessionDocuments} "
                + $"project={syncSnapshot.ProjectDocuments} "
                + $"elapsedMs={syncSnapshot.ElapsedMs} "
                + $"fts={(syncSnapshot.FtsAvailable ? "available" : "unavailable")}"
            );
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[memory-index] bootstrap or sync failed: {ex.Message}");
        }
    }

    private static RefactorServices ConfigureRefactorServices(AppConfig config, IStatePathResolver pathResolver)
    {
        var paths = config.Paths;
        var refactor = config.Refactor;
        var workspaceContainerRoot = Directory.GetParent(paths.WorkspaceRootDir)?.FullName ?? paths.WorkspaceRootDir;
        var refactorPreviewRoot = Path.Combine(workspaceContainerRoot, ".runtime", "refactor-preview");
        var refactorPreviewStore = new FileRefactorPreviewStore(
            pathResolver,
            refactor.RefactorPreviewTtlMinutes,
            refactorPreviewRoot
        );
        var refactorToolAvailability = new RefactorToolAvailability();
        var anchorReadService = new AnchorReadService(paths);
        var anchorEditService = new AnchorEditService();
        var diffPreviewService = new DiffPreviewService(paths, refactorPreviewStore);
        var lspRefactorService = new LspRefactorService(
            paths,
            refactor,
            refactorToolAvailability,
            anchorReadService,
            diffPreviewService
        );
        var astGrepRefactorService = new AstGrepRefactorService(
            refactor,
            refactorToolAvailability,
            anchorReadService,
            diffPreviewService
        );
        return new RefactorServices(
            anchorReadService,
            anchorEditService,
            diffPreviewService,
            lspRefactorService,
            astGrepRefactorService
        );
    }

    private static ToolServices ConfigureToolServices(
        AppConfig config,
        RuntimeSettings runtimeSettings,
        ConversationStore conversationStore,
        DiffPreviewService diffPreviewService
    )
    {
        var paths = config.Paths;
        var providers = config.Providers;
        var toolRegistry = new ToolRegistry(runtimeSettings);
        var webFetchTool = new WebFetchTool(config);
        var memorySearchTool = new MemorySearchTool(paths);
        var memoryGetTool = new MemoryGetTool(paths);
        var sessionListTool = new SessionListTool(conversationStore);
        var sessionHistoryTool = new SessionHistoryTool(conversationStore);
        var sessionSendTool = new SessionSendTool(conversationStore);
        var acpSessionBindingAdapter = new AcpSessionBindingAdapter(
            paths.WorkspaceRootDir,
            providers.CodexBinary,
            runtimeSettings
        );
        var sessionSpawnDailyCostLedger = new AgentSpawnDailyCostLedger(
            DefaultStatePathResolver.CreateDefault().ResolveStateFilePath("agent_spawn_daily_cost_ledger.json")
        );
        var sessionSpawnQueueStore = new FileAgentSpawnQueueStore(DefaultStatePathResolver.CreateDefault());
        var sessionSpawnActiveRunStore = new FileAgentSpawnActiveRunStore(DefaultStatePathResolver.CreateDefault());
        var sessionSpawnRunBreaker = new AgentSpawnRunBreaker(DefaultStatePathResolver.CreateDefault());
        var sessionSpawnWorkspaceRollbackPolicy = new AgentSpawnWorkspaceRollbackPolicy(
            paths,
            diffPreviewService
        );
        var sessionSpawnWorktreeManager = GitWorktreeIsolationManager.FromEnvironment(
            paths.WorkspaceRootDir,
            DefaultStatePathResolver.CreateDefault().ResolveStateDirectoryPath("agent-worktrees")
        );
        var sessionSpawnTool = new SessionSpawnTool(
            conversationStore,
            acpSessionBindingAdapter,
            new AgentSpawnAdmissionLimiter(),
            sessionSpawnDailyCostLedger,
            sessionSpawnQueueStore,
            sessionSpawnRunBreaker,
            sessionSpawnActiveRunStore,
            sessionSpawnWorkspaceRollbackPolicy,
            sessionSpawnWorktreeManager
        );
        var browserTool = new BrowserTool(config);
        var canvasTool = new CanvasTool(config);
        var nodesTool = new NodesTool(config);
        return new ToolServices(
            toolRegistry,
            webFetchTool,
            memorySearchTool,
            memoryGetTool,
            sessionListTool,
            sessionHistoryTool,
            sessionSendTool,
            sessionSpawnTool,
            browserTool,
            canvasTool,
            nodesTool
        );
    }

    private sealed record PersistenceServices(
        SessionManager SessionManager,
        MemoryNoteStore MemoryNoteStore,
        ConversationStore ConversationStore,
        IMemoryNoteStore MemoryNoteStoreService,
        IConversationStore ConversationStoreService,
        IAuthSessionStore AuthSessionStore,
        IRoutineStore RoutineStore,
        FilePlanStore PlanStore,
        FileTaskGraphStore TaskGraphStore,
        IRunArtifactStore RunArtifactStore,
        FileNotebookStore NotebookStore
    );

    private sealed record SearchServices(
        LegacyGeminiGroundingSearchGateway Gateway,
        DefaultSearchGuard Guard,
        EvidenceFallbackSearchAnswerComposer AnswerComposer
    );

    private sealed record RefactorServices(
        AnchorReadService AnchorRead,
        AnchorEditService AnchorEdit,
        DiffPreviewService DiffPreview,
        LspRefactorService LspRefactor,
        AstGrepRefactorService AstGrepRefactor
    );

    private sealed record ProjectContextServices(
        AgentInstructionLoader InstructionLoader,
        SkillManifestLoader SkillManifestLoader,
        CommandTemplateLoader CommandTemplateLoader,
        ProjectContextLoader Loader
    );

    private sealed record WorkflowServices(
        PlanService Plan,
        PlanReviewService PlanReview,
        TaskGraphService TaskGraph,
        BackgroundTaskCoordinator TaskGraphCoordinator,
        NotebookService Notebook
    );

    private sealed record ToolServices(
        ToolRegistry Registry,
        WebFetchTool WebFetch,
        MemorySearchTool MemorySearch,
        MemoryGetTool MemoryGet,
        SessionListTool SessionList,
        SessionHistoryTool SessionHistory,
        SessionSendTool SessionSend,
        SessionSpawnTool SessionSpawn,
        BrowserTool Browser,
        CanvasTool Canvas,
        NodesTool Nodes
    );

    private static async Task RunAgentSpawnQueueLoopAsync(
        SessionSpawnTool sessionSpawnTool,
        CancellationToken cancellationToken
    )
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                var results = sessionSpawnTool.FlushQueuedSpawns(maxCount: 2);
                foreach (var result in results)
                {
                    Console.WriteLine(
                        $"[agent-spawn-queue] flush result status={result.Status} runId={result.RunId} followUp={result.FollowUpStatus}"
                    );
                }
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"[agent-spawn-queue] flush failed: {ex.Message}");
            }

            try
            {
                await Task.Delay(TimeSpan.FromSeconds(15), cancellationToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    private static async Task RunAgentWatchdogLoopAsync(
        SessionSpawnTool sessionSpawnTool,
        CancellationToken cancellationToken
    )
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                var status = sessionSpawnTool.GetQueueStatus();
                var marked = status.Watchdog?.EventCount ?? 0;
                if (marked > 0)
                {
                    Console.Error.WriteLine($"[agent-spawn-watchdog] closed {marked} stale or timed-out active run(s).");
                }
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"[agent-spawn-watchdog] evaluation failed: {ex.Message}");
            }

            try
            {
                await Task.Delay(TimeSpan.FromSeconds(60), cancellationToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    private static ApplicationServices ConfigureApplicationServices(
        AppConfig config,
        IStatePathResolver pathResolver,
        RuntimeSettings runtimeSettings,
        RoutingPolicyResolver routingPolicyResolver,
        AuditLogger auditLogger,
        LlmRouter llmRouter,
        CopilotCliWrapper copilotWrapper,
        CodexCliWrapper codexWrapper,
        TelegramClient telegramClient,
        ICoreRuntimeClient coreClient,
        DoctorService doctorService,
        NotebookService notebookService,
        AnchorReadService anchorReadService,
        AnchorEditService anchorEditService,
        DiffPreviewService diffPreviewService,
        LspRefactorService lspRefactorService,
        AstGrepRefactorService astGrepRefactorService,
        ProjectContextLoader projectContextLoader,
        TaskGraphService taskGraphService,
        PlanService planService,
        PlanReviewService planReviewService,
        BackgroundTaskCoordinator taskGraphCoordinator,
        IConversationStore conversationStore,
        IMemoryNoteStore memoryNoteStore,
        MemorySearchTool memorySearchTool,
        MemoryGetTool memoryGetTool,
        SessionListTool sessionListTool,
        SessionHistoryTool sessionHistoryTool,
        SessionSendTool sessionSendTool,
        SessionSpawnTool sessionSpawnTool,
        WebFetchTool webFetchTool,
        BrowserTool browserTool,
        CanvasTool canvasTool,
        NodesTool nodesTool
    )
    {
        var paths = config.Paths;
        var syncConfigStore = new SyncConfigurationStore(paths);
        var gistSyncService = new GistSyncApplicationService(new HttpClient());
        var cleanupService = new CleanupService(paths);
        var doctorApplicationService = new DoctorApplicationService(doctorService, paths);
        var notebookApplicationService = new NotebookApplicationService(notebookService);
        var projectApplicationService = new ProjectApplicationService(pathResolver.ResolveStateFilePath("projects.json"));
        var agentCommunicationApplicationService = new AgentCommunicationApplicationService(
            new FileAgentCommunicationStore(pathResolver),
            auditLogger
        );
        var telemetryTracer = new TelemetryTracer(new FileTelemetryTraceStore(pathResolver));
        var telemetryApplicationService = new TelemetryApplicationService(telemetryTracer);
        var sessionReplayApplicationService = new SessionReplayApplicationService(
            conversationStore,
            telemetryApplicationService,
            agentCommunicationApplicationService
        );
        var settingsApplicationService = new SettingsApplicationService(
            runtimeSettings,
            routingPolicyResolver,
            auditLogger,
            llmRouter,
            copilotWrapper,
            codexWrapper,
            telegramClient,
            coreClient
        );
        var refactorApplicationService = new RefactorApplicationService(
            anchorReadService,
            anchorEditService,
            diffPreviewService,
            lspRefactorService,
            astGrepRefactorService,
            auditLogger,
            paths
        );
        var contextApplicationService = new ContextApplicationService(projectContextLoader);
        var taskGraphApplicationService = new TaskGraphApplicationService(
            taskGraphService,
            planService,
            taskGraphCoordinator
        );
        var memoryApplicationService = new MemoryApplicationService(
            conversationStore,
            memoryNoteStore,
            auditLogger,
            paths,
            memorySearchTool,
            memoryGetTool
        );
        var planApplicationService = new PlanApplicationService(
            planService,
            planReviewService,
            taskGraphService,
            taskGraphCoordinator
        );
        var conversationApplicationService = new ConversationApplicationService(
            conversationStore,
            memoryNoteStore,
            auditLogger,
            paths,
            memorySearchTool,
            syncConfigStore
        );
        var toolApplicationService = new ToolApplicationService(
            sessionListTool,
            sessionHistoryTool,
            sessionSendTool,
            sessionSpawnTool,
            webFetchTool,
            browserTool,
            canvasTool,
            nodesTool,
            cleanupService
        );

        return new ApplicationServices(
            doctorApplicationService,
            notebookApplicationService,
            settingsApplicationService,
            refactorApplicationService,
            contextApplicationService,
            projectApplicationService,
            agentCommunicationApplicationService,
            telemetryTracer,
            telemetryApplicationService,
            sessionReplayApplicationService,
            cleanupService,
            taskGraphApplicationService,
            memoryApplicationService,
            planApplicationService,
            conversationApplicationService,
            toolApplicationService,
            syncConfigStore,
            gistSyncService
        );
    }

    private static RuntimeServices ConfigureRuntimeServices(
        AppConfig config,
        IStatePathResolver pathResolver,
        LlmRouter llmRouter,
        GroqModelCatalog groqModelCatalog,
        CerebrasModelCatalog cerebrasModelCatalog,
        TelegramClient telegramClient,
        IAuthSessionStore authSessionStore,
        CommandExecutionService commandExecutionService,
        RuntimeSettings runtimeSettings,
        ApplicationServices appServices,
        RoutineApplicationService routineApplicationService,
        CodingApplicationService codingApplicationService,
        CommandService commandService,
        BackgroundTaskCoordinator taskGraphCoordinator,
        AuditLogger auditLogger
    )
    {
        var logicApplicationService = new LogicApplicationService(commandService);
        var chatApplicationService = new ChatApplicationService(commandService);
        taskGraphCoordinator.ConfigureExecutors(codingApplicationService, commandExecutionService);
        return new RuntimeServices(
            new WebSocketGateway(
                config.Providers,
                config.Gateway,
                config.Paths,
                config.Security,
                config.WebSocketPort,
                authSessionStore,
                telegramClient,
                commandExecutionService,
                appServices.Settings,
                appServices.Conversation,
                appServices.Memory,
                appServices.Tool,
                appServices.Project,
                routineApplicationService,
                logicApplicationService,
                appServices.Doctor,
                appServices.Plan,
                appServices.TaskGraph,
                appServices.Telemetry,
                appServices.SessionReplay,
                appServices.AgentCommunication,
                appServices.Refactor,
                appServices.Context,
                appServices.Notebook,
                chatApplicationService,
                codingApplicationService,
                llmRouter,
                groqModelCatalog,
                cerebrasModelCatalog,
                new GuardRetryTimelineStore(config.GuardRetryTimelineStatePath),
                auditLogger,
                appServices.SyncConfigStore,
                appServices.GistSyncService
            ),
            new TelegramUpdateLoop(
                telegramClient,
                commandExecutionService,
                config.Security,
                runtimeSettings,
                new TelegramPollingStateStore(
                    pathResolver.ResolveStateFilePath("telegram_update_offset.txt"),
                    pathResolver.ResolveStateFilePath("telegram_update_loop.lock")
                ),
                new FileTelegramReplyOutboxStore(pathResolver)
            )
        );
    }

    private sealed record ApplicationServices(
        DoctorApplicationService Doctor,
        NotebookApplicationService Notebook,
        SettingsApplicationService Settings,
        RefactorApplicationService Refactor,
        ContextApplicationService Context,
        ProjectApplicationService Project,
        AgentCommunicationApplicationService AgentCommunication,
        TelemetryTracer TelemetryTracer,
        TelemetryApplicationService Telemetry,
        SessionReplayApplicationService SessionReplay,
        CleanupService Cleanup,
        TaskGraphApplicationService TaskGraph,
        MemoryApplicationService Memory,
        PlanApplicationService Plan,
        ConversationApplicationService Conversation,
        ToolApplicationService Tool,
        ISyncConfigurationStore SyncConfigStore,
        IGistSyncApplicationService GistSyncService
    );

    private sealed record RuntimeServices(
        WebSocketGateway WebSocketGateway,
        TelegramUpdateLoop TelegramUpdateLoop
    );
}
