using System.Text.RegularExpressions;

namespace Omnux.Middleware;

internal interface ICodingCommandGateway
{
    string? TryBuildMultiSkillRejectionResponse(string rawInput);
    SessionContext PrepareSessionContext(
        string scope,
        string mode,
        string? conversationId,
        string? conversationTitle,
        string? project,
        string? category,
        IReadOnlyList<string>? tags,
        IReadOnlyList<string>? linkedMemoryNotes,
        string? source
    );
    CodingRunResult? TryHandleBrowserCodingIntent(
        SessionContext session,
        string rawInput,
        string mode,
        string codingRunRoot,
        string language
    );
    TaskCategory ResolveCodingTaskCategory(string? categoryHint, string? input);
    string NormalizeProvider(string? provider, bool allowAuto);
    Task<string> ResolveCategoryProviderAsync(
        TaskCategory category,
        string? requestedProvider,
        IReadOnlyDictionary<string, string?>? selectionByProvider,
        CancellationToken cancellationToken,
        string reason
    );
    string ResolveModelForCategory(TaskCategory category, string provider, string? modelOverride);
    string ResolveModel(string provider, string? model);
    string? ResolvePromptOrUiSkillName(string? explicitSkillName, string input);
    Task<InputPreparationResult> PrepareInputForProviderAsync(
        string input,
        string provider,
        string? model,
        IReadOnlyList<InputAttachment>? attachments,
        IReadOnlyList<string>? webUrls,
        bool webSearchEnabled,
        bool allowProviderSpecificPreparation,
        CancellationToken cancellationToken,
        string source = "web",
        string? sessionKey = null,
        string? conversationId = null,
        string? requestedSkillName = null,
        string? requestedSkillScope = null
    );
    Task<InputPreparationResult> PrepareSharedInputAsync(
        string input,
        IReadOnlyList<InputAttachment>? attachments,
        IReadOnlyList<string>? webUrls,
        bool webSearchEnabled,
        CancellationToken cancellationToken,
        string source = "web",
        string? sessionKey = null,
        string? conversationId = null,
        string? requestedSkillName = null,
        string? requestedSkillScope = null
    );
    string ApplySelectedSkillToPrompt(string input, string? skillName, string? skillScope);
    string? ResolveEffectiveSkillNameForThread(string? requestedSkillName, string? conversationId);
    Task<string> BuildThinkPlusContextAsync(
        string input,
        string source,
        CancellationToken cancellationToken,
        string? effectiveSkillName
    );
    string BuildContextualInput(
        string conversationId,
        string input,
        IReadOnlyList<string>? requestMemoryNotes,
        bool includeLocalTimeHint = false,
        string? contextDecisionInput = null
    );
    (IReadOnlyList<SearchCitationSentenceMapping> Mappings, SearchCitationValidationSummary Validation) BuildAndLogCitationMappings(
        string source,
        string context,
        IReadOnlyList<SearchCitationReference>? citations,
        params (string Segment, string Text)[] segments
    );
    SearchAnswerGuardFailure? BuildCitationValidationGuardFailure(SearchCitationValidationSummary? validation);
    void LogCitationValidationGuardBlocked(string source, string context, SearchAnswerGuardFailure failure);
    string BuildCitationValidationBlockedResponseText(SearchAnswerGuardFailure? failure = null);
    Task EnsureConversationTitleFromFirstTurnAsync(
        string conversationId,
        string provider,
        string model,
        CancellationToken cancellationToken
    );
    Task<MemoryNoteSaveResult?> MaybeCompressConversationAsync(
        string conversationId,
        string scope,
        string provider,
        string model,
        CancellationToken cancellationToken
    );
    Task<IReadOnlyList<string>> GetAvailableProvidersAsync(CancellationToken cancellationToken);
    Task<IReadOnlyDictionary<string, ProviderAvailability>> GetProviderAvailabilityMapAsync(CancellationToken cancellationToken);
    bool IsDisabledModelSelection(string? selection);
    bool IsUsableWorkerResult(
        LlmSingleChatResult workerResult,
        IReadOnlyDictionary<string, ProviderAvailability> availabilityByProvider,
        IReadOnlyDictionary<string, string?> selectionByProvider
    );
    string ResolveProviderForAggregation(
        TaskCategory category,
        string requestedProvider,
        IReadOnlyList<LlmSingleChatResult> successfulWorkers,
        IReadOnlyDictionary<string, ProviderAvailability> availabilityByProvider,
        IReadOnlyDictionary<string, string?> selectionByProvider,
        bool allowProviderWithoutWorkerFallback
    );
    Task<LlmSingleChatResult> GenerateByProviderSafeAsync(
        string provider,
        string? model,
        string input,
        CancellationToken cancellationToken,
        int? maxOutputTokens = null,
        bool useRawCodexPrompt = false,
        string? codexWorkingDirectoryOverride = null,
        bool optimizeCodexForCoding = false,
        int? timeoutOverrideSeconds = null,
        Action<string>? streamCallback = null
    );
    string TrimForOutput(string text, int maxLength);
    bool ContainsAny(string text, params string[] patterns);
}

public sealed partial class CodingApplicationService : ICodingApplicationService
{
    private const string DefaultCopilotModel = "gpt-5-mini";
    private const string DefaultCerebrasModel = "gpt-oss-120b";
    private const string LegacyCerebrasLlamaModel = "llama3.1-8b";
    private static readonly Regex PythonModuleNotFoundRegex = new("ModuleNotFoundError:\\s+No module named ['\\\"](?<module>[^'\\\"]+)['\\\"]", RegexOptions.Compiled);
    private static readonly Regex PythonImportErrorRegex = new("ImportError:\\s+No module named ['\\\"]?(?<module>[A-Za-z0-9_.-]+)['\\\"]?", RegexOptions.Compiled);
    private static readonly Regex NodeModuleNotFoundRegex = new("Cannot find module ['\\\"](?<module>[^'\\\"]+)['\\\"]|ERR_MODULE_NOT_FOUND[^'\\\"]*['\\\"](?<module2>[^'\\\"]+)['\\\"]", RegexOptions.Compiled | RegexOptions.IgnoreCase);
    private static readonly Regex CommandNotFoundRegex = new("command not found:\\s*(?<cmd>[A-Za-z0-9][A-Za-z0-9+._-]{1,63})|(?<cmd2>[A-Za-z0-9][A-Za-z0-9+._-]{1,63}):\\s*(?:command\\s+not\\s+found|not\\s+found)", RegexOptions.Compiled | RegexOptions.IgnoreCase);
    private static readonly Regex PythonImportRegex = new("^\\s*import\\s+(?<mods>[A-Za-z0-9_.,\\s]+)", RegexOptions.Compiled | RegexOptions.Multiline);
    private static readonly Regex PythonFromImportRegex = new("^\\s*from\\s+(?<mod>[A-Za-z0-9_.]+)\\s+import\\s+", RegexOptions.Compiled | RegexOptions.Multiline);
    private static readonly Regex NodeImportRegex = new("from\\s+['\\\"](?<mod>[^'\\\"]+)['\\\"]|require\\(\\s*['\\\"](?<mod2>[^'\\\"]+)['\\\"]\\s*\\)|import\\(\\s*['\\\"](?<mod3>[^'\\\"]+)['\\\"]\\s*\\)", RegexOptions.Compiled);
    private static readonly Regex ShellTokenRegex = new("'(?<sq>[^']*)'|\"(?<dq>[^\"]*)\"|(?<bare>[^\\s]+)", RegexOptions.Compiled);
    private static readonly Dictionary<string, string> PythonCliPackageMap = new(StringComparer.OrdinalIgnoreCase)
    {
        ["black"] = "black",
        ["django-admin"] = "django",
        ["flask"] = "flask",
        ["gradio"] = "gradio",
        ["gunicorn"] = "gunicorn",
        ["jupyter"] = "jupyterlab",
        ["pytest"] = "pytest",
        ["ruff"] = "ruff",
        ["streamlit"] = "streamlit",
        ["uvicorn"] = "uvicorn"
    };
    private static readonly Dictionary<string, string> NodeCliPackageMap = new(StringComparer.OrdinalIgnoreCase)
    {
        ["next"] = "next",
        ["nodemon"] = "nodemon",
        ["parcel"] = "parcel",
        ["react-scripts"] = "react-scripts",
        ["serve"] = "serve",
        ["ts-node"] = "ts-node",
        ["tsx"] = "tsx",
        ["vite"] = "vite",
        ["webpack"] = "webpack",
        ["webpack-dev-server"] = "webpack-dev-server"
    };
    private static readonly HashSet<string> PythonCommandPrefixes = new(StringComparer.OrdinalIgnoreCase)
    {
        "black","flask","gradio","gunicorn","jupyter","pip","pip3","py","py.test","pytest","python","python3","ruff","streamlit","uvicorn"
    };
    private static readonly HashSet<string> NodeCommandPrefixes = new(StringComparer.OrdinalIgnoreCase)
    {
        "next","node","nodemon","npm","npx","parcel","pnpm","react-scripts","serve","ts-node","tsx","vite","webpack","webpack-dev-server","yarn"
    };
    private static readonly Dictionary<string, string> PythonModulePackageMap = new(StringComparer.OrdinalIgnoreCase)
    {
        ["cv2"] = "opencv-python",
        ["PIL"] = "pillow",
        ["yaml"] = "pyyaml",
        ["sklearn"] = "scikit-learn",
        ["bs4"] = "beautifulsoup4",
        ["dotenv"] = "python-dotenv",
        ["Crypto"] = "pycryptodome"
    };
    private static readonly HashSet<string> PythonStdlibModules = new(StringComparer.OrdinalIgnoreCase)
    {
        "abc","argparse","array","asyncio","base64","binascii","bisect","calendar","cmath","collections","concurrent","contextlib",
        "copy","csv","ctypes","curses","dataclasses","datetime","decimal","difflib","dis","email","enum","errno","faulthandler","fnmatch",
        "fractions","functools","gc","getopt","getpass","gettext","glob","gzip","hashlib","heapq","hmac","html","http","imaplib",
        "importlib","inspect","io","ipaddress","itertools","json","linecache","locale","logging","lzma","math","mimetypes","multiprocessing",
        "numbers","operator","os","pathlib","pickle","pkgutil","platform","plistlib","pprint","queue","random","re","sched","secrets","select",
        "selectors","shelve","shlex","shutil","signal","site","socket","sqlite3","ssl","stat","statistics","string","stringprep","struct",
        "subprocess","sys","sysconfig","tarfile","tempfile","textwrap","threading","time","timeit","tkinter","_tkinter","tokenize","traceback","turtle","types","typing",
        "unittest","urllib","uuid","venv","warnings","wave","weakref","webbrowser","xml","xmlrpc","zipfile","zoneinfo","zlib"
    };
    private static readonly HashSet<string> NodeBuiltinModules = new(StringComparer.OrdinalIgnoreCase)
    {
        "assert","buffer","child_process","cluster","console","constants","crypto","dgram","diagnostics_channel","dns","domain","events",
        "fs","http","http2","https","inspector","module","net","os","path","perf_hooks","process","punycode","querystring","readline",
        "repl","stream","string_decoder","timers","tls","tty","url","util","v8","vm","wasi","worker_threads","zlib"
    };
    private static readonly HashSet<string> ProgramInstallDenyList = new(StringComparer.OrdinalIgnoreCase)
    {
        "bash","sh","zsh","sudo","env","python","python3","pip","pip3","node","npm","npx","pnpm","yarn","dotnet","java","javac","kotlinc","cc","c++","gcc","g++","git","ls","cat","echo","pwd"
    };
    private static readonly Regex ExplicitShellExecutionCommandRegex = new(
        "(?<cmd>node|python3?|bash)\\s+(?<path>(?:\\.{0,2}[\\\\/])?(?:[\\w.-]+[\\\\/])*(?:[\\w.-]+\\.)+(?:py|js|mjs|cjs|sh))",
        RegexOptions.Compiled | RegexOptions.IgnoreCase
    );
    private static readonly Regex ExplicitExecutionTargetRegex = new(
        "(?<path>(?:\\.{0,2}[\\\\/])?(?:[\\w.-]+[\\\\/])*(?:[\\w.-]+\\.)+(?:py|js|mjs|cjs|sh))\\s*(?:를|을)?\\s*(?:직접\\s*)?(?:실행(?:\\s*시|\\s*해서|\\s*해|\\s*결과|\\s*후)?|run\\b)",
        RegexOptions.Compiled | RegexOptions.IgnoreCase
    );

    private readonly ProviderOptions _providers;
    private readonly PathOptions _paths;
    private readonly SecurityOptions _security;
    private readonly ContextOptions _context;
    private readonly ExecutionOptions _execution;
    private readonly IConversationStore _conversationStore;
    private readonly IRunArtifactStore _runArtifactStore;
    private readonly UniversalCodeRunner _codeRunner;
    private readonly AuditLogger _auditLogger;
    private readonly ICodingCommandGateway _gateway;

    internal CodingApplicationService(
        ProviderOptions providers,
        PathOptions paths,
        SecurityOptions security,
        ContextOptions context,
        ExecutionOptions execution,
        IConversationStore conversationStore,
        IRunArtifactStore runArtifactStore,
        UniversalCodeRunner codeRunner,
        AuditLogger auditLogger,
        ICodingCommandGateway gateway
    )
    {
        _providers = providers;
        _paths = paths;
        _security = security;
        _context = context;
        _execution = execution;
        _conversationStore = conversationStore;
        _runArtifactStore = runArtifactStore;
        _codeRunner = codeRunner;
        _auditLogger = auditLogger;
        _gateway = gateway;
    }

    private string? TryBuildMultiSkillRejectionResponse(string rawInput) =>
        _gateway.TryBuildMultiSkillRejectionResponse(rawInput);

    private SessionContext PrepareSessionContext(
        string scope,
        string mode,
        string? conversationId,
        string? conversationTitle,
        string? project,
        string? category,
        IReadOnlyList<string>? tags,
        IReadOnlyList<string>? linkedMemoryNotes,
        string? source
    ) => _gateway.PrepareSessionContext(
        scope,
        mode,
        conversationId,
        conversationTitle,
        project,
        category,
        tags,
        linkedMemoryNotes,
        source
    );

    private CodingRunResult? TryHandleBrowserCodingIntent(
        SessionContext session,
        string rawInput,
        string mode,
        string codingRunRoot,
        string language
    ) => _gateway.TryHandleBrowserCodingIntent(session, rawInput, mode, codingRunRoot, language);

    private TaskCategory ResolveCodingTaskCategory(string? categoryHint, string? input) =>
        _gateway.ResolveCodingTaskCategory(categoryHint, input);

    private string NormalizeProvider(string? provider, bool allowAuto) =>
        _gateway.NormalizeProvider(provider, allowAuto);

    private Task<string> ResolveCategoryProviderAsync(
        TaskCategory category,
        string? requestedProvider,
        IReadOnlyDictionary<string, string?>? selectionByProvider,
        CancellationToken cancellationToken,
        string reason
    ) => _gateway.ResolveCategoryProviderAsync(category, requestedProvider, selectionByProvider, cancellationToken, reason);

    private string ResolveModelForCategory(TaskCategory category, string provider, string? modelOverride) =>
        _gateway.ResolveModelForCategory(category, provider, modelOverride);

    private string ResolveModel(string provider, string? model) =>
        _gateway.ResolveModel(provider, model);

    private string ResolveProviderModel(string provider, string? model) =>
        _gateway.ResolveModel(provider, model);

    private string? ResolvePromptOrUiSkillName(string? explicitSkillName, string input) =>
        _gateway.ResolvePromptOrUiSkillName(explicitSkillName, input);

    private Task<InputPreparationResult> PrepareInputForProviderAsync(
        string input,
        string provider,
        string? model,
        IReadOnlyList<InputAttachment>? attachments,
        IReadOnlyList<string>? webUrls,
        bool webSearchEnabled,
        bool allowProviderSpecificPreparation,
        CancellationToken cancellationToken,
        string source = "web",
        string? sessionKey = null,
        string? conversationId = null,
        string? requestedSkillName = null,
        string? requestedSkillScope = null
    ) => _gateway.PrepareInputForProviderAsync(
        input,
        provider,
        model,
        attachments,
        webUrls,
        webSearchEnabled,
        allowProviderSpecificPreparation,
        cancellationToken,
        source,
        sessionKey,
        conversationId,
        requestedSkillName,
        requestedSkillScope
    );

    private Task<InputPreparationResult> PrepareSharedInputAsync(
        string input,
        IReadOnlyList<InputAttachment>? attachments,
        IReadOnlyList<string>? webUrls,
        bool webSearchEnabled,
        CancellationToken cancellationToken,
        string source = "web",
        string? sessionKey = null,
        string? conversationId = null,
        string? requestedSkillName = null,
        string? requestedSkillScope = null
    ) => _gateway.PrepareSharedInputAsync(
        input,
        attachments,
        webUrls,
        webSearchEnabled,
        cancellationToken,
        source,
        sessionKey,
        conversationId,
        requestedSkillName,
        requestedSkillScope
    );

    private string ApplySelectedSkillToPrompt(string input, string? skillName, string? skillScope) =>
        _gateway.ApplySelectedSkillToPrompt(input, skillName, skillScope);

    private string? ResolveEffectiveSkillNameForThread(string? requestedSkillName, string? conversationId) =>
        _gateway.ResolveEffectiveSkillNameForThread(requestedSkillName, conversationId);

    private Task<string> BuildThinkPlusContextAsync(
        string input,
        string source,
        CancellationToken cancellationToken,
        string? effectiveSkillName
    ) => _gateway.BuildThinkPlusContextAsync(input, source, cancellationToken, effectiveSkillName);

    private string BuildContextualInput(
        string conversationId,
        string input,
        IReadOnlyList<string>? requestMemoryNotes,
        bool includeLocalTimeHint = false,
        string? contextDecisionInput = null
    ) => _gateway.BuildContextualInput(conversationId, input, requestMemoryNotes, includeLocalTimeHint, contextDecisionInput);

    private (IReadOnlyList<SearchCitationSentenceMapping> Mappings, SearchCitationValidationSummary Validation) BuildAndLogCitationMappings(
        string source,
        string context,
        IReadOnlyList<SearchCitationReference>? citations,
        params (string Segment, string Text)[] segments
    ) => _gateway.BuildAndLogCitationMappings(source, context, citations, segments);

    private SearchAnswerGuardFailure? BuildCitationValidationGuardFailure(SearchCitationValidationSummary? validation) =>
        _gateway.BuildCitationValidationGuardFailure(validation);

    private void LogCitationValidationGuardBlocked(string source, string context, SearchAnswerGuardFailure failure) =>
        _gateway.LogCitationValidationGuardBlocked(source, context, failure);

    private string BuildCitationValidationBlockedResponseText(SearchAnswerGuardFailure? failure = null) =>
        _gateway.BuildCitationValidationBlockedResponseText(failure);

    private Task EnsureConversationTitleFromFirstTurnAsync(
        string conversationId,
        string provider,
        string model,
        CancellationToken cancellationToken
    ) => _gateway.EnsureConversationTitleFromFirstTurnAsync(conversationId, provider, model, cancellationToken);

    private Task<MemoryNoteSaveResult?> MaybeCompressConversationAsync(
        string conversationId,
        string scope,
        string provider,
        string model,
        CancellationToken cancellationToken
    ) => _gateway.MaybeCompressConversationAsync(conversationId, scope, provider, model, cancellationToken);

    private Task<IReadOnlyList<string>> GetAvailableProvidersAsync(CancellationToken cancellationToken) =>
        _gateway.GetAvailableProvidersAsync(cancellationToken);

    private Task<IReadOnlyDictionary<string, ProviderAvailability>> GetProviderAvailabilityMapAsync(CancellationToken cancellationToken) =>
        _gateway.GetProviderAvailabilityMapAsync(cancellationToken);

    private bool IsDisabledModelSelection(string? selection) =>
        _gateway.IsDisabledModelSelection(selection);

    private bool IsUsableWorkerResult(
        LlmSingleChatResult workerResult,
        IReadOnlyDictionary<string, ProviderAvailability> availabilityByProvider,
        IReadOnlyDictionary<string, string?> selectionByProvider
    ) => _gateway.IsUsableWorkerResult(workerResult, availabilityByProvider, selectionByProvider);

    private string ResolveProviderForAggregation(
        TaskCategory category,
        string requestedProvider,
        IReadOnlyList<LlmSingleChatResult> successfulWorkers,
        IReadOnlyDictionary<string, ProviderAvailability> availabilityByProvider,
        IReadOnlyDictionary<string, string?> selectionByProvider,
        bool allowProviderWithoutWorkerFallback
    ) => _gateway.ResolveProviderForAggregation(
        category,
        requestedProvider,
        successfulWorkers,
        availabilityByProvider,
        selectionByProvider,
        allowProviderWithoutWorkerFallback
    );

    private Task<LlmSingleChatResult> GenerateByProviderSafeAsync(
        string provider,
        string? model,
        string input,
        CancellationToken cancellationToken,
        int? maxOutputTokens = null,
        bool useRawCodexPrompt = false,
        string? codexWorkingDirectoryOverride = null,
        bool optimizeCodexForCoding = false,
        int? timeoutOverrideSeconds = null,
        Action<string>? streamCallback = null
    ) => _gateway.GenerateByProviderSafeAsync(
        provider,
        model,
        input,
        cancellationToken,
        maxOutputTokens,
        useRawCodexPrompt,
        codexWorkingDirectoryOverride,
        optimizeCodexForCoding,
        timeoutOverrideSeconds,
        streamCallback
    );

    private static IReadOnlyDictionary<string, string?> BuildProviderSelectionMap(
        string? groqModel,
        string? geminiModel,
        string? cerebrasModel,
        string? copilotModel,
        string? codexModel,
        string? nvidiaModel = null
    )
    {
        return new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase)
        {
            ["gemini"] = geminiModel,
            ["groq"] = groqModel,
            ["cerebras"] = cerebrasModel,
            ["nvidia"] = nvidiaModel,
            ["copilot"] = copilotModel,
            ["codex"] = codexModel
        };
    }

    private static string? NormalizeModelSelection(string? model)
    {
        if (string.IsNullOrWhiteSpace(model))
        {
            return null;
        }

        var trimmed = model.Trim();
        if (trimmed.Equals(LegacyCerebrasLlamaModel, StringComparison.OrdinalIgnoreCase))
        {
            return DefaultCerebrasModel;
        }

        return string.Equals(trimmed, "none", StringComparison.OrdinalIgnoreCase) ? null : trimmed;
    }

    private bool IsDynamicCodeExecutionEnabled()
    {
        return _security.EnableDynamicCode;
    }

    private static string BuildDynamicCodeDisabledMessage()
    {
        return "dynamic code is disabled. set OMNUX_ENABLE_DYNAMIC_CODE=true";
    }

    private static CodingWorkerResult BuildUnsupportedCodingWorkerResult(
        string provider,
        string model,
        string language,
        string message,
        string role = ""
    )
    {
        var execution = new CodeExecutionResult(
            language,
            "-",
            "-",
            "(none)",
            0,
            string.Empty,
            message,
            "skipped"
        );
        return new CodingWorkerResult(
            provider,
            model,
            language,
            string.Empty,
            message,
            execution,
            Array.Empty<string>(),
            role,
            message
        );
    }

    private static string TrimForOutput(string? text, int maxLength = 3500)
    {
        var value = text ?? string.Empty;
        if (value.Length <= maxLength)
        {
            return value;
        }

        return value[..Math.Max(0, maxLength)] + "\n...(truncated)";
    }

    private static bool ContainsAny(string text, params string[] patterns)
    {
        return patterns.Any(pattern => text.Contains(pattern, StringComparison.OrdinalIgnoreCase));
    }
}
