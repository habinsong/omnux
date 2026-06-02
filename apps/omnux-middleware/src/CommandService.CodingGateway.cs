namespace Omnux.Middleware;

public sealed partial class CommandService
{
    private ICodingApplicationService? _codingAppService;

    internal void ConfigureCodingApplicationService(ICodingApplicationService codingAppService)
    {
        _codingAppService = codingAppService;
    }

    private ICodingApplicationService CodingAppService =>
        _codingAppService
        ?? throw new InvalidOperationException("Coding application service가 구성되지 않았습니다.");

    internal ICodingCommandGateway CreateCodingCommandGateway()
    {
        return new CodingCommandGatewayAdapter(this);
    }

    private string ResolveWorkspaceRoot()
    {
        return string.IsNullOrWhiteSpace(_paths.WorkspaceRootDir)
            ? Path.Combine(AppContext.BaseDirectory, "workspace")
            : Path.GetFullPath(_paths.WorkspaceRootDir);
    }

    private static bool IsPathUnderRoot(string candidatePath, string rootPath)
    {
        var candidate = Path.GetFullPath(candidatePath)
            .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        var root = Path.GetFullPath(rootPath)
            .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        return candidate.Equals(root, StringComparison.OrdinalIgnoreCase)
               || candidate.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)
               || candidate.StartsWith(root + Path.AltDirectorySeparatorChar, StringComparison.OrdinalIgnoreCase);
    }

    private static string ResolveWorkspacePath(string workspaceRoot, string? relativeOrAbsolutePath)
    {
        if (string.IsNullOrWhiteSpace(relativeOrAbsolutePath))
        {
            throw new InvalidOperationException("path is required");
        }

        var candidate = relativeOrAbsolutePath.Trim();
        if (Path.IsPathFullyQualified(candidate))
        {
            var fullPath = Path.GetFullPath(candidate);
            if (!IsPathUnderRoot(fullPath, workspaceRoot))
            {
                throw new InvalidOperationException("workspace 밖 경로는 사용할 수 없습니다.");
            }

            return fullPath;
        }

        var resolved = Path.GetFullPath(Path.Combine(workspaceRoot, candidate));
        if (!IsPathUnderRoot(resolved, workspaceRoot))
        {
            throw new InvalidOperationException("workspace 밖 경로는 사용할 수 없습니다.");
        }

        return resolved;
    }

    private sealed class CodingCommandGatewayAdapter : ICodingCommandGateway
    {
        private CommandService Owner { get; }

        public CodingCommandGatewayAdapter(CommandService owner)
        {
            Owner = owner;
        }

    string? ICodingCommandGateway.TryBuildMultiSkillRejectionResponse(string rawInput)
    {
        return Owner.TryBuildMultiSkillRejectionResponse(rawInput);
    }

    SessionContext ICodingCommandGateway.PrepareSessionContext(
        string scope,
        string mode,
        string? conversationId,
        string? conversationTitle,
        string? project,
        string? category,
        IReadOnlyList<string>? tags,
        IReadOnlyList<string>? linkedMemoryNotes,
        string? source
    )
    {
        return Owner.PrepareSessionContext(
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
    }

    CodingRunResult? ICodingCommandGateway.TryHandleBrowserCodingIntent(
        SessionContext session,
        string rawInput,
        string mode,
        string codingRunRoot,
        string language
    )
    {
        return Owner.TryHandleBrowserCodingIntent(session, rawInput, mode, codingRunRoot, language);
    }

    TaskCategory ICodingCommandGateway.ResolveCodingTaskCategory(string? categoryHint, string? input)
    {
        return Owner.ResolveCodingTaskCategory(categoryHint, input);
    }

    string ICodingCommandGateway.NormalizeProvider(string? provider, bool allowAuto)
    {
        return NormalizeProvider(provider, allowAuto);
    }

    Task<string> ICodingCommandGateway.ResolveCategoryProviderAsync(
        TaskCategory category,
        string? requestedProvider,
        IReadOnlyDictionary<string, string?>? selectionByProvider,
        CancellationToken cancellationToken,
        string reason
    )
    {
        return Owner.ResolveCategoryProviderAsync(category, requestedProvider, selectionByProvider, cancellationToken, reason);
    }

    string ICodingCommandGateway.ResolveModelForCategory(TaskCategory category, string provider, string? modelOverride)
    {
        return Owner.ResolveModelForCategory(category, provider, modelOverride);
    }

    string ICodingCommandGateway.ResolveModel(string provider, string? model)
    {
        return Owner.ResolveModel(provider, model);
    }

    string? ICodingCommandGateway.ResolvePromptOrUiSkillName(string? explicitSkillName, string input)
    {
        return Owner.ResolvePromptOrUiSkillName(explicitSkillName, input);
    }

    Task<InputPreparationResult> ICodingCommandGateway.PrepareInputForProviderAsync(
        string input,
        string provider,
        string? model,
        IReadOnlyList<InputAttachment>? attachments,
        IReadOnlyList<string>? webUrls,
        bool webSearchEnabled,
        bool allowProviderSpecificPreparation,
        CancellationToken cancellationToken,
        string source,
        string? sessionKey,
        string? conversationId,
        string? requestedSkillName,
        string? requestedSkillScope
    )
    {
        return Owner.PrepareInputForProviderAsync(
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
    }

    Task<InputPreparationResult> ICodingCommandGateway.PrepareSharedInputAsync(
        string input,
        IReadOnlyList<InputAttachment>? attachments,
        IReadOnlyList<string>? webUrls,
        bool webSearchEnabled,
        CancellationToken cancellationToken,
        string source,
        string? sessionKey,
        string? conversationId,
        string? requestedSkillName,
        string? requestedSkillScope
    )
    {
        return Owner.PrepareSharedInputAsync(
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
    }

    string ICodingCommandGateway.ApplySelectedSkillToPrompt(string input, string? skillName, string? skillScope)
    {
        return Owner.ApplySelectedSkillToPrompt(input, skillName, skillScope);
    }

    string? ICodingCommandGateway.ResolveEffectiveSkillNameForThread(string? requestedSkillName, string? conversationId)
    {
        return Owner.ResolveEffectiveSkillNameForThread(requestedSkillName, conversationId);
    }

    Task<string> ICodingCommandGateway.BuildThinkPlusContextAsync(
        string input,
        string source,
        CancellationToken cancellationToken,
        string? effectiveSkillName
    )
    {
        return Owner.BuildThinkPlusContextAsync(input, source, cancellationToken, effectiveSkillName);
    }

    string ICodingCommandGateway.BuildContextualInput(
        string conversationId,
        string input,
        IReadOnlyList<string>? requestMemoryNotes,
        bool includeLocalTimeHint,
        string? contextDecisionInput
    )
    {
        return Owner.BuildContextualInput(conversationId, input, requestMemoryNotes, includeLocalTimeHint, contextDecisionInput);
    }

    (IReadOnlyList<SearchCitationSentenceMapping> Mappings, SearchCitationValidationSummary Validation) ICodingCommandGateway.BuildAndLogCitationMappings(
        string source,
        string context,
        IReadOnlyList<SearchCitationReference>? citations,
        params (string Segment, string Text)[] segments
    )
    {
        return Owner.BuildAndLogCitationMappings(source, context, citations, segments);
    }

    SearchAnswerGuardFailure? ICodingCommandGateway.BuildCitationValidationGuardFailure(SearchCitationValidationSummary? validation)
    {
        return BuildCitationValidationGuardFailure(validation);
    }

    void ICodingCommandGateway.LogCitationValidationGuardBlocked(string source, string context, SearchAnswerGuardFailure failure)
    {
        Owner.LogCitationValidationGuardBlocked(source, context, failure);
    }

    string ICodingCommandGateway.BuildCitationValidationBlockedResponseText(SearchAnswerGuardFailure? failure)
    {
        return BuildCitationValidationBlockedResponseText(failure);
    }

    Task ICodingCommandGateway.EnsureConversationTitleFromFirstTurnAsync(
        string conversationId,
        string provider,
        string model,
        CancellationToken cancellationToken
    )
    {
        return Owner.EnsureConversationTitleFromFirstTurnAsync(conversationId, provider, model, cancellationToken);
    }

    Task<MemoryNoteSaveResult?> ICodingCommandGateway.MaybeCompressConversationAsync(
        string conversationId,
        string scope,
        string provider,
        string model,
        CancellationToken cancellationToken
    )
    {
        return Owner.MaybeCompressConversationAsync(conversationId, scope, provider, model, cancellationToken);
    }

    Task<IReadOnlyList<string>> ICodingCommandGateway.GetAvailableProvidersAsync(CancellationToken cancellationToken)
    {
        return Owner.GetAvailableProvidersAsync(cancellationToken);
    }

    Task<IReadOnlyDictionary<string, ProviderAvailability>> ICodingCommandGateway.GetProviderAvailabilityMapAsync(CancellationToken cancellationToken)
    {
        return Owner.GetProviderAvailabilityMapAsync(cancellationToken);
    }

    bool ICodingCommandGateway.IsDisabledModelSelection(string? selection)
    {
        return IsDisabledModelSelection(selection);
    }

    bool ICodingCommandGateway.IsUsableWorkerResult(
        LlmSingleChatResult workerResult,
        IReadOnlyDictionary<string, ProviderAvailability> availabilityByProvider,
        IReadOnlyDictionary<string, string?> selectionByProvider
    )
    {
        return IsUsableWorkerResult(workerResult, availabilityByProvider, selectionByProvider);
    }

    string ICodingCommandGateway.ResolveProviderForAggregation(
        TaskCategory category,
        string requestedProvider,
        IReadOnlyList<LlmSingleChatResult> successfulWorkers,
        IReadOnlyDictionary<string, ProviderAvailability> availabilityByProvider,
        IReadOnlyDictionary<string, string?> selectionByProvider,
        bool allowProviderWithoutWorkerFallback
    )
    {
        return Owner.ResolveProviderForAggregation(
            category,
            requestedProvider,
            successfulWorkers,
            availabilityByProvider,
            selectionByProvider,
            allowProviderWithoutWorkerFallback
        );
    }

    Task<LlmSingleChatResult> ICodingCommandGateway.GenerateByProviderSafeAsync(
        string provider,
        string? model,
        string input,
        CancellationToken cancellationToken,
        int? maxOutputTokens,
        bool useRawCodexPrompt,
        string? codexWorkingDirectoryOverride,
        bool optimizeCodexForCoding,
        int? timeoutOverrideSeconds,
        Action<string>? streamCallback
    )
    {
        return Owner.GenerateByProviderSafeAsync(
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
    }

    string ICodingCommandGateway.TrimForOutput(string text, int maxLength)
    {
        return TrimForOutput(text, maxLength);
    }

    bool ICodingCommandGateway.ContainsAny(string text, params string[] patterns)
    {
        return ContainsAny(text, patterns);
    }
    }
}
