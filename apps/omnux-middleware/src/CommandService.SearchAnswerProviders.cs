namespace Omnux.Middleware;

/// <summary>
/// 웹 검색 답변을 "고른 제공자"가 만들게 하는 두 경로.
/// 하나는 제공자가 서버측에서 직접 검색하는 경우, 다른 하나는 근거만 모아 넘기는 경우다.
/// 폴백 사슬 자체는 <see cref="CommandService"/> 의 SearchAnswerComposition 파셜이 소유한다.
/// </summary>
public sealed partial class CommandService
{

    /// <summary>
    /// 선택된 제공자/모델이 서버측 웹 검색을 직접 지원하면 그 모델로 바로 답을 만든다.
    /// 지원하지 않거나(cerebras·nvidia 등) 호출이 실패하면 null 을 돌려 폴백 사슬로 넘긴다.
    /// </summary>
    private async Task<SearchAnswerCompositionResult?> TryComposeNativeProviderWebAnswerAsync(
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
        string? requestedProvider,
        string? requestedModel,
        LlmTuning tuning,
        CancellationToken cancellationToken
    )
    {
        var provider = NormalizeProvider(requestedProvider ?? string.Empty, allowAuto: true);
        if (provider.Length == 0 || provider == "auto" || provider == "none")
        {
            return null;
        }

        var capability = ProviderCapabilityRegistry.Resolve(provider, requestedModel);
        if (!capability.SupportsNativeWebSearch)
        {
            _auditLogger.Log(
                NormalizeAuditToken(source, "web"),
                "search_answer_composer",
                "skip",
                $"reason=provider_without_native_web provider={provider} model={capability.Model}"
            );
            return null;
        }

        var stopwatch = System.Diagnostics.Stopwatch.StartNew();
        switch (capability.WebSearch)
        {
            case ProviderWebSearchMode.GeminiGoogleSearch:
            {
                if (!_llmRouter.HasGeminiApiKey())
                {
                    return null;
                }

                var detailed = await GenerateGeminiGroundedWebAnswerDetailedAsync(
                    input,
                    memoryHint,
                    selfDecideNeedWeb,
                    allowMarkdownTable,
                    enforceTelegramOutputStyle,
                    streamCallback,
                    scope,
                    mode,
                    conversationId,
                    decisionPath,
                    decisionMs,
                    cancellationToken,
                    capability.Model,
                    tuning
                ).ConfigureAwait(false);
                if (IsGroundedWebAnswerFailureText(detailed.Response.Text))
                {
                    _auditLogger.Log(
                        NormalizeAuditToken(source, "web"),
                        "search_answer_composer",
                        "fallback",
                        $"reason=native_web_failure provider=gemini model={capability.Model}"
                    );
                    return null;
                }

                _auditLogger.Log(
                    NormalizeAuditToken(source, "web"),
                    "search_answer_composer",
                    "ok",
                    $"route=native-gemini-web model={capability.Model} elapsedMs={stopwatch.ElapsedMilliseconds}"
                );
                return new SearchAnswerCompositionResult(
                    detailed.Response,
                    "native-gemini-web",
                    detailed.Latency,
                    detailed.Citations,
                    null,
                    SearchRetrieverPath.GeminiGrounding
                );
            }

            case ProviderWebSearchMode.GroqBrowserSearch:
            case ProviderWebSearchMode.GroqCompound:
            {
                if (!_llmRouter.HasGroqApiKey())
                {
                    return null;
                }

                var answer = await _llmRouter.GenerateGroqNativeWebAnswerAsync(
                    BuildGroqCompoundSystemPrompt(memoryHint, allowMarkdownTable, enforceTelegramOutputStyle),
                    input,
                    capability.Model,
                    tuning,
                    cancellationToken
                ).ConfigureAwait(false);
                stopwatch.Stop();
                if (answer == null || IsGroundedWebAnswerFailureText(answer.Text))
                {
                    _auditLogger.Log(
                        NormalizeAuditToken(source, "web"),
                        "search_answer_composer",
                        "fallback",
                        $"reason=native_web_failure provider=groq model={capability.Model}"
                    );
                    return null;
                }

                var citations = answer.Sources
                    .Select((item, index) => new SearchCitationReference(
                        $"c{index + 1}",
                        item.Title,
                        item.Url,
                        string.Empty,
                        item.Snippet,
                        "web"
                    ))
                    .ToArray();
                _auditLogger.Log(
                    NormalizeAuditToken(source, "web"),
                    "search_answer_composer",
                    "ok",
                    $"route=native-groq-web model={answer.Model} sources={citations.Length} elapsedMs={stopwatch.ElapsedMilliseconds}"
                );
                return new SearchAnswerCompositionResult(
                    new LlmSingleChatResult("groq", answer.Model, answer.Text),
                    "native-groq-web",
                    string.IsNullOrWhiteSpace(decisionPath)
                        ? null
                        : new ChatLatencyMetrics(decisionMs, 0, 0, stopwatch.ElapsedMilliseconds, 0, $"{decisionPath}:native_groq_web"),
                    citations,
                    null,
                    SearchRetrieverPath.GroqCompound
                );
            }

            case ProviderWebSearchMode.DeepseekWebSearch:
            {
                var answer = await _llmRouter.GenerateDeepseekNativeWebAnswerAsync(
                    BuildGroqCompoundSystemPrompt(memoryHint, allowMarkdownTable, enforceTelegramOutputStyle),
                    input,
                    capability.Model,
                    tuning,
                    cancellationToken
                ).ConfigureAwait(false);
                stopwatch.Stop();
                if (answer == null || IsGroundedWebAnswerFailureText(answer.Text))
                {
                    _auditLogger.Log(
                        NormalizeAuditToken(source, "web"),
                        "search_answer_composer",
                        "fallback",
                        $"reason=native_web_failure provider=deepseek model={capability.Model}"
                    );
                    return null;
                }

                var deepseekCitations = answer.Sources
                    .Select((item, index) => new SearchCitationReference(
                        $"c{index + 1}",
                        item.Title,
                        item.Url,
                        string.Empty,
                        string.Empty,
                        "web"
                    ))
                    .ToArray();
                _auditLogger.Log(
                    NormalizeAuditToken(source, "web"),
                    "search_answer_composer",
                    "ok",
                    $"route=native-deepseek-web model={answer.Model} sources={deepseekCitations.Length} elapsedMs={stopwatch.ElapsedMilliseconds}"
                );
                return new SearchAnswerCompositionResult(
                    new LlmSingleChatResult("deepseek", answer.Model, answer.Text),
                    "native-deepseek-web",
                    string.IsNullOrWhiteSpace(decisionPath)
                        ? null
                        : new ChatLatencyMetrics(decisionMs, 0, 0, stopwatch.ElapsedMilliseconds, 0, $"{decisionPath}:native_deepseek_web"),
                    deepseekCitations,
                    null,
                    SearchRetrieverPath.GeminiGrounding
                );
            }

            default:
                // CLI 제공자(codex·copilot·grok)는 래퍼가 자체 검색을 수행하므로 여기서 가로채지 않는다.
                return null;
        }
    }

    /// <summary>
    /// 네이티브 웹 검색이 없는 제공자를 위한 경로. retriever 체인으로 근거를 모아
    /// 사용자가 고른 provider/model 이 그 근거로 직접 답을 쓴다.
    /// 근거가 없거나 호출이 실패하면 null 을 돌려 기존 폴백 사슬로 넘긴다.
    /// </summary>
    private async Task<SearchAnswerCompositionResult?> TryComposeSelectedProviderWithEvidenceAsync(
        string input,
        string memoryHint,
        bool allowMarkdownTable,
        bool enforceTelegramOutputStyle,
        Action<ChatStreamUpdate>? streamCallback,
        string scope,
        string mode,
        string conversationId,
        string decisionPath,
        long decisionMs,
        string source,
        string? requestedProvider,
        string? requestedModel,
        LlmTuning tuning,
        CancellationToken cancellationToken
    )
    {
        var provider = NormalizeProvider(requestedProvider ?? string.Empty, allowAuto: true);
        if (provider.Length == 0 || provider == "auto" || provider == "none")
        {
            return null;
        }

        var capability = ProviderCapabilityRegistry.Resolve(provider, requestedModel);
        if (capability.SupportsNativeWebSearch)
        {
            // 네이티브 경로에서 이미 실패한 제공자다. 같은 모델로 또 돌리지 않는다.
            return null;
        }

        var stopwatch = System.Diagnostics.Stopwatch.StartNew();
        SearchResponse response;
        try
        {
            response = await _searchGateway
                .SearchAsync(BuildProviderEvidenceSearchRequest(input), cancellationToken)
                .ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            _auditLogger.Log(
                NormalizeAuditToken(source, "web"),
                "search_answer_composer",
                "fallback",
                $"reason=evidence_retrieval_failed provider={provider} detail={TrimForAudit(ex.Message, 160)}"
            );
            return null;
        }

        if (response.Documents.Count == 0)
        {
            _auditLogger.Log(
                NormalizeAuditToken(source, "web"),
                "search_answer_composer",
                "fallback",
                $"reason=evidence_empty provider={provider}"
            );
            return null;
        }

        var prompt = SearchPromptPolicy.BuildEvidenceGroundedAnswerPrompt(
            input,
            response.Documents,
            memoryHint,
            allowMarkdownTable,
            enforceTelegramOutputStyle
        );
        var chunkIndex = 0;
        Action<string>? deltaCallback = streamCallback == null
            ? null
            : delta =>
            {
                if (string.IsNullOrEmpty(delta))
                {
                    return;
                }

                chunkIndex += 1;
                streamCallback(new ChatStreamUpdate(
                    scope,
                    mode,
                    conversationId,
                    provider,
                    capability.Model,
                    "evidence-provider-web",
                    delta,
                    chunkIndex
                ));
            };

        var generated = await GenerateByProviderSafeAsync(
            provider,
            capability.Model,
            prompt,
            cancellationToken,
            maxOutputTokens: tuning.ScaleOutput(1600),
            streamCallback: deltaCallback,
            tuning: tuning
        ).ConfigureAwait(false);
        stopwatch.Stop();

        var answerText = ChatOutputSanitizerPolicy.Sanitize(generated.Text);
        if (CodingProviderFailurePolicy.Classify(answerText) != CodingProviderFailureKind.None
            || IsGroundedWebAnswerFailureText(answerText))
        {
            _auditLogger.Log(
                NormalizeAuditToken(source, "web"),
                "search_answer_composer",
                "fallback",
                $"reason=evidence_answer_failed provider={provider} model={capability.Model}"
            );
            return null;
        }

        var citations = response.Documents
            .Select((document, index) => new SearchCitationReference(
                string.IsNullOrWhiteSpace(document.CitationId) ? $"c{index + 1}" : document.CitationId,
                document.Title,
                document.Url,
                document.Domain,
                document.Snippet,
                "web"
            ))
            .ToArray();
        _auditLogger.Log(
            NormalizeAuditToken(source, "web"),
            "search_answer_composer",
            "ok",
            $"route=evidence-provider-web provider={provider} model={capability.Model} sources={citations.Length} elapsedMs={stopwatch.ElapsedMilliseconds}"
        );
        return new SearchAnswerCompositionResult(
            generated with { Text = answerText },
            "evidence-provider-web",
            string.IsNullOrWhiteSpace(decisionPath)
                ? null
                : new ChatLatencyMetrics(decisionMs, 0, 0, stopwatch.ElapsedMilliseconds, 0, $"{decisionPath}:evidence_provider_web"),
            citations,
            null,
            response.RetrieverPath
        );
    }

    private static SearchRequest BuildProviderEvidenceSearchRequest(string query)
    {
        return new SearchRequest(
            Query: (query ?? string.Empty).Trim(),
            RequestedAtUtc: DateTimeOffset.UtcNow,
            UserLocale: System.Globalization.CultureInfo.CurrentCulture.Name,
            UserTimezone: TimeZoneInfo.Local.Id,
            IntentProfile: new SearchIntentProfile(
                TimeSensitivity: QueryTimeSensitivity.Medium,
                RiskLevel: QueryRiskLevel.Normal,
                AnswerType: QueryAnswerType.Explain
            ),
            Constraints: new SearchConstraints(
                TargetCount: 4,
                MinIndependentSources: 1,
                MaxAgeHours: 24 * 7,
                StrictTodayWindow: false
            )
        );
    }
}
