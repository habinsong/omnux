namespace Omnux.Middleware;

public sealed class AppConfig
{
    private const int DefaultWebSocketPort = 41880;
    private const string DefaultKeychainAccount = "omnux";
    private const string TelegramBotTokenService = "omnux_telegram_bot_token";
    private const string TelegramChatIdService = "omnux_telegram_chat_id";
    private const string GroqApiKeyService = "omnux_groq_api_key";
    private const string GeminiApiKeyService = "omnux_gemini_api_key";
    private const string CerebrasApiKeyService = "omnux_cerebras_api_key";
    private const string NvidiaApiKeyService = "omnux_nvidia_api_key";
    private const string CodexApiKeyService = "omnux_codex_api_key";
    private const string SttApiKeyService = "omnux_stt_api_key";

    public int WebSocketPort { get; init; } = DefaultWebSocketPort;
    public string? TelegramBotToken { get; init; }
    public string? TelegramChatId { get; init; }
    // 단일 user_id 또는 CSV(여러 user_id)를 받는다. 비어 있으면 user 단위 검사 생략.
    public string? TelegramAllowedUserId { get; init; }
    public string CopilotCliBinary { get; init; } = "gh";
    public string CopilotDirectBinary { get; init; } = "copilot";
    public string CopilotModel { get; init; } = ModelRegistry.GetDefaultModel("copilot");
    public string CodexBinary { get; init; } = "codex";
    public string CodexModel { get; init; } = ModelRegistry.GetDefaultModel("codex");
    public string PythonBinary { get; init; } = ResolveDefaultPythonBinary();
    public string SandboxExecutorPath { get; init; } = ResolveDefaultSandboxExecutorPath();
    public string DashboardIndexPath { get; init; } = ResolveDefaultDashboardIndexPath();
    public bool EnableDynamicCode { get; init; }
    public string? GroqApiKey { get; init; }
    public string GroqBaseUrl { get; init; } = "https://api.groq.com/openai/v1";
    public string GroqModel { get; init; } = ModelRegistry.GetDefaultModel("groq");
    public string? GeminiApiKey { get; init; }
    public string GeminiBaseUrl { get; init; } = "https://generativelanguage.googleapis.com/v1beta";
    public string GeminiModel { get; init; } = ModelRegistry.GetDefaultModel("gemini");
    public string GeminiFlashModel { get; init; } = "gemini-3-flash-preview";
    public string GeminiSearchModel { get; init; } = "gemini-3.1-flash-lite";
    public string CerebrasBaseUrl { get; init; } = "https://api.cerebras.ai/v1";
    public string CerebrasModel { get; init; } = ModelRegistry.GetDefaultModel("cerebras");
    public int CerebrasTimeoutSec { get; init; } = 40;
    public string CerebrasKeychainService { get; init; } = CerebrasApiKeyService;
    public string CerebrasKeychainAccount { get; init; } = DefaultKeychainAccount;
    public string? CerebrasApiKey { get; init; }
    public string NvidiaBaseUrl { get; init; } = "https://integrate.api.nvidia.com/v1";
    public string NvidiaModel { get; init; } = ModelRegistry.GetDefaultModel("nvidia");
    public int NvidiaTimeoutSec { get; init; } = 180;
    public string NvidiaKeychainService { get; init; } = NvidiaApiKeyService;
    public string NvidiaKeychainAccount { get; init; } = DefaultKeychainAccount;
    public string? NvidiaApiKey { get; init; }
    public string? CodexApiKey { get; init; }
    public string SttProvider { get; init; } = string.Empty;
    public string SttBaseUrl { get; init; } = string.Empty;
    public string SttModel { get; init; } = string.Empty;
    public string? SttApiKey { get; init; }
    public decimal GeminiInputPricePerMillionUsd { get; init; } = 0.50m;
    public decimal GeminiOutputPricePerMillionUsd { get; init; } = 3.00m;
    public string LlmUsageStatePath { get; init; } = ResolveDefaultStateFilePath("llm_usage.json");
    public string CopilotUsageStatePath { get; init; } = ResolveDefaultStateFilePath("copilot_usage.json");
    public string ConversationStatePath { get; init; } = ResolveDefaultStateFilePath("conversations.json");
    public string AuthSessionStatePath { get; init; } = ResolveDefaultStateFilePath("auth_sessions.json");
    public string MemoryNotesRootDir { get; init; } = ResolveDefaultStateDirectoryPath("memory-notes");
    public int ConversationCompressChars { get; init; } = 12000;
    public int ConversationKeepRecentMessages { get; init; } = 16;
    public int ConversationHistoryMessages { get; init; } = 18;
    public string CodeRunsRootDir { get; init; } = ResolveDefaultStateDirectoryPath("code-runs");
    public string RoutineRunsRootDir { get; init; } = Path.Combine(ResolveDefaultWorkspaceRootDir(), "routines");
    public int CodeExecutionTimeoutSec { get; init; } = 120;
    public string WorkspaceRootDir { get; init; } = ResolveDefaultWorkspaceRootDir();
    public string RoutineStatePath { get; init; } = ResolveDefaultStateFilePath("routines.json");
    public string RoutinePromptDir { get; init; } = Path.Combine(ResolveDefaultWorkspaceRootDir(), "_routine_prompts");
    public bool EnableAutoInstall { get; init; }
    public int CodingAgentMaxIterations { get; init; } = 6;
    public int CodingAgentMaxActionsPerIteration { get; init; } = 8;
    public int CodingCopilotMaxActionsPerIteration { get; init; } = 2;
    public int CodingWorkspaceSnapshotMaxEntries { get; init; } = 80;
    public int CodingRecentLoopHistoryForCopilot { get; init; } = 2;
    public bool CodingEnableOneShotUiClone { get; init; } = true;
    public int ChatMaxOutputTokens { get; init; } = 8192;
    public int CodingMaxOutputTokens { get; init; } = 16384;
    public int LlmTimeoutSec { get; init; } = 20;
    // Single-chat 흐름의 fallback timeout (provider별 분기에서 NVIDIA/Cerebras/copilot 외 일반 provider에 적용).
    public int SingleChatDefaultTimeoutSec { get; init; } = 34;
    // Cerebras single-chat의 최소 보장 timeout. 설정값보다 작아지지 않도록 floor로 사용.
    public int CerebrasMinSingleChatTimeoutSec { get; init; } = 40;
    // NVIDIA NIM single-chat의 최소 보장 timeout (콜드 스타트/큐잉 대비 floor).
    public int NvidiaMinSingleChatTimeoutSec { get; init; } = 30;
    public bool EnableFastWebPipeline { get; init; } = true;
    public int WebDecisionTimeoutMs { get; init; } = 700;
    public int GeminiWebTimeoutMs { get; init; } = 30000;
    public int WebDefaultNewsCount { get; init; } = 10;
    public int WebDefaultListCount { get; init; } = 5;
    public int WebSocketCommandsPerMinute { get; init; } = 30;
    public int WebSocketMaxConnections { get; init; } = 16;
    public int HttpMaxConcurrentRequests { get; init; } = 64;
    public int MetricsPushIntervalSec { get; init; } = 2;
    public int CommandMaxLength { get; init; } = 800;
    public int WebSocketMaxMessageBytes { get; init; } = DefaultWebSocketMaxMessageBytes;
    public string AuditLogPath { get; init; } = ResolveDefaultStateFilePath("audit.log");
    public string GuardAlertWebhookUrl { get; init; } = string.Empty;
    public string GuardAlertLogCollectorUrl { get; init; } = string.Empty;
    public int GuardAlertDispatchTimeoutMs { get; init; } = 3500;
    public int GuardAlertDispatchMaxAttempts { get; init; } = 2;
    public string GuardRetryTimelineStatePath { get; init; } = ResolveDefaultStateFilePath("guard_retry_timeline.json");
    public string GatewayHealthStatePath { get; init; } = ResolveDefaultStateFilePath("gateway_health.json");
    public string GatewayStartupProbeStatePath { get; init; } = ResolveDefaultStateFilePath("gateway_startup_probe.json");
    public string DashboardAccessStatePath { get; init; } = ResolveDefaultStateFilePath("dashboard_access.json");
    public bool ExternalDashboardEnabled { get; init; }
    public bool EnableHealthEndpoint { get; init; } = true;
    public bool EnableGatewayStartupProbe { get; init; } = true;
    public int GatewayStartupProbeDelayMs { get; init; } = 250;
    public int GatewayStartupProbeTimeoutSec { get; init; } = 8;
    public int GatewayStartupProbePollIntervalMs { get; init; } = 150;
    public string GatewayStartupProbeMode { get; init; } = "live";
    public bool EnableLocalOtpFallback { get; init; } = true;
    public string KillAllowlistCsv { get; init; } = string.Empty;
    public int DoctorTimeoutSeconds { get; init; } = 15;
    public bool DoctorEnableSandboxSmoke { get; init; } = true;
    public bool DoctorWriteHistory { get; init; } = true;
    public bool RefactorEnableLsp { get; init; }
    public bool RefactorEnableAstGrep { get; init; }
    public int RefactorPreviewTtlMinutes { get; init; } = 120;
    public string ProjectContextFallbackFilenamesCsv { get; init; } = "TEAM_GUIDE.md,.agents.md";
    public int ProjectContextMaxBytes { get; init; } = 65536;

    private const int DefaultWebSocketMaxMessageBytes = 16 * 1024 * 1024;

    public ProviderOptions Providers => new(
        CopilotCliBinary,
        CopilotDirectBinary,
        CopilotModel,
        CodexBinary,
        CodexModel,
        PythonBinary,
        GroqApiKey,
        GroqBaseUrl,
        GroqModel,
        GeminiApiKey,
        GeminiBaseUrl,
        GeminiModel,
        GeminiFlashModel,
        GeminiSearchModel,
        CerebrasBaseUrl,
        CerebrasModel,
        CerebrasTimeoutSec,
        CerebrasKeychainService,
        CerebrasKeychainAccount,
        CerebrasApiKey,
        NvidiaBaseUrl,
        NvidiaModel,
        NvidiaTimeoutSec,
        NvidiaKeychainService,
        NvidiaKeychainAccount,
        NvidiaApiKey,
        CodexApiKey,
        SttProvider,
        SttBaseUrl,
        SttModel,
        SttApiKey,
        GeminiInputPricePerMillionUsd,
        GeminiOutputPricePerMillionUsd
    );

    public PathOptions Paths => new(
        DashboardIndexPath,
        LlmUsageStatePath,
        CopilotUsageStatePath,
        ConversationStatePath,
        AuthSessionStatePath,
        MemoryNotesRootDir,
        CodeRunsRootDir,
        RoutineRunsRootDir,
        WorkspaceRootDir,
        RoutineStatePath,
        RoutinePromptDir,
        AuditLogPath,
        GuardRetryTimelineStatePath,
        GatewayHealthStatePath,
        GatewayStartupProbeStatePath,
        DashboardAccessStatePath,
        SandboxExecutorPath
    );

    public GatewayOptions Gateway => new(
        WebSocketPort,
        WebSocketCommandsPerMinute,
        WebSocketMaxMessageBytes,
        WebSocketMaxConnections,
        HttpMaxConcurrentRequests,
        EnableHealthEndpoint,
        EnableGatewayStartupProbe,
        GatewayStartupProbeDelayMs,
        GatewayStartupProbeTimeoutSec,
        GatewayStartupProbePollIntervalMs,
        GatewayStartupProbeMode,
        CommandMaxLength,
        MetricsPushIntervalSec
    );

    public SecurityOptions Security => new(
        TelegramAllowedUserId,
        EnableDynamicCode,
        ExternalDashboardEnabled,
        EnableLocalOtpFallback,
        KillAllowlistCsv,
        GuardAlertWebhookUrl,
        GuardAlertLogCollectorUrl,
        GuardAlertDispatchTimeoutMs,
        GuardAlertDispatchMaxAttempts
    );

    public DoctorOptions Doctor => new(
        DoctorTimeoutSeconds,
        DoctorEnableSandboxSmoke,
        DoctorWriteHistory
    );

    public RefactorOptions Refactor => new(
        RefactorEnableLsp,
        RefactorEnableAstGrep,
        RefactorPreviewTtlMinutes,
        ProjectContextFallbackFilenamesCsv,
        ProjectContextMaxBytes
    );

    public ContextOptions Context => new(
        ConversationCompressChars,
        ConversationKeepRecentMessages,
        ConversationHistoryMessages,
        CodingAgentMaxIterations,
        CodingAgentMaxActionsPerIteration,
        CodingCopilotMaxActionsPerIteration,
        CodingWorkspaceSnapshotMaxEntries,
        CodingRecentLoopHistoryForCopilot,
        CodingEnableOneShotUiClone,
        ChatMaxOutputTokens,
        CodingMaxOutputTokens,
        LlmTimeoutSec,
        SingleChatDefaultTimeoutSec,
        CerebrasMinSingleChatTimeoutSec,
        NvidiaMinSingleChatTimeoutSec,
        EnableFastWebPipeline,
        WebDecisionTimeoutMs,
        GeminiWebTimeoutMs,
        WebDefaultNewsCount,
        WebDefaultListCount,
        CommandMaxLength,
        MetricsPushIntervalSec
    );

    public ExecutionOptions Execution => new(CodeExecutionTimeoutSec, EnableAutoInstall);

    public static AppConfig LoadFromEnvironment()
    {
        var pathResolver = DefaultStatePathResolver.CreateDefault();
        return new AppConfig
        {
            WebSocketPort = GetIntEnv("OMNUX_WS_PORT", DefaultWebSocketPort),
            TelegramBotToken = SecretLoader.ResolveApiKey(
                providerName: "telegram_bot_token",
                directEnvKey: "OMNUX_TELEGRAM_BOT_TOKEN",
                fileEnvKey: "OMNUX_TELEGRAM_BOT_TOKEN_FILE",
                keychainServiceEnvKey: "OMNUX_TELEGRAM_TOKEN_KEYCHAIN_SERVICE",
                keychainAccountEnvKey: "OMNUX_TELEGRAM_TOKEN_KEYCHAIN_ACCOUNT",
                defaultKeychainService: TelegramBotTokenService,
                defaultKeychainAccount: DefaultKeychainAccount
            ),
            TelegramChatId = SecretLoader.ResolveApiKey(
                providerName: "telegram_chat_id",
                directEnvKey: "OMNUX_TELEGRAM_CHAT_ID",
                fileEnvKey: "OMNUX_TELEGRAM_CHAT_ID_FILE",
                keychainServiceEnvKey: "OMNUX_TELEGRAM_CHAT_ID_KEYCHAIN_SERVICE",
                keychainAccountEnvKey: "OMNUX_TELEGRAM_CHAT_ID_KEYCHAIN_ACCOUNT",
                defaultKeychainService: TelegramChatIdService,
                defaultKeychainAccount: DefaultKeychainAccount
            ),
            TelegramAllowedUserId = GetStringEnv("OMNUX_TELEGRAM_ALLOWED_USER_ID", string.Empty),
            CopilotCliBinary = GetStringEnv("OMNUX_COPILOT_BIN", "gh"),
            CopilotDirectBinary = GetStringEnv("OMNUX_COPILOT_DIRECT_BIN", "copilot"),
            CopilotModel = GetStringEnv("OMNUX_COPILOT_MODEL", ModelRegistry.GetDefaultModel("copilot")),
            CodexBinary = GetStringEnv("OMNUX_CODEX_BIN", "codex"),
            CodexModel = GetStringEnv("OMNUX_CODEX_MODEL", ModelRegistry.GetDefaultModel("codex")),
            PythonBinary = GetStringEnv("OMNUX_PYTHON_BIN", ResolveDefaultPythonBinary()),
            SandboxExecutorPath = GetStringEnv("OMNUX_SANDBOX_EXECUTOR", ResolveDefaultSandboxExecutorPath()),
            DashboardIndexPath = GetStringEnv("OMNUX_DASHBOARD_INDEX", pathResolver.DashboardIndexPath),
            EnableDynamicCode = GetBoolEnv("OMNUX_ENABLE_DYNAMIC_CODE", false),
            GroqApiKey = SecretLoader.ResolveApiKey(
                providerName: "groq",
                directEnvKey: "OMNUX_GROQ_API_KEY",
                fileEnvKey: "OMNUX_GROQ_API_KEY_FILE",
                keychainServiceEnvKey: "OMNUX_GROQ_KEYCHAIN_SERVICE",
                keychainAccountEnvKey: "OMNUX_GROQ_KEYCHAIN_ACCOUNT",
                defaultKeychainService: GroqApiKeyService,
                defaultKeychainAccount: DefaultKeychainAccount
            ),
            GroqBaseUrl = GetStringEnv("OMNUX_GROQ_BASE_URL", "https://api.groq.com/openai/v1"),
            GroqModel = GetStringEnv("OMNUX_GROQ_MODEL", ModelRegistry.GetDefaultModel("groq")),
            GeminiApiKey = SecretLoader.ResolveApiKey(
                providerName: "gemini",
                directEnvKey: "OMNUX_GEMINI_API_KEY",
                fileEnvKey: "OMNUX_GEMINI_API_KEY_FILE",
                keychainServiceEnvKey: "OMNUX_GEMINI_KEYCHAIN_SERVICE",
                keychainAccountEnvKey: "OMNUX_GEMINI_KEYCHAIN_ACCOUNT",
                defaultKeychainService: GeminiApiKeyService,
                defaultKeychainAccount: DefaultKeychainAccount
            ),
            GeminiBaseUrl = GetStringEnv("OMNUX_GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta"),
            GeminiModel = GetStringEnv("OMNUX_GEMINI_MODEL", ModelRegistry.GetDefaultModel("gemini")),
            GeminiFlashModel = GetStringEnv("OMNUX_GEMINI_FLASH_MODEL", "gemini-3-flash-preview"),
            GeminiSearchModel = GetStringEnv(
                "OMNUX_GEMINI_FLASH_LITE_MODEL",
                "gemini-3.1-flash-lite"
            ),
            CerebrasBaseUrl = GetStringEnv("OMNUX_CEREBRAS_BASE_URL", "https://api.cerebras.ai/v1"),
            CerebrasModel = GetStringEnv("OMNUX_CEREBRAS_MODEL", ModelRegistry.GetDefaultModel("cerebras")),
            CerebrasTimeoutSec = GetIntEnv("OMNUX_CEREBRAS_TIMEOUT_SEC", 40),
            CerebrasKeychainService = GetStringEnv("OMNUX_CEREBRAS_KEYCHAIN_SERVICE", CerebrasApiKeyService),
            CerebrasKeychainAccount = GetStringEnv("OMNUX_CEREBRAS_KEYCHAIN_ACCOUNT", DefaultKeychainAccount),
            CerebrasApiKey = SecretLoader.ResolveApiKey(
                providerName: "cerebras",
                directEnvKey: "OMNUX_CEREBRAS_API_KEY",
                fileEnvKey: "OMNUX_CEREBRAS_API_KEY_FILE",
                keychainServiceEnvKey: "OMNUX_CEREBRAS_KEYCHAIN_SERVICE",
                keychainAccountEnvKey: "OMNUX_CEREBRAS_KEYCHAIN_ACCOUNT",
                defaultKeychainService: CerebrasApiKeyService,
                defaultKeychainAccount: DefaultKeychainAccount
            ),
            NvidiaBaseUrl = GetStringEnv("OMNUX_NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1"),
            NvidiaModel = GetStringEnv("OMNUX_NVIDIA_MODEL", ModelRegistry.GetDefaultModel("nvidia")),
            NvidiaTimeoutSec = GetIntEnv("OMNUX_NVIDIA_TIMEOUT_SEC", 180),
            NvidiaKeychainService = GetStringEnv("OMNUX_NVIDIA_KEYCHAIN_SERVICE", NvidiaApiKeyService),
            NvidiaKeychainAccount = GetStringEnv("OMNUX_NVIDIA_KEYCHAIN_ACCOUNT", DefaultKeychainAccount),
            NvidiaApiKey = SecretLoader.ResolveApiKey(
                providerName: "nvidia",
                directEnvKey: "OMNUX_NVIDIA_API_KEY",
                fileEnvKey: "OMNUX_NVIDIA_API_KEY_FILE",
                keychainServiceEnvKey: "OMNUX_NVIDIA_KEYCHAIN_SERVICE",
                keychainAccountEnvKey: "OMNUX_NVIDIA_KEYCHAIN_ACCOUNT",
                defaultKeychainService: NvidiaApiKeyService,
                defaultKeychainAccount: DefaultKeychainAccount
            ),
            CodexApiKey = SecretLoader.ResolveApiKey(
                providerName: "codex",
                directEnvKey: "OMNUX_CODEX_API_KEY",
                fileEnvKey: "OMNUX_CODEX_API_KEY_FILE",
                keychainServiceEnvKey: "OMNUX_CODEX_KEYCHAIN_SERVICE",
                keychainAccountEnvKey: "OMNUX_CODEX_KEYCHAIN_ACCOUNT",
                defaultKeychainService: CodexApiKeyService,
                defaultKeychainAccount: DefaultKeychainAccount
            ),
            SttProvider = GetStringEnv("OMNUX_STT_PROVIDER", string.Empty),
            SttBaseUrl = GetStringEnv("OMNUX_STT_BASE_URL", string.Empty),
            SttModel = GetStringEnv("OMNUX_STT_MODEL", string.Empty),
            SttApiKey = SecretLoader.ResolveApiKey(
                providerName: "stt",
                directEnvKey: "OMNUX_STT_API_KEY",
                fileEnvKey: "OMNUX_STT_API_KEY_FILE",
                keychainServiceEnvKey: "OMNUX_STT_KEYCHAIN_SERVICE",
                keychainAccountEnvKey: "OMNUX_STT_KEYCHAIN_ACCOUNT",
                defaultKeychainService: SttApiKeyService,
                defaultKeychainAccount: DefaultKeychainAccount
            ),
            GeminiInputPricePerMillionUsd = GetDecimalEnv("OMNUX_GEMINI_INPUT_PRICE_PER_MILLION_USD", 0.50m),
            GeminiOutputPricePerMillionUsd = GetDecimalEnv("OMNUX_GEMINI_OUTPUT_PRICE_PER_MILLION_USD", 3.00m),
            LlmUsageStatePath = GetStringEnv("OMNUX_LLM_USAGE_STATE_PATH", pathResolver.ResolveStateFilePath("llm_usage.json")),
            CopilotUsageStatePath = GetStringEnv("OMNUX_COPILOT_USAGE_STATE_PATH", pathResolver.ResolveStateFilePath("copilot_usage.json")),
            ConversationStatePath = GetStringEnv("OMNUX_CONVERSATION_STATE_PATH", pathResolver.ResolveStateFilePath("conversations.json")),
            AuthSessionStatePath = GetStringEnv("OMNUX_AUTH_SESSION_STATE_PATH", pathResolver.ResolveStateFilePath("auth_sessions.json")),
            MemoryNotesRootDir = GetStringEnv("OMNUX_MEMORY_NOTES_DIR", pathResolver.ResolveStateDirectoryPath("memory-notes")),
            ConversationCompressChars = GetIntEnv("OMNUX_CONVERSATION_COMPRESS_CHARS", 12000),
            ConversationKeepRecentMessages = GetIntEnv("OMNUX_CONVERSATION_KEEP_RECENT_MESSAGES", 16),
            ConversationHistoryMessages = GetIntEnv("OMNUX_CONVERSATION_HISTORY_MESSAGES", 18),
            CodeRunsRootDir = GetStringEnv("OMNUX_CODE_RUNS_DIR", pathResolver.ResolveStateDirectoryPath("code-runs")),
            RoutineRunsRootDir = GetStringEnv("OMNUX_ROUTINE_RUNS_DIR", Path.Combine(pathResolver.WorkspaceRootDir, "routines")),
            CodeExecutionTimeoutSec = GetIntEnv("OMNUX_CODE_EXEC_TIMEOUT_SEC", 120),
            WorkspaceRootDir = GetStringEnv("OMNUX_WORKSPACE_ROOT", pathResolver.WorkspaceRootDir),
            RoutineStatePath = GetStringEnv("OMNUX_ROUTINE_STATE_PATH", pathResolver.ResolveStateFilePath("routines.json")),
            RoutinePromptDir = GetStringEnv("OMNUX_ROUTINE_PROMPT_DIR", pathResolver.RoutinePromptDir),
            EnableAutoInstall = GetBoolEnv("OMNUX_ENABLE_AUTO_INSTALL", false),
            CodingAgentMaxIterations = GetIntEnv("OMNUX_CODING_AGENT_MAX_ITERATIONS", 6),
            CodingAgentMaxActionsPerIteration = GetIntEnv("OMNUX_CODING_AGENT_MAX_ACTIONS", 8),
            CodingCopilotMaxActionsPerIteration = GetIntEnv("OMNUX_CODING_COPILOT_MAX_ACTIONS", 2),
            CodingWorkspaceSnapshotMaxEntries = GetIntEnv("OMNUX_CODING_SNAPSHOT_MAX_ENTRIES", 80),
            CodingRecentLoopHistoryForCopilot = GetIntEnv("OMNUX_CODING_COPILOT_HISTORY", 2),
            CodingEnableOneShotUiClone = GetBoolEnv("OMNUX_CODING_ENABLE_ONESHOT_UI_CLONE", true),
            ChatMaxOutputTokens = GetIntEnv("OMNUX_CHAT_MAX_OUTPUT_TOKENS", 8192),
            CodingMaxOutputTokens = GetIntEnv("OMNUX_CODING_MAX_OUTPUT_TOKENS", 16384),
            LlmTimeoutSec = GetIntEnv("OMNUX_LLM_TIMEOUT_SEC", 20),
            SingleChatDefaultTimeoutSec = Math.Clamp(GetIntEnv("OMNUX_SINGLE_CHAT_DEFAULT_TIMEOUT_SEC", 34), 5, 600),
            CerebrasMinSingleChatTimeoutSec = Math.Clamp(GetIntEnv("OMNUX_CEREBRAS_MIN_SINGLE_CHAT_TIMEOUT_SEC", 40), 5, 600),
            NvidiaMinSingleChatTimeoutSec = Math.Clamp(GetIntEnv("OMNUX_NVIDIA_MIN_SINGLE_CHAT_TIMEOUT_SEC", 30), 5, 600),
            EnableFastWebPipeline = GetBoolEnv("OMNUX_FAST_WEB_PIPELINE", true),
            WebDecisionTimeoutMs = Math.Clamp(GetIntEnv("OMNUX_WEB_DECISION_TIMEOUT_MS", 700), 200, 5000),
            GeminiWebTimeoutMs = Math.Clamp(GetIntEnv("OMNUX_GEMINI_WEB_TIMEOUT_MS", 30000), 5000, 60000),
            WebDefaultNewsCount = Math.Clamp(GetIntEnv("OMNUX_WEB_DEFAULT_NEWS_COUNT", 10), 1, 20),
            WebDefaultListCount = Math.Clamp(GetIntEnv("OMNUX_WEB_DEFAULT_LIST_COUNT", 5), 1, 20),
            WebSocketMaxMessageBytes = Math.Clamp(GetIntEnv("OMNUX_WS_MAX_MESSAGE_BYTES", DefaultWebSocketMaxMessageBytes), 64 * 1024, 256 * 1024 * 1024),
            WebSocketCommandsPerMinute = Math.Clamp(GetIntEnv("OMNUX_WS_COMMANDS_PER_MINUTE", 30), 1, 1000),
            WebSocketMaxConnections = Math.Clamp(GetIntEnv("OMNUX_WS_MAX_CONNECTIONS", 16), 1, 1024),
            HttpMaxConcurrentRequests = Math.Clamp(GetIntEnv("OMNUX_HTTP_MAX_CONCURRENT_REQUESTS", 64), 1, 2048),
            MetricsPushIntervalSec = Math.Clamp(GetIntEnv("OMNUX_METRICS_PUSH_INTERVAL_SEC", 2), 1, 60),
            CommandMaxLength = Math.Clamp(GetIntEnv("OMNUX_COMMAND_MAX_LENGTH", 800), 1, 8192),
            AuditLogPath = GetStringEnv("OMNUX_AUDIT_LOG_PATH", pathResolver.ResolveStateFilePath("audit.log")),
            GuardAlertWebhookUrl = GetStringEnv("OMNUX_GUARD_ALERT_WEBHOOK_URL", string.Empty),
            GuardAlertLogCollectorUrl = GetStringEnv("OMNUX_GUARD_ALERT_LOG_COLLECTOR_URL", string.Empty),
            GuardAlertDispatchTimeoutMs = Math.Clamp(GetIntEnv("OMNUX_GUARD_ALERT_DISPATCH_TIMEOUT_MS", 3500), 500, 120000),
            GuardAlertDispatchMaxAttempts = Math.Clamp(GetIntEnv("OMNUX_GUARD_ALERT_DISPATCH_MAX_ATTEMPTS", 2), 1, 5),
            GuardRetryTimelineStatePath = GetStringEnv("OMNUX_GUARD_RETRY_TIMELINE_STATE_PATH", pathResolver.ResolveStateFilePath("guard_retry_timeline.json")),
            GatewayHealthStatePath = GetStringEnv("OMNUX_GATEWAY_HEALTH_STATE_PATH", pathResolver.ResolveStateFilePath("gateway_health.json")),
            GatewayStartupProbeStatePath = GetStringEnv("OMNUX_GATEWAY_STARTUP_PROBE_STATE_PATH", pathResolver.ResolveStateFilePath("gateway_startup_probe.json")),
            DashboardAccessStatePath = GetStringEnv("OMNUX_DASHBOARD_ACCESS_STATE_PATH", pathResolver.ResolveStateFilePath("dashboard_access.json")),
            ExternalDashboardEnabled = GetBoolEnv("OMNUX_EXTERNAL_DASHBOARD", false),
            EnableHealthEndpoint = GetBoolEnv("OMNUX_ENABLE_HEALTH_ENDPOINT", true),
            EnableGatewayStartupProbe = GetBoolEnv("OMNUX_GATEWAY_STARTUP_PROBE", true),
            GatewayStartupProbeDelayMs = Math.Max(0, GetIntEnv("OMNUX_GATEWAY_STARTUP_PROBE_DELAY_MS", 250)),
            // dotnet run 콜드스타트(JIT)에서는 endpoint readiness 단계만으로 8초를 거의 소진해
            // websocket 단계가 시작하자마자 취소되며 timeout 경고가 떴다. probe 는 advisory 라
            // 길게 잡아도 부팅을 막지 않는다 — 콜드스타트를 넉넉히 덮는 30초로 상향.
            GatewayStartupProbeTimeoutSec = Math.Max(3, GetIntEnv("OMNUX_GATEWAY_STARTUP_PROBE_TIMEOUT_SEC", 30)),
            GatewayStartupProbePollIntervalMs = Math.Max(50, GetIntEnv("OMNUX_GATEWAY_STARTUP_PROBE_POLL_INTERVAL_MS", 150)),
            GatewayStartupProbeMode = GetStringEnv("OMNUX_GATEWAY_STARTUP_PROBE_MODE", "live"),
            EnableLocalOtpFallback = GetBoolEnv("OMNUX_ENABLE_LOCAL_OTP_FALLBACK", true),
            KillAllowlistCsv = GetStringEnv("OMNUX_KILL_ALLOWLIST", string.Empty),
            DoctorTimeoutSeconds = Math.Max(3, GetIntEnv("OMNUX_DOCTOR_TIMEOUT_SECONDS", 15)),
            DoctorEnableSandboxSmoke = GetBoolEnv("OMNUX_DOCTOR_ENABLE_SANDBOX_SMOKE", true),
            DoctorWriteHistory = GetBoolEnv("OMNUX_DOCTOR_WRITE_HISTORY", true),
            RefactorEnableLsp = GetBoolEnv("OMNUX_REFACTOR_ENABLE_LSP", false),
            RefactorEnableAstGrep = GetBoolEnv("OMNUX_REFACTOR_ENABLE_AST_GREP", false),
            RefactorPreviewTtlMinutes = Math.Clamp(GetIntEnv("OMNUX_REFACTOR_PREVIEW_TTL_MINUTES", 120), 5, 1440),
            ProjectContextFallbackFilenamesCsv = GetStringEnv("OMNUX_PROJECT_CONTEXT_FALLBACK_FILENAMES", "TEAM_GUIDE.md,.agents.md"),
            ProjectContextMaxBytes = Math.Clamp(GetIntEnv("OMNUX_PROJECT_CONTEXT_MAX_BYTES", 65536), 4096, 262144)
        };
    }

    private static int GetIntEnv(string key, int defaultValue, params string[] aliases)
    {
        var value = GetEnvValue(key, aliases);
        return int.TryParse(value, out var parsed) ? parsed : defaultValue;
    }

    private static decimal GetDecimalEnv(string key, decimal defaultValue, params string[] aliases)
    {
        var value = GetEnvValue(key, aliases);
        return decimal.TryParse(value, out var parsed) ? parsed : defaultValue;
    }

    private static string GetStringEnv(string key, string defaultValue, params string[] aliases)
    {
        var value = GetEnvValue(key, aliases);
        return string.IsNullOrWhiteSpace(value) ? defaultValue : value;
    }

    private static bool GetBoolEnv(string key, bool defaultValue, params string[] aliases)
    {
        var value = GetEnvValue(key, aliases);
        if (string.IsNullOrWhiteSpace(value))
        {
            return defaultValue;
        }

        return value.Equals("1", StringComparison.OrdinalIgnoreCase)
            || value.Equals("true", StringComparison.OrdinalIgnoreCase)
            || value.Equals("yes", StringComparison.OrdinalIgnoreCase);
    }

    private static string? GetEnvValue(string key, params string[] aliases)
    {
        foreach (var candidate in BuildEnvKeyCandidates(key, aliases))
        {
            var value = Environment.GetEnvironmentVariable(candidate);
            if (!string.IsNullOrWhiteSpace(value))
            {
                return value;
            }
        }

        return null;
    }

    private static IEnumerable<string> BuildEnvKeyCandidates(string key, params string[] aliases)
    {
        yield return key;
        foreach (var alias in aliases)
        {
            if (!string.IsNullOrWhiteSpace(alias))
            {
                yield return alias;
            }
        }

    }

    private static string ResolveDefaultPythonBinary()
    {
        return OperatingSystem.IsWindows() ? "python" : "python3";
    }

    private static string ResolveDefaultStateFilePath(string fileName)
    {
        return DefaultStatePathResolver.CreateDefault().ResolveStateFilePath(fileName);
    }

    private static string ResolveDefaultStateDirectoryPath(string directoryName)
    {
        return DefaultStatePathResolver.CreateDefault().ResolveStateDirectoryPath(directoryName);
    }

    private static string ResolveDefaultDashboardIndexPath()
    {
        return DefaultStatePathResolver.CreateDefault().DashboardIndexPath;
    }

    private static string ResolveDefaultSandboxExecutorPath()
    {
        var baseDir = AppContext.BaseDirectory;
        var cwd = Directory.GetCurrentDirectory();
        var candidates = new[]
        {
            Path.GetFullPath(Path.Combine(baseDir, "../../../../omnux-sandbox/executor.py")),
            Path.GetFullPath(Path.Combine(cwd, "apps/omnux-sandbox/executor.py")),
            Path.GetFullPath(Path.Combine(cwd, "omnux-sandbox/executor.py")),
            Path.GetFullPath(Path.Combine(cwd, "../omnux-sandbox/executor.py")),
            Path.GetFullPath(Path.Combine(cwd, "../apps/omnux-sandbox/executor.py"))
        };

        foreach (var candidate in candidates)
        {
            if (File.Exists(candidate))
            {
                return candidate;
            }
        }

        return candidates[0];
    }

    private static string ResolveDefaultWorkspaceRootDir()
    {
        return DefaultStatePathResolver.CreateDefault().WorkspaceRootDir;
    }
}

public sealed record ProviderOptions(
    string CopilotCliBinary,
    string CopilotDirectBinary,
    string CopilotModel,
    string CodexBinary,
    string CodexModel,
    string PythonBinary,
    string? GroqApiKey,
    string GroqBaseUrl,
    string GroqModel,
    string? GeminiApiKey,
    string GeminiBaseUrl,
    string GeminiModel,
    string GeminiFlashModel,
    string GeminiSearchModel,
    string CerebrasBaseUrl,
    string CerebrasModel,
    int CerebrasTimeoutSec,
    string CerebrasKeychainService,
    string CerebrasKeychainAccount,
    string? CerebrasApiKey,
    string NvidiaBaseUrl,
    string NvidiaModel,
    int NvidiaTimeoutSec,
    string NvidiaKeychainService,
    string NvidiaKeychainAccount,
    string? NvidiaApiKey,
    string? CodexApiKey,
    string SttProvider,
    string SttBaseUrl,
    string SttModel,
    string? SttApiKey,
    decimal GeminiInputPricePerMillionUsd,
    decimal GeminiOutputPricePerMillionUsd
);

public sealed record PathOptions(
    string DashboardIndexPath,
    string LlmUsageStatePath,
    string CopilotUsageStatePath,
    string ConversationStatePath,
    string AuthSessionStatePath,
    string MemoryNotesRootDir,
    string CodeRunsRootDir,
    string RoutineRunsRootDir,
    string WorkspaceRootDir,
    string RoutineStatePath,
    string RoutinePromptDir,
    string AuditLogPath,
    string GuardRetryTimelineStatePath,
    string GatewayHealthStatePath,
    string GatewayStartupProbeStatePath,
    string DashboardAccessStatePath,
    string SandboxExecutorPath
);

public sealed record GatewayOptions(
    int WebSocketPort,
    int WebSocketCommandsPerMinute,
    int WebSocketMaxMessageBytes,
    int WebSocketMaxConnections,
    int HttpMaxConcurrentRequests,
    bool EnableHealthEndpoint,
    bool EnableGatewayStartupProbe,
    int GatewayStartupProbeDelayMs,
    int GatewayStartupProbeTimeoutSec,
    int GatewayStartupProbePollIntervalMs,
    string GatewayStartupProbeMode,
    int CommandMaxLength,
    int MetricsPushIntervalSec
);

public sealed record SecurityOptions(
    string? TelegramAllowedUserId,
    bool EnableDynamicCode,
    bool ExternalDashboardEnabled,
    bool EnableLocalOtpFallback,
    string KillAllowlistCsv,
    string GuardAlertWebhookUrl,
    string GuardAlertLogCollectorUrl,
    int GuardAlertDispatchTimeoutMs,
    int GuardAlertDispatchMaxAttempts
);

public sealed record DoctorOptions(
    int DoctorTimeoutSeconds,
    bool DoctorEnableSandboxSmoke,
    bool DoctorWriteHistory
);

public sealed record RefactorOptions(
    bool RefactorEnableLsp,
    bool RefactorEnableAstGrep,
    int RefactorPreviewTtlMinutes,
    string ProjectContextFallbackFilenamesCsv,
    int ProjectContextMaxBytes
);

public sealed record ContextOptions(
    int ConversationCompressChars,
    int ConversationKeepRecentMessages,
    int ConversationHistoryMessages,
    int CodingAgentMaxIterations,
    int CodingAgentMaxActionsPerIteration,
    int CodingCopilotMaxActionsPerIteration,
    int CodingWorkspaceSnapshotMaxEntries,
    int CodingRecentLoopHistoryForCopilot,
    bool CodingEnableOneShotUiClone,
    int ChatMaxOutputTokens,
    int CodingMaxOutputTokens,
    int LlmTimeoutSec,
    int SingleChatDefaultTimeoutSec,
    int CerebrasMinSingleChatTimeoutSec,
    int NvidiaMinSingleChatTimeoutSec,
    bool EnableFastWebPipeline,
    int WebDecisionTimeoutMs,
    int GeminiWebTimeoutMs,
    int WebDefaultNewsCount,
    int WebDefaultListCount,
    int CommandMaxLength,
    int MetricsPushIntervalSec
);

public sealed record ExecutionOptions(
    int CodeExecutionTimeoutSec,
    bool EnableAutoInstall
);
