namespace Omnux.Middleware;

internal interface IRoutineLlmGateway
{
    Task<LlmSingleChatResult> GenerateByProviderSafeAsync(
        string provider,
        string? model,
        string input,
        CancellationToken cancellationToken,
        int? maxOutputTokens = null
    );
}

internal interface IRoutineSearchGateway
{
    Task<LlmSingleChatResult> GenerateGeminiUrlContextAnswerAsync(
        string input,
        IReadOnlyList<string> urls,
        string memoryHint,
        bool allowMarkdownTable,
        bool enforceTelegramOutputStyle,
        Action<ChatStreamUpdate>? streamCallback,
        string scope,
        string mode,
        string conversationId,
        string decisionPath,
        long decisionMs,
        CancellationToken cancellationToken
    );

    Task<SearchAnswerCompositionResult> ComposeGroundedWebAnswerWithFallbackAsync(
        string input,
        string memoryHint,
        bool selfDecideNeedWeb,
        bool allowMarkdownTable,
        bool enforceTelegramOutputStyle,
        Action<ChatStreamUpdate>? streamCallback,
        string scope,
        string mode,
        string conversationId,
        string decisionPath,
        long decisionMs,
        string source,
        CancellationToken cancellationToken
    );
}

internal interface IRoutineLogicGraphRunner
{
    Task<LogicRunSnapshot> ExecuteLogicGraphRunCoreAsync(
        string graphId,
        string runId,
        string source,
        string runInput,
        Action<LogicRunEvent>? eventCallback,
        CancellationToken cancellationToken
    );
}

public sealed partial class RoutineApplicationService : IRoutineApplicationService
{
    private const string RoutineModelMaverick = "meta-llama/llama-4-maverick-17b-128e-instruct";
    private const string RoutineModelGptOss = "openai/gpt-oss-120b";
    private const string RoutineModelKimi = "moonshotai/kimi-k2-instruct-0905";
    private const string LegacyCerebrasLlamaModel = "llama3.1-8b";
    private const string DefaultCerebrasModel = "gpt-oss-120b";

    private readonly ProviderOptions _providers;
    private readonly PathOptions _paths;
    private readonly ContextOptions _context;
    private readonly SecurityOptions _security;
    private readonly LlmRouter _llmRouter;
    private readonly GroqModelCatalog _groqModelCatalog;
    private readonly IConversationStore _conversationStore;
    private readonly IRunArtifactStore _runArtifactStore;
    private readonly UniversalCodeRunner _codeRunner;
    private readonly TelegramClient _telegramClient;
    private readonly SessionSpawnTool _sessionSpawnTool;
    private readonly RoutineRegistry _routineRegistry;
    private readonly IRoutineLlmGateway _llmGateway;
    private readonly IRoutineSearchGateway _searchGateway;
    private readonly IRoutineLogicGraphRunner _logicGraphRunner;
    private readonly string _routineStatePath;
    private readonly string _routinePromptDir;
    private readonly CancellationTokenSource _routineSchedulerCts = new();
    private readonly SemaphoreSlim _routineSchedulerDispatchGate = new(2, 2);
    private Task? _routineSchedulerTask;
    private string? _routineSchedulerLastError;

    internal RoutineApplicationService(
        ProviderOptions providers,
        PathOptions paths,
        ContextOptions context,
        SecurityOptions security,
        LlmRouter llmRouter,
        GroqModelCatalog groqModelCatalog,
        IConversationStore conversationStore,
        IRunArtifactStore runArtifactStore,
        UniversalCodeRunner codeRunner,
        TelegramClient telegramClient,
        SessionSpawnTool sessionSpawnTool,
        RoutineRegistry routineRegistry,
        IRoutineLlmGateway llmGateway,
        IRoutineSearchGateway searchGateway,
        IRoutineLogicGraphRunner logicGraphRunner
    )
    {
        _providers = providers;
        _paths = paths;
        _context = context;
        _security = security;
        _llmRouter = llmRouter;
        _groqModelCatalog = groqModelCatalog;
        _conversationStore = conversationStore;
        _runArtifactStore = runArtifactStore;
        _codeRunner = codeRunner;
        _telegramClient = telegramClient;
        _sessionSpawnTool = sessionSpawnTool;
        _routineRegistry = routineRegistry;
        _llmGateway = llmGateway;
        _searchGateway = searchGateway;
        _logicGraphRunner = logicGraphRunner;
        _routineStatePath = _routineRegistry.StorePath;
        _routinePromptDir = _paths.RoutinePromptDir;

        EnsureRoutinePromptFiles();
        _routineRegistry.Load();
        _routineSchedulerTask = Task.Run(() => RoutineSchedulerLoopAsync(_routineSchedulerCts.Token));
    }
}
