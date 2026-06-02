using System.Collections.Concurrent;
using System.Diagnostics;
using System.Globalization;
using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Omnux.Middleware;

public sealed partial class CommandService :
    IGatewayApplicationService
{
    private const string DefaultGroqPrimaryModel = "meta-llama/llama-4-scout-17b-16e-instruct";
    private const string DefaultGroqFastModel = "llama-3.1-8b-instant";
    private const string DefaultGroqComplexModel = "qwen/qwen3-32b";
    private const string DefaultCerebrasModel = "gpt-oss-120b";
    private const string LegacyCerebrasLlamaModel = "llama3.1-8b";
    private const string DefaultCopilotModel = "gpt-5-mini";
    private const int TelegramUpgradeDailyCap = 100;
    // 텔레그램 응답 길이 제한 — TelegramClient가 3900자 단위로 자동 분할 송신하므로
    // 응답 자체는 거의 무제한으로 생성 후 분할하도록 큰 값으로 설정.
    private const int TelegramMaxResponseChars = 60000;
    private const int TelegramFastModeMaxOutputTokens = 1024;
    private const int TelegramComplexModeMaxOutputTokens = 1536;
    // 텔레그램 입력 압축 임계값 — 대화탭과 동일하게 사실상 비활성화 (LLM 컨텍스트 한도까지 그대로 전달).
    private const int TelegramLongContextThresholdChars = 200000;
    private const int TelegramLongContextTargetChars = 1200;
    private static readonly Regex CodeFenceRegex = new("```([a-zA-Z0-9#+._-]*)\\s*\\n(.*?)```", RegexOptions.Compiled | RegexOptions.Singleline);
    private static readonly Regex OuterHtmlContainerRegex = new(@"^\s*<\s*(p|pre|code)\b[^>]*>([\s\S]*)</\s*\1\s*>\s*$", RegexOptions.Compiled | RegexOptions.IgnoreCase);
    private static readonly Regex JsonTrailingCommaRegex = new(@",\s*([}\]])", RegexOptions.Compiled);
    private static readonly Regex DomainRegex = new(@"([a-z0-9][a-z0-9-]*\.[a-z]{2,})", RegexOptions.Compiled | RegexOptions.IgnoreCase);
    private static readonly Regex JsonContentFieldRegex = new("\"content\"\\s*:\\s*\"((?:\\\\.|[^\"\\\\])*)\"", RegexOptions.Compiled | RegexOptions.Singleline);
    private static readonly Regex JsonPathFieldRegex = new("\"path\"\\s*:\\s*\"((?:\\\\.|[^\"\\\\])*)\"", RegexOptions.Compiled | RegexOptions.Singleline);
    private static readonly Regex HttpUrlRegex = new(
        "https?://[^\\s<>()\\\"'`]+",
        RegexOptions.Compiled | RegexOptions.IgnoreCase
    );
    private static readonly Regex HtmlTitleRegex = new(
        @"<title[^>]*>([\s\S]*?)</title>",
        RegexOptions.Compiled | RegexOptions.IgnoreCase
    );
    private static readonly Regex HtmlTagStripRegex = new(
        @"<[^>]+>",
        RegexOptions.Compiled
    );
    private static readonly HttpClient WebFetchClient = CreateWebFetchClient();
    private readonly ProviderOptions _providers;
    private readonly PathOptions _paths;
    private readonly SecurityOptions _security;
    private readonly ContextOptions _context;
    private readonly ExecutionOptions _execution;
    private readonly LlmRouter _llmRouter;
    private readonly GroqModelCatalog _groqModelCatalog;
    private readonly ICoreRuntimeClient _coreClient;
    private readonly TelegramClient _telegramClient;
    private readonly RuntimeSettings _runtimeSettings;
    private readonly ProviderRegistry _providerRegistry;
    private readonly RoutingPolicyResolver _routingPolicyResolver;
    private readonly ToolRegistry _toolRegistry;
    private readonly SearchGateway _searchGateway;
    private readonly ISearchGuard _searchGuard;
    private readonly ISearchAnswerComposer _searchAnswerComposer;
    private readonly WebFetchTool _webFetchTool;
    private readonly MemorySearchTool _memorySearchTool;
    private readonly MemoryGetTool _memoryGetTool;
    private readonly SessionListTool _sessionListTool;
    private readonly SessionHistoryTool _sessionHistoryTool;
    private readonly SessionSendTool _sessionSendTool;
    private readonly SessionSpawnTool _sessionSpawnTool;
    private readonly BrowserTool _browserTool;
    private readonly CanvasTool _canvasTool;
    private readonly NodesTool _nodesTool;
    private SkillCreateDirective? _skillCreateDirective;
    private SkillCreateDirective SkillCreateDirective =>
        _skillCreateDirective ??= new SkillCreateDirective(_paths.WorkspaceRootDir);
    private SkillFileService? _skillFileService;
    private SkillFileService SkillFiles =>
        _skillFileService ??= new SkillFileService(_paths);
    private readonly ConcurrentDictionary<string, string> _activeSkillByThread = new(StringComparer.Ordinal);
    private readonly CopilotCliWrapper _copilotWrapper;
    private readonly CodexCliWrapper _codexWrapper;
    private readonly PythonSandboxClient _sandboxClient;
    private readonly IMemoryNoteStore _memoryNoteStore;
    private readonly IConversationStore _conversationStore;
    private readonly IRunArtifactStore _runArtifactStore;
    private readonly UniversalCodeRunner _codeRunner;
    private readonly AuditLogger _auditLogger;
    private readonly DoctorService _doctorService;
    private readonly PlanService _planService;
    private readonly PlanReviewService _planReviewService;
    private readonly TaskGraphService _taskGraphService;
    private readonly BackgroundTaskCoordinator _taskGraphCoordinator;
    private readonly ProjectContextLoader _projectContextLoader;
    private readonly NotebookService _notebookService;
    private readonly AnchorReadService _anchorReadService;
    private readonly AnchorEditService _anchorEditService;
    private readonly DiffPreviewService _diffPreviewService;
    private readonly LspRefactorService _lspRefactorService;
    private readonly AstGrepRefactorService _astGrepRefactorService;
    private readonly Queue<string> _recentEvents = new();
    private readonly object _eventLock = new();
    private readonly object _telegramUpgradeQuotaLock = new();
    private readonly ISettingsApplicationService _settingsAppService;
    private readonly IRefactorApplicationService _refactorAppService;
    private readonly IContextApplicationService _contextAppService;
    private readonly CleanupService _cleanupService;
    private readonly IConversationApplicationService _conversationAppService;
    private readonly IToolApplicationService _toolAppService;
    private readonly ILlmSettingsApplicationService _llmSettingsAppService;
    private readonly ITelegramLlmMutationApplicationService _telegramLlmMutationAppService;
    private readonly ITelegramCodingSettingsApplicationService _telegramCodingSettingsAppService;
    private readonly LlmPreferenceContext _llmPreferenceContext;
    private readonly ExecutionContext _executionContext;
    private readonly RoutineRegistry _routineRegistry;
    private readonly string _telegramUpgradeQuotaStatePath;
    private string _telegramUpgradeQuotaDay = string.Empty;
    private int _telegramUpgradeQuotaCount;

    private bool IsDynamicCodeExecutionEnabled()
    {
        return _security.EnableDynamicCode;
    }

    private static string BuildDynamicCodeDisabledMessage()
    {
        return "dynamic code is disabled. set OMNUX_ENABLE_DYNAMIC_CODE=true";
    }

    internal CommandService(
        AppConfig config,
        LlmRouter llmRouter,
        GroqModelCatalog groqModelCatalog,
        ICoreRuntimeClient coreClient,
        TelegramClient telegramClient,
        RuntimeSettings runtimeSettings,
        ProviderRegistry providerRegistry,
        RoutingPolicyResolver routingPolicyResolver,
        ToolRegistry toolRegistry,
        SearchGateway searchGateway,
        ISearchGuard searchGuard,
        ISearchAnswerComposer searchAnswerComposer,
        WebFetchTool webFetchTool,
        MemorySearchTool memorySearchTool,
        MemoryGetTool memoryGetTool,
        SessionListTool sessionListTool,
        SessionHistoryTool sessionHistoryTool,
        SessionSendTool sessionSendTool,
        SessionSpawnTool sessionSpawnTool,
        BrowserTool browserTool,
        CanvasTool canvasTool,
        NodesTool nodesTool,
        CopilotCliWrapper copilotWrapper,
        CodexCliWrapper codexWrapper,
        PythonSandboxClient sandboxClient,
        IMemoryNoteStore memoryNoteStore,
        IConversationStore conversationStore,
        IRunArtifactStore runArtifactStore,
        UniversalCodeRunner codeRunner,
        AuditLogger auditLogger,
        DoctorService doctorService,
        PlanService planService,
        PlanReviewService planReviewService,
        TaskGraphService taskGraphService,
        BackgroundTaskCoordinator taskGraphCoordinator,
        ProjectContextLoader projectContextLoader,
        NotebookService notebookService,
        AnchorReadService anchorReadService,
        AnchorEditService anchorEditService,
        DiffPreviewService diffPreviewService,
        LspRefactorService lspRefactorService,
        AstGrepRefactorService astGrepRefactorService,
        ISettingsApplicationService settingsAppService,
        IRefactorApplicationService refactorAppService,
        IContextApplicationService contextAppService,
        CleanupService cleanupService,
        IConversationApplicationService conversationAppService,
        IToolApplicationService toolAppService,
        ILlmSettingsApplicationService llmSettingsAppService,
        ILlmControlApplicationService llmControlApplicationService,
        SlashCommandRouter slashCommandRouter,
        ITelegramLlmMutationApplicationService telegramLlmMutationAppService,
        ITelegramCodingSettingsApplicationService telegramCodingSettingsAppService,
        LlmPreferenceContext llmPreferenceContext,
        ExecutionContext executionContext,
        RoutineRegistry routineRegistry
    )
    {
        _providers = config.Providers;
        _paths = config.Paths;
        _security = config.Security;
        _context = config.Context;
        _execution = config.Execution;
        _llmRouter = llmRouter;
        _groqModelCatalog = groqModelCatalog;
        _coreClient = coreClient;
        _telegramClient = telegramClient;
        _runtimeSettings = runtimeSettings;
        _providerRegistry = providerRegistry;
        _routingPolicyResolver = routingPolicyResolver;
        _toolRegistry = toolRegistry;
        _searchGateway = searchGateway;
        _searchGuard = searchGuard;
        _searchAnswerComposer = searchAnswerComposer;
        _webFetchTool = webFetchTool;
        _memorySearchTool = memorySearchTool;
        _memoryGetTool = memoryGetTool;
        _sessionListTool = sessionListTool;
        _sessionHistoryTool = sessionHistoryTool;
        _sessionSendTool = sessionSendTool;
        _sessionSpawnTool = sessionSpawnTool;
        _browserTool = browserTool;
        _canvasTool = canvasTool;
        _nodesTool = nodesTool;
        _copilotWrapper = copilotWrapper;
        _codexWrapper = codexWrapper;
        _sandboxClient = sandboxClient;
        _memoryNoteStore = memoryNoteStore;
        _conversationStore = conversationStore;
        _runArtifactStore = runArtifactStore;
        _codeRunner = codeRunner;
        _auditLogger = auditLogger;
        _doctorService = doctorService;
        _planService = planService;
        _planReviewService = planReviewService;
        _taskGraphService = taskGraphService;
        _taskGraphCoordinator = taskGraphCoordinator;
        _projectContextLoader = projectContextLoader;
        _notebookService = notebookService;
        _anchorReadService = anchorReadService;
        _anchorEditService = anchorEditService;
        _diffPreviewService = diffPreviewService;
        _lspRefactorService = lspRefactorService;
        _astGrepRefactorService = astGrepRefactorService;
        _settingsAppService = settingsAppService;
        _refactorAppService = refactorAppService;
        _contextAppService = contextAppService;
        _cleanupService = cleanupService;
        _conversationAppService = conversationAppService;
        _toolAppService = toolAppService;
        _llmSettingsAppService = llmSettingsAppService;
        _llmControlApplicationService = llmControlApplicationService;
        _slashCommandRouter = slashCommandRouter;
        _telegramLlmMutationAppService = telegramLlmMutationAppService;
        _telegramCodingSettingsAppService = telegramCodingSettingsAppService;
        _llmPreferenceContext = llmPreferenceContext;
        _executionContext = executionContext;
        _routineRegistry = routineRegistry;
        _telegramUpgradeQuotaStatePath = BuildTelegramUpgradeQuotaStatePath();
        var stateBaseDir = Path.GetDirectoryName(_paths.ConversationStatePath);
        if (string.IsNullOrWhiteSpace(stateBaseDir))
        {
            var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            stateBaseDir = string.IsNullOrWhiteSpace(home) ? Path.GetTempPath() : Path.Combine(home, ".omnux");
        }

        LoadTelegramUpgradeQuotaState();
        RestoreActiveSkillBindingsFromStore();
    }

    private object _telegramLlmLock => _llmPreferenceContext.TelegramLlmLock;
    private object _webLlmLock => _llmPreferenceContext.WebLlmLock;
    private object _telegramRefactorLock => _llmPreferenceContext.TelegramRefactorLock;
    private TelegramLlmPreferences _telegramLlmPreferences => _llmPreferenceContext.TelegramLlmPreferences;
    private TelegramRefactorSession _telegramRefactorSession => _llmPreferenceContext.TelegramRefactorSession;
    private WebLlmPreferences _webLlmPreferences => _llmPreferenceContext.WebLlmPreferences;

    // 시작 시 ConversationStore에 영구 저장된 활성 스킬을 메모리 dictionary로 복원.
    private void RestoreActiveSkillBindingsFromStore()
    {
        try
        {
            var bindings = _conversationStore.ListActiveSkillBindings();
            foreach (var (conversationId, skillName) in bindings)
            {
                if (string.IsNullOrWhiteSpace(conversationId) || string.IsNullOrWhiteSpace(skillName))
                {
                    continue;
                }
                _activeSkillByThread[conversationId.Trim().ToLowerInvariant()] = skillName.Trim();
            }
            _auditLogger.Log("local", "skill_active_restore", "ok", $"count={bindings.Count}");
        }
        catch (Exception ex)
        {
            _auditLogger.Log("local", "skill_active_restore", "failed", ex.Message);
        }
    }

    // 활성 스킬 변경/해제를 ConversationStore에도 영구 저장. 키가 비어있으면 no-op.
    private void PersistActiveSkillForThread(string? threadKey, string? skillName)
    {
        if (string.IsNullOrWhiteSpace(threadKey))
        {
            return;
        }
        try
        {
            _conversationStore.SetActiveSkillName(threadKey, skillName);
        }
        catch (Exception ex)
        {
            _auditLogger.Log("local", "skill_active_persist", "failed", ex.Message);
        }
    }

    public bool ClearActiveSkill(string? conversationId) => _conversationAppService.ClearActiveSkill(conversationId);

    public bool ClearActiveSkillForConversation(string? conversationId)
    {
        var trimmed = (conversationId ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(trimmed))
        {
            return false;
        }

        try
        {
            var normalized = trimmed.ToLowerInvariant();
            var removed = _activeSkillByThread.TryRemove(trimmed, out _);
            if (!string.Equals(trimmed, normalized, StringComparison.Ordinal))
            {
                removed = _activeSkillByThread.TryRemove(normalized, out _) || removed;
            }

            _conversationStore.SetActiveSkillName(trimmed, null);
            _auditLogger.Log("web", "skill_active_clear", "ok", $"conversation={trimmed} removed={(removed ? "true" : "false")}");
            return true;
        }
        catch (Exception ex)
        {
            _auditLogger.Log("web", "skill_active_clear", "failed", ex.Message);
            return false;
        }
    }

}
