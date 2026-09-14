using System.Diagnostics;
using System.Globalization;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Xml.Linq;

namespace Omnux.Middleware;

public sealed partial class CommandService
{
    private const int SearchRecollectMaxAttempts = 2;
    private static readonly HttpClient SourceFeedHttpClient = CreateSourceFeedHttpClient();
    private static readonly Regex DomainTokenRegex = new(
        @"(?<domain>[a-z0-9][a-z0-9\.-]*\.[a-z]{2,})",
        RegexOptions.Compiled | RegexOptions.IgnoreCase
    );
    private static readonly Regex HtmlLinkTagRegex = new(
        @"<link\b[^>]*>",
        RegexOptions.Compiled | RegexOptions.IgnoreCase
    );
    private static readonly Regex HtmlHrefRegex = new(
        @"href\s*=\s*[""'](?<href>[^""']+)[""']",
        RegexOptions.Compiled | RegexOptions.IgnoreCase
    );
    private static readonly Regex HtmlAnchorTagRegex = new(
        @"<a\b[^>]*href\s*=\s*[""'](?<href>[^""']+)[""'][^>]*>(?<text>[\s\S]*?)</a>",
        RegexOptions.Compiled | RegexOptions.IgnoreCase
    );

    public SessionListToolResult ListSessions(
        IReadOnlyList<string>? kinds = null,
        int? limit = null,
        int? activeMinutes = null,
        int? messageLimit = null,
        string? search = null,
        string? scope = null,
        string? mode = null
    ) => _toolAppService.ListSessions(kinds, limit, activeMinutes, messageLimit, search, scope, mode);

    public SessionHistoryToolResult GetSessionHistory(
        string? sessionKey,
        int? limit = null,
        bool includeTools = false
    ) => _toolAppService.GetSessionHistory(sessionKey, limit, includeTools);

    public SessionSendToolResult SendToSession(
        string? sessionKey,
        string? message,
        int? timeoutSeconds = null
    ) => _toolAppService.SendToSession(sessionKey, message, timeoutSeconds);

    public SessionSpawnToolResult SpawnSession(
        string? task,
        string? label = null,
        string? runtime = null,
        int? runTimeoutSeconds = null,
        int? timeoutSeconds = null,
        bool? thread = null,
        string? mode = null,
        string? commandPriority = null
    ) => _toolAppService.SpawnSession(task, label, runtime, runTimeoutSeconds, timeoutSeconds, thread, mode, commandPriority);

    public SessionSpawnQueueStatus GetSessionSpawnStatus()
        => _toolAppService.GetSessionSpawnStatus();

    public Task<WebSearchToolResult> SearchWebAsync(
        string query,
        int? count = null,
        string? freshness = null,
        CancellationToken cancellationToken = default,
        string source = "web"
    )
    {
        return SearchWebViaGatewayAsync(query, count, freshness, cancellationToken, source);
    }

    private async Task<WebSearchToolResult> SearchWebViaGatewayAsync(
        string query,
        int? count,
        string? freshness,
        CancellationToken cancellationToken,
        string source
    )
    {
        var normalizedQuery = (query ?? string.Empty).Trim();
        if (normalizedQuery.Length == 0)
        {
            return new WebSearchToolResult(
                Provider: "gemini_grounding",
                Results: Array.Empty<WebSearchResultItem>(),
                Disabled: false,
                Error: "query required",
                RetryAttempt: 0,
                RetryMaxAttempts: 1,
                RetryStopReason: "query_required"
            );
        }

        if (_context.EnableFastWebPipeline)
        {
            return await SearchWebViaGatewayFastPathAsync(
                normalizedQuery,
                count,
                freshness,
                cancellationToken
            ).ConfigureAwait(false);
        }

        try
        {
            var maxAttempts = 2;
            var attempt = 1;
            var effectiveCount = count;
            var effectiveFreshness = freshness;
            var searchRequest = BuildSearchGatewayRequest(normalizedQuery, effectiveCount, effectiveFreshness);
            var response = await _searchGateway.SearchAsync(searchRequest, cancellationToken).ConfigureAwait(false);
            var responseProvider = ResolveSearchGatewayProvider(response.RetrieverPath);
            var guardDecision = _searchGuard.Evaluate(response);
            if (!guardDecision.Allowed
                && ShouldRetrySearchWithRelaxedConstraint(guardDecision.Failure))
            {
                var relaxedCount = ResolveRelaxedGatewayRetryCount(normalizedQuery, effectiveCount);
                var relaxedFreshness = ResolveRelaxedGatewayRetryFreshness(effectiveFreshness);
                var shouldRetry = relaxedCount != effectiveCount
                    || !string.Equals(
                        NormalizeGatewayFreshness(effectiveFreshness),
                        NormalizeGatewayFreshness(relaxedFreshness),
                        StringComparison.Ordinal
                    );
                if (shouldRetry)
                {
                    attempt += 1;
                    effectiveCount = relaxedCount;
                    effectiveFreshness = relaxedFreshness;
                    var relaxedRequest = BuildSearchGatewayRequest(normalizedQuery, effectiveCount, effectiveFreshness);
                    response = await _searchGateway.SearchAsync(relaxedRequest, cancellationToken).ConfigureAwait(false);
                    responseProvider = ResolveSearchGatewayProvider(response.RetrieverPath);
                    guardDecision = _searchGuard.Evaluate(response);
                }
            }

            if (!guardDecision.Allowed)
            {
                if (ShouldReturnPartialResultFromCountLock(guardDecision.Failure, response))
                {
                    var requestedTarget = ResolveGatewayTargetCount(effectiveCount);
                    var partialDocs = response.Documents;
                    var sourceFocus = SearchQueryPolicy.ExtractSourceFocusHintFromInput(normalizedQuery);
                    if (ShouldRunSourceExpansion(sourceFocus, requestedTarget, partialDocs.Count))
                    {
                        var expandedFreshness = ResolveSourceExpansionFreshness(effectiveFreshness);
                        foreach (var expandedQuery in BuildSourceExpansionQueries(normalizedQuery, sourceFocus).Take(5))
                        {
                            var expandedRequest = BuildSearchGatewayRequest(expandedQuery, effectiveCount, expandedFreshness);
                            var expandedResponse = await _searchGateway.SearchAsync(expandedRequest, cancellationToken).ConfigureAwait(false);
                            partialDocs = MergeSearchDocumentsByUrl(
                                partialDocs,
                                expandedResponse.Documents,
                                requestedTarget
                            );
                            if (partialDocs.Count >= requestedTarget)
                            {
                                break;
                            }
                        }
                    }

                    var partial = MapSearchDocuments(partialDocs, requestedTarget);
                    if (partial.Length > 0)
                    {
                        return new WebSearchToolResult(
                            Provider: responseProvider,
                            Results: partial,
                            Disabled: false,
                            Error: null,
                            ExternalContent: new ExternalContentDescriptor(
                                Untrusted: true,
                                Source: "web_search",
                                Provider: responseProvider,
                                Wrapped: true
                            ),
                            RetryAttempt: attempt,
                            RetryMaxAttempts: maxAttempts,
                            RetryStopReason: ShouldRunSourceExpansion(sourceFocus, requestedTarget, response.Documents.Count)
                                ? "partial_with_source_expansion"
                                : attempt > 1
                                    ? "partial_after_relax"
                                    : "partial_count_lock"
                        );
                    }
                }

                return new WebSearchToolResult(
                    Provider: responseProvider,
                    Results: Array.Empty<WebSearchResultItem>(),
                    Disabled: true,
                    Error: guardDecision.Failure?.ReasonCode ?? "search_answer_guard_blocked",
                    GuardFailure: guardDecision.Failure,
                    RetryAttempt: attempt,
                    RetryMaxAttempts: maxAttempts,
                    RetryStopReason: attempt > 1 ? "guard_blocked_after_relax" : "guard_blocked"
                );
            }

            var mapped = MapSearchDocuments(response.Documents, response.TargetCount);
            if (mapped.Length > 0)
            {
                return new WebSearchToolResult(
                    Provider: responseProvider,
                    Results: mapped,
                    Disabled: false,
                    Error: null,
                    ExternalContent: new ExternalContentDescriptor(
                        Untrusted: true,
                        Source: "web_search",
                        Provider: responseProvider,
                        Wrapped: true
                    ),
                    RetryAttempt: attempt,
                    RetryMaxAttempts: maxAttempts,
                    RetryStopReason: attempt > 1 ? "success_after_relax" : "success"
                );
            }

            var terminationReason = response.Termination?.ReasonCode;
            return new WebSearchToolResult(
                Provider: responseProvider,
                Results: Array.Empty<WebSearchResultItem>(),
                Disabled: true,
                Error: string.IsNullOrWhiteSpace(terminationReason) ? "no_documents" : terminationReason,
                RetryAttempt: attempt,
                RetryMaxAttempts: maxAttempts,
                RetryStopReason: attempt > 1 ? "no_documents_after_relax" : "no_documents"
            );
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            return new WebSearchToolResult(
                Provider: "gemini_grounding",
                Results: Array.Empty<WebSearchResultItem>(),
                Disabled: true,
                Error: ex.Message,
                RetryAttempt: 0,
                RetryMaxAttempts: 2,
                RetryStopReason: "gateway_exception"
            );
        }
    }

    private async Task<WebSearchToolResult> SearchWebViaGatewayFastPathAsync(
        string normalizedQuery,
        int? count,
        string? freshness,
        CancellationToken cancellationToken
    )
    {
        try
        {
            var targetCount = ResolveGatewayTargetCount(count);
            var request = BuildSearchGatewayRequest(normalizedQuery, count, freshness);
            var response = await _searchGateway.SearchAsync(request, cancellationToken).ConfigureAwait(false);
            var responseProvider = ResolveSearchGatewayProvider(response.RetrieverPath);
            var guardDecision = _searchGuard.Evaluate(response);
            var docs = response.Documents;
            if (docs.Count < targetCount
                && ShouldTryFastPartialTopUp(normalizedQuery))
            {
                try
                {
                    var topUpQuery = BuildEmergencyNewsRecoveryQuery(normalizedQuery);
                    var topUpFreshness = ResolveRelaxedGatewayRetryFreshness(freshness) ?? freshness;
                    using var topUpCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                    topUpCts.CancelAfter(TimeSpan.FromSeconds(2));
                    var topUpRequest = BuildSearchGatewayRequest(topUpQuery, count, topUpFreshness);
                    var topUpResponse = await _searchGateway.SearchAsync(topUpRequest, topUpCts.Token).ConfigureAwait(false);
                    if (topUpResponse.Documents.Count > 0)
                    {
                        docs = MergeSearchDocumentsByUrl(docs, topUpResponse.Documents, targetCount);
                    }
                }
                catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
                {
                }
                catch
                {
                }
            }

            if ((!guardDecision.Allowed || docs.Count < targetCount) && docs.Count > 0)
            {
                var mappedPartial = MapSearchDocuments(docs, Math.Min(targetCount, docs.Count));
                if (mappedPartial.Length > 0)
                {
                    return new WebSearchToolResult(
                        Provider: responseProvider,
                        Results: mappedPartial,
                        Disabled: false,
                        Error: null,
                        GuardFailure: null,
                        ExternalContent: new ExternalContentDescriptor(
                            Untrusted: true,
                            Source: "web_search",
                            Provider: responseProvider,
                            Wrapped: true
                        ),
                        RetryAttempt: 1,
                        RetryMaxAttempts: 1,
                        RetryStopReason: guardDecision.Allowed ? "success" : "partial_guard_bypass"
                    );
                }
            }

            if (guardDecision.Allowed)
            {
                var mapped = MapSearchDocuments(docs, Math.Min(targetCount, docs.Count));
                if (mapped.Length > 0)
                {
                    return new WebSearchToolResult(
                        Provider: responseProvider,
                        Results: mapped,
                        Disabled: false,
                        Error: null,
                        ExternalContent: new ExternalContentDescriptor(
                            Untrusted: true,
                            Source: "web_search",
                            Provider: responseProvider,
                            Wrapped: true
                        ),
                        RetryAttempt: 1,
                        RetryMaxAttempts: 1,
                        RetryStopReason: "success"
                    );
                }
            }

            var reason = response.Termination?.ReasonCode
                ?? guardDecision.Failure?.ReasonCode
                ?? "no_documents";
            if (ShouldRunEmergencyNewsRecoveryQuery(normalizedQuery, reason))
            {
                _auditLogger.Log("web", "emergency_news_recovery", "try", $"reason={reason}");
                try
                {
                    var recoveryQuery = BuildEmergencyNewsRecoveryQuery(normalizedQuery);
                    using var recoveryCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                    recoveryCts.CancelAfter(TimeSpan.FromSeconds(Math.Clamp((_context.LlmTimeoutSec / 3) + 1, 2, 4)));
                    var recoveryRequest = BuildSearchGatewayRequest(recoveryQuery, count, freshness);
                    var recoveryResponse = await _searchGateway.SearchAsync(recoveryRequest, recoveryCts.Token).ConfigureAwait(false);
                    var recoveryDocs = recoveryResponse.Documents;
                    if (recoveryDocs.Count > 0)
                    {
                        var mappedRecovery = MapSearchDocuments(recoveryDocs, Math.Min(targetCount, recoveryDocs.Count));
                        if (mappedRecovery.Length > 0)
                        {
                            return new WebSearchToolResult(
                                Provider: "gemini_grounding",
                                Results: mappedRecovery,
                                Disabled: false,
                                Error: null,
                                GuardFailure: null,
                                ExternalContent: new ExternalContentDescriptor(
                                    Untrusted: true,
                                    Source: "web_search",
                                    Provider: "gemini_grounding",
                                    Wrapped: true
                                ),
                                RetryAttempt: 1,
                                RetryMaxAttempts: 1,
                                RetryStopReason: "emergency_news_recovery"
                            );
                        }
                    }

                    _auditLogger.Log("web", "emergency_news_recovery", "skip", "count=0");
                }
                catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
                {
                    _auditLogger.Log("web", "emergency_news_recovery", "skip", "timeout");
                }
                catch
                {
                    _auditLogger.Log("web", "emergency_news_recovery", "skip", "exception");
                }
            }

            if (ShouldUseGlobalNewsFeedFallback(normalizedQuery, reason))
            {
                _auditLogger.Log("web", "global_news_feed_fallback", "try", $"reason={reason} query={TrimForAudit(normalizedQuery, 120)}");
                try
                {
                    using var fallbackCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                    fallbackCts.CancelAfter(TimeSpan.FromSeconds(Math.Clamp((_context.LlmTimeoutSec / 3) + 1, 2, 4)));
                    var fallbackItems = await TryCollectGlobalNewsFeedItemsAsync(
                        normalizedQuery,
                        targetCount,
                        fallbackCts.Token
                    ).ConfigureAwait(false);
                    if (fallbackItems.Length > 0)
                    {
                        _auditLogger.Log(
                            "web",
                            "global_news_feed_fallback",
                            "ok",
                            $"count={fallbackItems.Length.ToString(CultureInfo.InvariantCulture)}"
                        );
                        return new WebSearchToolResult(
                            Provider: "global_news_feed_fallback",
                            Results: fallbackItems,
                            Disabled: false,
                            Error: null,
                            GuardFailure: null,
                            ExternalContent: new ExternalContentDescriptor(
                                Untrusted: true,
                                Source: "web_search",
                                Provider: "global_news_feed_fallback",
                                Wrapped: true
                            ),
                            RetryAttempt: 1,
                            RetryMaxAttempts: 1,
                            RetryStopReason: "fallback_global_news_feed"
                        );
                    }

                    _auditLogger.Log("web", "global_news_feed_fallback", "skip", "count=0");
                }
                catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
                {
                    _auditLogger.Log("web", "global_news_feed_fallback", "skip", "timeout");
                }
            }

            return new WebSearchToolResult(
                Provider: responseProvider,
                Results: Array.Empty<WebSearchResultItem>(),
                Disabled: true,
                Error: reason,
                GuardFailure: guardDecision.Allowed ? null : guardDecision.Failure,
                RetryAttempt: 1,
                RetryMaxAttempts: 1,
                RetryStopReason: guardDecision.Allowed ? "no_documents" : "guard_blocked"
            );
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            return new WebSearchToolResult(
                Provider: "gemini_grounding",
                Results: Array.Empty<WebSearchResultItem>(),
                Disabled: true,
                Error: ex.Message,
                RetryAttempt: 1,
                RetryMaxAttempts: 1,
                RetryStopReason: "gateway_exception"
            );
        }
    }

    private static bool ShouldTryFastPartialTopUp(string query)
    {
        var normalized = (query ?? string.Empty).Trim().ToLowerInvariant();
        if (normalized.Length == 0)
        {
            return false;
        }

        return SearchQueryPolicy.LooksLikeListOutputRequest(normalized)
            && ContainsAny(normalized, "뉴스", "news", "헤드라인", "속보", "브리핑");
    }

    private static bool ShouldRunEmergencyNewsRecoveryQuery(string query, string reason)
    {
        var normalizedQuery = (query ?? string.Empty).Trim().ToLowerInvariant();
        if (normalizedQuery.Length == 0 || !SearchQueryPolicy.LooksLikeListOutputRequest(normalizedQuery))
        {
            return false;
        }

        if (!ContainsAny(normalizedQuery, "뉴스", "news", "헤드라인", "속보", "브리핑"))
        {
            return false;
        }

        var normalizedReason = (reason ?? string.Empty).Trim().ToLowerInvariant();
        return normalizedReason is "retriever_unavailable"
            or "no_documents"
            or "count_lock_unsatisfied_after_retries"
            or "gemini_grounding_timeout";
    }

    private static string BuildEmergencyNewsRecoveryQuery(string query)
    {
        var normalized = (query ?? string.Empty).Trim();
        if (normalized.Length == 0)
        {
            return "latest breaking headlines world korea";
        }

        var lowered = normalized.ToLowerInvariant();
        if (ContainsAny(lowered, "cnn", "bbc", "reuters", "연합뉴스", "yna", "kbs", "mbc", "sbs"))
        {
            return normalized;
        }

        return $"{normalized} latest breaking headlines world korea";
    }

    private static bool ShouldUseGlobalNewsFeedFallback(string query, string reason)
    {
        var normalizedQuery = (query ?? string.Empty).Trim().ToLowerInvariant();
        if (normalizedQuery.Length == 0 || !SearchQueryPolicy.LooksLikeListOutputRequest(normalizedQuery))
        {
            return false;
        }

        if (!ContainsAny(normalizedQuery, "뉴스", "news", "헤드라인", "속보", "브리핑"))
        {
            return false;
        }

        var normalizedReason = (reason ?? string.Empty).Trim().ToLowerInvariant();
        return normalizedReason is "retriever_unavailable"
            or "no_documents"
            or "count_lock_unsatisfied_after_retries"
            or "gemini_result_empty"
            or "gemini_upstream_error"
            or "gemini_grounding_timeout";
    }

    private static IReadOnlyList<SearchDocument> MergeSearchDocumentsByUrl(
        IReadOnlyList<SearchDocument> baseDocuments,
        IReadOnlyList<SearchDocument> extraDocuments,
        int targetCount
    )
    {
        var merged = new List<SearchDocument>(Math.Max(0, targetCount));
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        void AppendDocs(IReadOnlyList<SearchDocument> docs)
        {
            foreach (var doc in docs)
            {
                if (merged.Count >= targetCount)
                {
                    return;
                }

                var key = (doc.Url ?? string.Empty).Trim();
                if (key.Length == 0 || !seen.Add(key))
                {
                    continue;
                }

                merged.Add(doc);
            }
        }

        AppendDocs(baseDocuments);
        AppendDocs(extraDocuments);
        return merged;
    }

    private static WebSearchResultItem[] MapSearchDocuments(IReadOnlyList<SearchDocument> documents, int take)
    {
        if (documents == null || documents.Count == 0 || take <= 0)
        {
            return Array.Empty<WebSearchResultItem>();
        }

        return documents
            .Take(take)
            .Select(x => new WebSearchResultItem(
                x.Title,
                x.Url,
                x.Snippet,
                x.PublishedAt.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                x.CitationId
            ))
            .ToArray();
    }

    private static string ResolveSearchGatewayProvider(SearchRetrieverPath retrieverPath)
    {
        return retrieverPath switch
        {
            SearchRetrieverPath.LocalCacheFallback => "search_cache_fallback",
            _ => "gemini_grounding"
        };
    }

    private static WebSearchResultItem[] MergeWebSearchItemsByUrl(
        IReadOnlyList<WebSearchResultItem> preferred,
        IReadOnlyList<WebSearchResultItem> fallback,
        int take
    )
    {
        if (take <= 0)
        {
            return Array.Empty<WebSearchResultItem>();
        }

        var merged = new List<WebSearchResultItem>(take);
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        void Append(IReadOnlyList<WebSearchResultItem> items)
        {
            foreach (var item in items)
            {
                if (merged.Count >= take)
                {
                    return;
                }

                var key = (item.Url ?? string.Empty).Trim();
                if (key.Length == 0 || !seen.Add(key))
                {
                    continue;
                }

                merged.Add(item);
            }
        }

        Append(preferred);
        Append(fallback);
        return merged.ToArray();
    }

    private static bool ShouldRunSourceExpansion(string sourceFocus, int requestedTarget, int collectedCount)
    {
        if (requestedTarget <= collectedCount || requestedTarget <= 1)
        {
            return false;
        }

        var normalizedFocus = (sourceFocus ?? string.Empty).Trim();
        if (normalizedFocus.Length < 2)
        {
            return false;
        }

        return true;
    }

    private static IReadOnlyList<string> BuildSourceExpansionQueries(string query, string sourceFocus)
    {
        var normalizedQuery = (query ?? string.Empty).Trim();
        var normalizedFocus = (sourceFocus ?? string.Empty).Trim();
        if (normalizedFocus.Length < 2)
        {
            return Array.Empty<string>();
        }
        var sourceDomainGuess = ResolveSourceDomainFromQueryOrFocus(normalizedQuery, normalizedFocus);

        var candidates = new[]
        {
            sourceDomainGuess.Length > 0 ? $"{sourceDomainGuess} top stories" : string.Empty,
            sourceDomainGuess.Length > 0 ? $"{normalizedFocus} {sourceDomainGuess} headlines" : string.Empty,
            $"{normalizedFocus} official top headlines",
            $"{normalizedFocus} homepage top stories",
            $"{normalizedFocus} latest headlines",
            $"{normalizedFocus} top stories",
            $"{normalizedFocus} breaking headlines",
            $"{normalizedFocus} main headlines today",
            $"{normalizedFocus} 주요 헤드라인",
            $"{normalizedQuery} 최신 헤드라인"
        };

        return candidates
            .Where(item => !string.IsNullOrWhiteSpace(item))
            .Where(item => !item.Equals(normalizedQuery, StringComparison.OrdinalIgnoreCase))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    private static string ResolveSourceDomainFromQueryOrFocus(string query, string sourceFocus)
    {
        var normalizedQuery = (query ?? string.Empty).Trim();
        foreach (Match match in DomainTokenRegex.Matches(normalizedQuery))
        {
            if (!match.Success)
            {
                continue;
            }

            var candidate = NormalizeSourceDomainHintForConfig(match.Groups["domain"].Value);
            if (candidate.Length > 0)
            {
                return candidate;
            }
        }

        var normalizedFocus = (sourceFocus ?? string.Empty).Trim().ToLowerInvariant();
        if (normalizedFocus.Length == 0)
        {
            return string.Empty;
        }

        var compact = Regex.Replace(normalizedFocus, @"[^a-z0-9\-]", string.Empty);
        if (compact.Length < 2 || compact.Length > 30)
        {
            return string.Empty;
        }

        return $"{compact}.com";
    }

    private static string? ResolveSourceExpansionFreshness(string? freshness)
    {
        var normalized = NormalizeGatewayFreshness(freshness);
        return normalized switch
        {
            "day" => "week",
            "week" => "month",
            _ => freshness
        };
    }

    private static HttpClient CreateSourceFeedHttpClient()
    {
        var client = new HttpClient
        {
            Timeout = TimeSpan.FromSeconds(6)
        };
        client.DefaultRequestHeaders.TryAddWithoutValidation(
            "User-Agent",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
        );
        client.DefaultRequestHeaders.TryAddWithoutValidation(
            "Accept",
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        );
        client.DefaultRequestHeaders.TryAddWithoutValidation("Accept-Language", "en-US,en;q=0.9,ko;q=0.8");
        return client;
    }

    private static string NormalizeSourceDomainHintForConfig(string? domain)
    {
        var normalized = (domain ?? string.Empty).Trim().ToLowerInvariant();
        if (normalized.StartsWith("http://", StringComparison.Ordinal))
        {
            normalized = normalized["http://".Length..];
        }
        else if (normalized.StartsWith("https://", StringComparison.Ordinal))
        {
            normalized = normalized["https://".Length..];
        }

        normalized = normalized.Trim('/');
        if (normalized.StartsWith("www.", StringComparison.Ordinal))
        {
            normalized = normalized[4..];
        }

        return Regex.IsMatch(normalized, @"^[a-z0-9][a-z0-9\.-]*\.[a-z]{2,}$", RegexOptions.CultureInvariant)
            ? normalized
            : string.Empty;
    }

    private async Task<WebSearchResultItem[]> TryCollectDomainFeedItemsAsync(
        string sourceDomain,
        int targetCount,
        CancellationToken cancellationToken
    )
    {
        if (targetCount <= 0)
        {
            return Array.Empty<WebSearchResultItem>();
        }

        var normalizedDomain = NormalizeSourceDomainHintForConfig(sourceDomain);
        if (normalizedDomain.Length == 0)
        {
            return Array.Empty<WebSearchResultItem>();
        }

        var feedUrls = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            $"https://{normalizedDomain}/rss",
            $"https://{normalizedDomain}/rss.xml",
            $"https://{normalizedDomain}/feed",
            $"https://{normalizedDomain}/feeds/all.atom.xml"
        };

        var homeUrl = $"https://{normalizedDomain}/";
        var homeHtml = await TryReadHttpTextAsync(homeUrl, cancellationToken).ConfigureAwait(false);
        if (!string.IsNullOrWhiteSpace(homeHtml))
        {
            foreach (var discovered in ExtractFeedUrlsFromHtml(homeUrl, homeHtml))
            {
                feedUrls.Add(discovered);
            }
        }

        var results = new List<WebSearchResultItem>(targetCount);
        var seenUrls = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var feedUrl in feedUrls)
        {
            if (results.Count >= targetCount)
            {
                break;
            }

            var feedText = await TryReadHttpTextAsync(feedUrl, cancellationToken).ConfigureAwait(false);
            if (string.IsNullOrWhiteSpace(feedText))
            {
                continue;
            }

            foreach (var feedItem in ParseFeedItems(feedText, feedUrl, normalizedDomain))
            {
                if (results.Count >= targetCount)
                {
                    break;
                }

                if (!seenUrls.Add(feedItem.Url))
                {
                    continue;
                }

                var citationId = $"c{results.Count + 1}";
                results.Add(feedItem with { CitationId = citationId });
            }
        }

        if (results.Count < targetCount && !string.IsNullOrWhiteSpace(homeHtml))
        {
            foreach (var htmlItem in ExtractArticleItemsFromHtml(homeUrl, homeHtml, normalizedDomain, targetCount - results.Count))
            {
                if (results.Count >= targetCount)
                {
                    break;
                }

                if (!seenUrls.Add(htmlItem.Url))
                {
                    continue;
                }

                var citationId = $"c{results.Count + 1}";
                results.Add(htmlItem with { CitationId = citationId });
            }
        }

        if (results.Count < targetCount)
        {
            var sitemapItems = await TryCollectSitemapItemsAsync(
                normalizedDomain,
                targetCount - results.Count,
                cancellationToken
            ).ConfigureAwait(false);
            if (sitemapItems.Length > 0)
            {
                foreach (var sitemapItem in sitemapItems)
                {
                    if (results.Count >= targetCount)
                    {
                        break;
                    }

                    if (!seenUrls.Add(sitemapItem.Url))
                    {
                        continue;
                    }

                    var citationId = $"c{results.Count + 1}";
                    results.Add(sitemapItem with { CitationId = citationId });
                }
            }
        }

        return results.ToArray();
    }

    private async Task<WebSearchResultItem[]> TryCollectGlobalNewsFeedItemsAsync(
        string query,
        int targetCount,
        CancellationToken cancellationToken
    )
    {
        if (targetCount <= 0)
        {
            return Array.Empty<WebSearchResultItem>();
        }

        var fallbackDomains = new[]
        {
            "yna.co.kr",
            "kbs.co.kr",
            "mk.co.kr",
            "donga.com",
            "chosun.com",
            "cnn.com",
            "bbc.com",
            "reuters.com",
            "apnews.com"
        };
        var perDomainTarget = Math.Clamp((targetCount / 2) + 1, 2, 4);
        var normalizedQuery = (query ?? string.Empty).Trim();
        var escapedQuery = Uri.EscapeDataString(
            string.IsNullOrWhiteSpace(normalizedQuery) ? "latest breaking news" : normalizedQuery
        );

        var results = new List<WebSearchResultItem>(targetCount);
        var seenUrls = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var domainTasks = fallbackDomains
            .Select(domain => TryCollectDomainFeedItemsAsync(domain, perDomainTarget, cancellationToken))
            .ToArray();
        try
        {
            await Task.WhenAll(domainTasks).ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
        }
        catch
        {
        }

        foreach (var task in domainTasks)
        {
            WebSearchResultItem[] domainItems;
            if (task.IsCompletedSuccessfully)
            {
                domainItems = task.Result;
            }
            else
            {
                continue;
            }

            foreach (var item in domainItems)
            {
                if (results.Count >= targetCount)
                {
                    return results.ToArray();
                }

                if (!seenUrls.Add(item.Url) || IsHardNonArticleCandidate(item))
                {
                    continue;
                }

                var citationId = $"c{results.Count + 1}";
                results.Add(item with { CitationId = citationId });
            }
        }

        if (results.Count >= targetCount)
        {
            return results.ToArray();
        }

        var feedUrls = new[]
        {
            "https://news.google.com/rss?hl=ko&gl=KR&ceid=KR:ko",
            $"https://news.google.com/rss/search?q={escapedQuery}&hl=ko&gl=KR&ceid=KR:ko",
            $"https://news.google.com/rss/search?q={escapedQuery}&hl=en-US&gl=US&ceid=US:en"
        };
        foreach (var feedUrl in feedUrls)
        {
            if (results.Count >= targetCount)
            {
                break;
            }

            var feedText = await TryReadHttpTextAsync(feedUrl, cancellationToken).ConfigureAwait(false);
            if (string.IsNullOrWhiteSpace(feedText))
            {
                continue;
            }

            foreach (var feedItem in ParseFeedItemsWithoutDomainConstraint(feedText, feedUrl))
            {
                if (results.Count >= targetCount)
                {
                    break;
                }

                if (!seenUrls.Add(feedItem.Url) || IsHardNonArticleCandidate(feedItem))
                {
                    continue;
                }

                var citationId = $"c{results.Count + 1}";
                results.Add(feedItem with { CitationId = citationId });
            }
        }

        return results.ToArray();
    }

    private static async Task<string> TryReadHttpTextAsync(string url, CancellationToken cancellationToken)
    {
        try
        {
            using var response = await SourceFeedHttpClient.GetAsync(url, cancellationToken).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
            {
                return string.Empty;
            }

            var content = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
            return content.Length <= 6_000_000 ? content : content[..6_000_000];
        }
        catch
        {
            return string.Empty;
        }
    }

    private static IReadOnlyList<string> ExtractFeedUrlsFromHtml(string baseUrl, string html)
    {
        var discovered = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        if (!Uri.TryCreate(baseUrl, UriKind.Absolute, out var baseUri))
        {
            return Array.Empty<string>();
        }

        foreach (Match tagMatch in HtmlLinkTagRegex.Matches(html ?? string.Empty))
        {
            var tag = tagMatch.Value ?? string.Empty;
            if (tag.Length == 0)
            {
                continue;
            }

            if (!tag.Contains("application/rss+xml", StringComparison.OrdinalIgnoreCase)
                && !tag.Contains("application/atom+xml", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            var hrefMatch = HtmlHrefRegex.Match(tag);
            if (!hrefMatch.Success)
            {
                continue;
            }

            var href = (hrefMatch.Groups["href"].Value ?? string.Empty).Trim();
            if (href.Length == 0)
            {
                continue;
            }

            if (!Uri.TryCreate(baseUri, href, out var resolved))
            {
                continue;
            }

            if (!resolved.Scheme.Equals("http", StringComparison.OrdinalIgnoreCase)
                && !resolved.Scheme.Equals("https", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            discovered.Add(resolved.AbsoluteUri);
        }

        return discovered.ToArray();
    }

    private static IReadOnlyList<WebSearchResultItem> ParseFeedItems(
        string xmlText,
        string feedUrl,
        string sourceDomain
    )
    {
        if (!Uri.TryCreate(feedUrl, UriKind.Absolute, out var feedUri))
        {
            return Array.Empty<WebSearchResultItem>();
        }

        try
        {
            var doc = XDocument.Parse(xmlText, LoadOptions.None);
            var items = new List<WebSearchResultItem>(16);

            IEnumerable<XElement> entryElements = doc
                .Descendants()
                .Where(x => x.Name.LocalName is "item" or "entry");
            foreach (var entry in entryElements)
            {
                var title = NormalizeFeedText(FirstChildValue(entry, "title"));
                var link = ResolveFeedEntryLink(entry, feedUri);
                if (link.Length == 0 || title.Length == 0)
                {
                    continue;
                }

                if (!Uri.TryCreate(link, UriKind.Absolute, out var linkUri))
                {
                    continue;
                }

                var host = linkUri.Host.Trim().ToLowerInvariant();
                if (!host.Equals(sourceDomain, StringComparison.OrdinalIgnoreCase)
                    && !host.EndsWith("." + sourceDomain, StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                var description = NormalizeFeedText(
                    FirstChildValue(entry, "description")
                    ?? FirstChildValue(entry, "summary")
                    ?? FirstChildValue(entry, "content")
                );
                var publishedRaw = NormalizeFeedText(
                    FirstChildValue(entry, "pubDate")
                    ?? FirstChildValue(entry, "updated")
                    ?? FirstChildValue(entry, "published")
                );
                var published = publishedRaw.Length == 0 ? null : publishedRaw;
                items.Add(new WebSearchResultItem(
                    Title: title,
                    Url: link,
                    Description: description.Length == 0 ? "핵심 내용 확인이 필요합니다." : description,
                    Published: published,
                    CitationId: "-"
                ));
            }

            return items;
        }
        catch
        {
            return Array.Empty<WebSearchResultItem>();
        }
    }

    private static IReadOnlyList<WebSearchResultItem> ParseFeedItemsWithoutDomainConstraint(
        string xmlText,
        string feedUrl
    )
    {
        if (!Uri.TryCreate(feedUrl, UriKind.Absolute, out var feedUri))
        {
            return Array.Empty<WebSearchResultItem>();
        }

        try
        {
            var doc = XDocument.Parse(xmlText, LoadOptions.None);
            var items = new List<WebSearchResultItem>(16);

            IEnumerable<XElement> entryElements = doc
                .Descendants()
                .Where(x => x.Name.LocalName is "item" or "entry");
            foreach (var entry in entryElements)
            {
                var title = NormalizeFeedText(FirstChildValue(entry, "title"));
                var link = ResolveFeedEntryLink(entry, feedUri);
                if (link.Length == 0 || title.Length == 0)
                {
                    continue;
                }

                var description = NormalizeFeedText(
                    FirstChildValue(entry, "description")
                    ?? FirstChildValue(entry, "summary")
                    ?? FirstChildValue(entry, "content")
                );
                var publishedRaw = NormalizeFeedText(
                    FirstChildValue(entry, "pubDate")
                    ?? FirstChildValue(entry, "updated")
                    ?? FirstChildValue(entry, "published")
                );
                var published = publishedRaw.Length == 0 ? null : publishedRaw;
                items.Add(new WebSearchResultItem(
                    Title: title,
                    Url: link,
                    Description: description.Length == 0 ? "핵심 내용 확인이 필요합니다." : description,
                    Published: published,
                    CitationId: "-"
                ));
            }

            return items;
        }
        catch
        {
            return Array.Empty<WebSearchResultItem>();
        }
    }

    private static IReadOnlyList<WebSearchResultItem> ExtractArticleItemsFromHtml(
        string baseUrl,
        string html,
        string sourceDomain,
        int maxItems
    )
    {
        if (maxItems <= 0
            || string.IsNullOrWhiteSpace(baseUrl)
            || string.IsNullOrWhiteSpace(html)
            || !Uri.TryCreate(baseUrl, UriKind.Absolute, out var baseUri))
        {
            return Array.Empty<WebSearchResultItem>();
        }

        var items = new List<WebSearchResultItem>(maxItems);
        var seenUrls = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (Match match in HtmlAnchorTagRegex.Matches(html))
        {
            if (items.Count >= maxItems)
            {
                break;
            }

            if (!match.Success)
            {
                continue;
            }

            var href = (match.Groups["href"].Value ?? string.Empty).Trim();
            if (href.Length == 0
                || href.StartsWith("#", StringComparison.Ordinal)
                || href.StartsWith("javascript:", StringComparison.OrdinalIgnoreCase)
                || href.StartsWith("mailto:", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            if (!Uri.TryCreate(baseUri, href, out var resolved))
            {
                continue;
            }

            var scheme = resolved.Scheme.ToLowerInvariant();
            if (!scheme.Equals("http", StringComparison.Ordinal)
                && !scheme.Equals("https", StringComparison.Ordinal))
            {
                continue;
            }

            var host = (resolved.Host ?? string.Empty).Trim().ToLowerInvariant();
            if (!host.Equals(sourceDomain, StringComparison.OrdinalIgnoreCase)
                && !host.EndsWith("." + sourceDomain, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            var absoluteUrl = resolved.AbsoluteUri;
            if (!seenUrls.Add(absoluteUrl))
            {
                continue;
            }

            var rawText = match.Groups["text"].Value ?? string.Empty;
            var title = NormalizeFeedText(rawText);
            if (title.Length < 18 || title.Length > 180)
            {
                continue;
            }

            items.Add(new WebSearchResultItem(
                Title: title,
                Url: absoluteUrl,
                Description: $"{title} 관련 {sourceDomain} 공식 업데이트 항목입니다.",
                Published: null,
                CitationId: "-"
            ));
        }

        return items;
    }

    private static IReadOnlyList<WebSearchResultItem> ParseSitemapItems(
        string xmlText,
        string sourceDomain,
        int maxItems
    )
    {
        if (maxItems <= 0 || string.IsNullOrWhiteSpace(xmlText))
        {
            return Array.Empty<WebSearchResultItem>();
        }

        try
        {
            var doc = XDocument.Parse(xmlText, LoadOptions.None);
            var items = new List<WebSearchResultItem>(maxItems);
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var loc in doc.Descendants().Where(x => x.Name.LocalName == "loc"))
            {
                if (items.Count >= maxItems)
                {
                    break;
                }

                var url = (loc.Value ?? string.Empty).Trim();
                if (url.Length == 0 || !Uri.TryCreate(url, UriKind.Absolute, out var uri))
                {
                    continue;
                }

                var host = (uri.Host ?? string.Empty).Trim().ToLowerInvariant();
                if (!host.Equals(sourceDomain, StringComparison.OrdinalIgnoreCase)
                    && !host.EndsWith("." + sourceDomain, StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                var absoluteUrl = uri.AbsoluteUri;
                if (!seen.Add(absoluteUrl))
                {
                    continue;
                }

                var title = BuildTitleFromUrlPathForSitemap(uri);
                if (title.Length == 0)
                {
                    continue;
                }

                items.Add(new WebSearchResultItem(
                    Title: title,
                    Url: absoluteUrl,
                    Description: $"{title} 관련 {sourceDomain} 공식 업데이트 항목입니다.",
                    Published: null,
                    CitationId: "-"
                ));
            }

            return items;
        }
        catch
        {
            return Array.Empty<WebSearchResultItem>();
        }
    }

    private static async Task<WebSearchResultItem[]> TryCollectSitemapItemsAsync(
        string sourceDomain,
        int maxItems,
        CancellationToken cancellationToken
    )
    {
        if (maxItems <= 0 || string.IsNullOrWhiteSpace(sourceDomain))
        {
            return Array.Empty<WebSearchResultItem>();
        }

        var pendingSitemaps = new Queue<string>();
        pendingSitemaps.Enqueue($"https://{sourceDomain}/sitemap.xml");
        pendingSitemaps.Enqueue($"https://{sourceDomain}/sitemap_index.xml");

        var seenSitemaps = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var seenUrls = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var items = new List<WebSearchResultItem>(maxItems);
        const int maxSitemapFetches = 6;

        while (pendingSitemaps.Count > 0
               && seenSitemaps.Count < maxSitemapFetches
               && items.Count < maxItems)
        {
            var sitemapUrl = pendingSitemaps.Dequeue();
            if (!seenSitemaps.Add(sitemapUrl))
            {
                continue;
            }

            var sitemapXml = await TryReadHttpTextAsync(sitemapUrl, cancellationToken).ConfigureAwait(false);
            if (string.IsNullOrWhiteSpace(sitemapXml))
            {
                continue;
            }

            XDocument doc;
            try
            {
                doc = XDocument.Parse(sitemapXml, LoadOptions.None);
            }
            catch
            {
                continue;
            }

            foreach (var loc in doc.Descendants().Where(x => x.Name.LocalName == "loc"))
            {
                if (items.Count >= maxItems)
                {
                    break;
                }

                var url = (loc.Value ?? string.Empty).Trim();
                if (url.Length == 0 || !Uri.TryCreate(url, UriKind.Absolute, out var uri))
                {
                    continue;
                }

                var host = (uri.Host ?? string.Empty).Trim().ToLowerInvariant();
                if (!host.Equals(sourceDomain, StringComparison.OrdinalIgnoreCase)
                    && !host.EndsWith("." + sourceDomain, StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                var absoluteUrl = uri.AbsoluteUri;
                var path = (uri.AbsolutePath ?? string.Empty).Trim().ToLowerInvariant();
                var maybeNestedSitemap = path.EndsWith(".xml", StringComparison.OrdinalIgnoreCase)
                                         || path.Contains("sitemap", StringComparison.OrdinalIgnoreCase);
                if (maybeNestedSitemap)
                {
                    if (seenSitemaps.Count + pendingSitemaps.Count < maxSitemapFetches
                        && !seenSitemaps.Contains(absoluteUrl))
                    {
                        pendingSitemaps.Enqueue(absoluteUrl);
                    }
                    continue;
                }

                if (!seenUrls.Add(absoluteUrl))
                {
                    continue;
                }

                var title = BuildTitleFromUrlPathForSitemap(uri);
                if (title.Length == 0)
                {
                    continue;
                }

                items.Add(new WebSearchResultItem(
                    Title: title,
                    Url: absoluteUrl,
                    Description: "핵심 내용 확인이 필요합니다.",
                    Published: null,
                    CitationId: "-"
                ));
            }
        }

        return items.ToArray();
    }

    private static string BuildTitleFromUrlPathForSitemap(Uri uri)
    {
        var path = (uri.AbsolutePath ?? string.Empty).Trim('/');
        if (path.Length == 0)
        {
            return string.Empty;
        }

        var lastSegment = path.Split('/', StringSplitOptions.RemoveEmptyEntries).LastOrDefault() ?? string.Empty;
        if (lastSegment.Length == 0)
        {
            return string.Empty;
        }

        var slug = WebUtility.UrlDecode(lastSegment);
        if (slug.EndsWith(".html", StringComparison.OrdinalIgnoreCase))
        {
            slug = slug[..^5];
        }
        else if (slug.EndsWith(".htm", StringComparison.OrdinalIgnoreCase))
        {
            slug = slug[..^4];
        }

        slug = Regex.Replace(slug, @"[_\-]+", " ").Trim();
        slug = Regex.Replace(slug, @"\s+", " ").Trim();
        if (slug.Length < 8)
        {
            return string.Empty;
        }

        return slug.Length <= 160 ? slug : slug[..160].TrimEnd();
    }

    private static string ResolveFeedEntryLink(XElement entry, Uri feedUri)
    {
        var direct = NormalizeFeedText(FirstChildValue(entry, "link"));
        if (direct.Length > 0)
        {
            if (Uri.TryCreate(feedUri, direct, out var resolved))
            {
                return resolved.AbsoluteUri;
            }
        }

        var linkElement = entry
            .Elements()
            .FirstOrDefault(x => x.Name.LocalName == "link"
                && (x.Attribute("rel") == null
                    || string.Equals(x.Attribute("rel")?.Value, "alternate", StringComparison.OrdinalIgnoreCase)));
        if (linkElement != null)
        {
            var href = (linkElement.Attribute("href")?.Value ?? string.Empty).Trim();
            if (href.Length > 0 && Uri.TryCreate(feedUri, href, out var resolved))
            {
                return resolved.AbsoluteUri;
            }
        }

        return string.Empty;
    }

    private static string? FirstChildValue(XElement entry, string localName)
    {
        return entry.Elements().FirstOrDefault(x => x.Name.LocalName == localName)?.Value;
    }

    private static string NormalizeFeedText(string? value)
    {
        var normalized = (value ?? string.Empty)
            .Replace("\r\n", " ", StringComparison.Ordinal)
            .Replace("\r", " ", StringComparison.Ordinal)
            .Replace("\n", " ", StringComparison.Ordinal);
        normalized = WebUtility.HtmlDecode(normalized);
        normalized = Regex.Replace(normalized, @"<[^>]+>", " ");
        normalized = Regex.Replace(normalized, @"\s+", " ").Trim();
        if (normalized.Length <= 220)
        {
            return normalized;
        }

        return normalized[..220].TrimEnd() + "...";
    }

    private static bool ShouldRetrySearchWithRelaxedConstraint(SearchAnswerGuardFailure? failure)
    {
        if (failure is null)
        {
            return false;
        }

        if (failure.Category == SearchAnswerGuardFailureCategory.Freshness)
        {
            var freshnessReason = NormalizeSearchGuardReason(failure.ReasonCode);
            return freshnessReason == "freshness_guard_failed";
        }

        if (failure.Category != SearchAnswerGuardFailureCategory.Coverage)
        {
            return false;
        }

        var reason = NormalizeSearchGuardReason(failure.ReasonCode);
        return reason is "no_documents"
            or "insufficient_document_count"
            or "count_lock_unsatisfied"
            or "count_lock_unsatisfied_after_retries";
    }

    private static bool ShouldReturnPartialResultFromCountLock(
        SearchAnswerGuardFailure? failure,
        SearchResponse response
    )
    {
        if (failure is null || response.Documents.Count == 0)
        {
            return false;
        }

        var reason = NormalizeSearchGuardReason(failure.ReasonCode);
        return reason is "count_lock_unsatisfied"
            or "count_lock_unsatisfied_after_retries"
            or "insufficient_document_count";
    }

    private static int? ResolveRelaxedGatewayRetryCount(string query, int? currentCount)
    {
        if (!currentCount.HasValue || currentCount.Value <= 0)
        {
            return currentCount;
        }

        if (RequestedCountRegex.IsMatch(query) || TopCountRegex.IsMatch(query))
        {
            return currentCount;
        }

        return currentCount.Value > 5 ? 5 : currentCount;
    }

    private static string? ResolveRelaxedGatewayRetryFreshness(string? freshness)
    {
        var normalized = NormalizeGatewayFreshness(freshness);
        return normalized switch
        {
            "day" => "week",
            _ => freshness
        };
    }

    private static string NormalizeGatewayFreshness(string? freshness)
    {
        var normalized = (freshness ?? string.Empty).Trim().ToLowerInvariant();
        return normalized switch
        {
            "d" or "day" or "pd" => "day",
            "w" or "week" or "pw" => "week",
            "m" or "month" or "pm" => "month",
            "y" or "year" or "py" => "year",
            _ => normalized
        };
    }

    private static string NormalizeSearchAuditSource(string? source)
    {
        var normalized = (source ?? string.Empty).Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return "web";
        }

        return Regex.Replace(normalized, @"\s+", "_");
    }

    private static string NormalizeSearchGuardCategory(string? category)
    {
        var normalized = (category ?? string.Empty).Trim().ToLowerInvariant();
        return normalized switch
        {
            "coverage" or "freshness" or "credibility" => normalized,
            _ => "-"
        };
    }

    private static string NormalizeSearchGuardReason(string? reason)
    {
        var normalized = (reason ?? string.Empty).Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return "-";
        }

        return Regex.Replace(normalized, @"\s+", "_");
    }

    private static string NormalizeSearchGuardDetail(string? detail)
    {
        var normalized = (detail ?? string.Empty)
            .Replace('\r', ' ')
            .Replace('\n', ' ')
            .Trim();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return "-";
        }

        return normalized.Length <= 180
            ? normalized
            : normalized[..180] + "...";
    }

    private static SearchRequest BuildSearchGatewayRequest(string query, int? count, string? freshness)
    {
        var targetCount = ResolveGatewayTargetCount(count);
        var strictTodayWindow = IsTodayWindowQuery(query);
        var maxAgeHours = ResolveMaxAgeHours(freshness, strictTodayWindow);
        var timeSensitivity = strictTodayWindow
            ? QueryTimeSensitivity.High
            : ResolveQueryTimeSensitivity(query, freshness);
        var timezone = ResolveLocalTimezoneId();
        return new SearchRequest(
            Query: query,
            RequestedAtUtc: DateTimeOffset.UtcNow,
            UserLocale: ResolveLocalLocale(),
            UserTimezone: timezone,
            IntentProfile: new SearchIntentProfile(
                TimeSensitivity: timeSensitivity,
                RiskLevel: QueryRiskLevel.Normal,
                AnswerType: QueryAnswerType.List
            ),
            Constraints: new SearchConstraints(
                TargetCount: targetCount,
                MinIndependentSources: 1,
                MaxAgeHours: maxAgeHours,
                StrictTodayWindow: strictTodayWindow
            )
        );
    }

    private static int ResolveGatewayTargetCount(int? count)
    {
        if (!count.HasValue || count.Value <= 0)
        {
            return 5;
        }

        return Math.Clamp(count.Value, 1, 10);
    }

    private static int ResolveMaxAgeHours(string? freshness, bool strictTodayWindow)
    {
        if (strictTodayWindow)
        {
            return 24;
        }

        var normalized = (freshness ?? string.Empty).Trim().ToLowerInvariant();
        return normalized switch
        {
            "d" or "day" or "pd" => 24,
            "w" or "week" or "pw" => 24 * 7,
            "m" or "month" or "pm" => 24 * 31,
            "y" or "year" or "py" => 24 * 365,
            _ => 24 * 7
        };
    }

    private static QueryTimeSensitivity ResolveQueryTimeSensitivity(string query, string? freshness)
    {
        if (ResolveMaxAgeHours(freshness, strictTodayWindow: false) <= 24)
        {
            return QueryTimeSensitivity.High;
        }

        var lowered = (query ?? string.Empty).Trim().ToLowerInvariant();
        if (lowered.Length == 0)
        {
            return QueryTimeSensitivity.Medium;
        }

        if (lowered.Contains("최신", StringComparison.Ordinal)
            || lowered.Contains("실시간", StringComparison.Ordinal)
            || lowered.Contains("recent", StringComparison.Ordinal)
            || lowered.Contains("latest", StringComparison.Ordinal))
        {
            return QueryTimeSensitivity.High;
        }

        return QueryTimeSensitivity.Medium;
    }

    private static bool IsTodayWindowQuery(string query)
    {
        var lowered = (query ?? string.Empty).Trim().ToLowerInvariant();
        if (lowered.Length == 0)
        {
            return false;
        }

        return lowered.Contains("오늘", StringComparison.Ordinal)
               || lowered.Contains("today", StringComparison.Ordinal);
    }

    private static string ResolveLocalLocale()
    {
        var culture = CultureInfo.CurrentCulture;
        if (!string.IsNullOrWhiteSpace(culture.Name))
        {
            return culture.Name;
        }

        return "ko-KR";
    }

    private static string ResolveLocalTimezoneId()
    {
        try
        {
            return TimeZoneInfo.Local.Id;
        }
        catch
        {
            return "UTC";
        }
    }

    public Task<WebFetchToolResult> FetchWebAsync(
        string url,
        string? extractMode = null,
        int? maxChars = null,
        CancellationToken cancellationToken = default
    ) => _toolAppService.FetchWebAsync(url, extractMode, maxChars, cancellationToken);

    public BrowserToolResult ExecuteBrowser(
        string? action,
        string? targetUrl = null,
        string? profile = null,
        string? targetId = null,
        int? limit = null
    ) => _toolAppService.ExecuteBrowser(action, targetUrl, profile, targetId, limit);

    public CanvasToolResult ExecuteCanvas(
        string? action,
        string? profile = null,
        string? target = null,
        string? targetUrl = null,
        string? javaScript = null,
        string? jsonl = null,
        string? outputFormat = null,
        int? maxWidth = null
    ) => _toolAppService.ExecuteCanvas(action, profile, target, targetUrl, javaScript, jsonl, outputFormat, maxWidth);

    public NodesToolResult ExecuteNodes(
        string? action,
        string? profile = null,
        string? node = null,
        string? requestId = null,
        string? title = null,
        string? body = null,
        string? priority = null,
        string? delivery = null,
        string? invokeCommand = null,
        string? invokeParamsJson = null
    )
    {
        return _toolAppService.ExecuteNodes(
            action,
            profile,
            node,
            requestId,
            title,
            body,
            priority,
            delivery,
            invokeCommand,
            invokeParamsJson
        );
    }

    private int TriggerDueRoutinesForWake(string source)
    {
        var dueIds = _routineRegistry.ReadAll(routines =>
        {
            var now = DateTimeOffset.UtcNow;
            return routines
                .Where(x => x.Enabled && !x.Running && x.NextRunUtc <= now)
                .Select(x => x.Id)
                .ToList();
        });

        foreach (var id in dueIds)
        {
            _ = Task.Run(async () =>
            {
                try
                {
                    var result = await RoutineAppService.RunRoutineNowAsync(id, source, CancellationToken.None).ConfigureAwait(false);
                    if (!result.Ok)
                    {
                        Console.Error.WriteLine($"[routine] wake run skipped ({id}): {result.Message}");
                    }
                }
                catch (Exception ex)
                {
                    Console.Error.WriteLine($"[routine] wake run failed ({id}): {ex.Message}");
                }
            }, CancellationToken.None);
        }

        return dueIds.Count;
    }

    private static CronToolJob ToCronToolJob(RoutineDefinition routine)
    {
        var createdAtMs = routine.CreatedUtc.ToUnixTimeMilliseconds();
        var updatedAtMs = (routine.LastRunUtc ?? routine.CreatedUtc).ToUnixTimeMilliseconds();
        var requestText = ResolveRoutineExecutionRequestText(routine.Request, routine.Title, routine.ScheduleSourceMode);
        var payloadKind = NormalizeCronPayloadKindOrDefault(routine.CronPayloadKind);
        var payloadText = string.Equals(payloadKind, "agentTurn", StringComparison.Ordinal)
            ? null
            : requestText;
        var payloadMessage = string.Equals(payloadKind, "agentTurn", StringComparison.Ordinal)
            ? requestText
            : null;
        var payloadModel = string.Equals(payloadKind, "agentTurn", StringComparison.Ordinal)
            ? NormalizeOptionalCronPayloadString(routine.CronPayloadModel)
            : null;
        var payloadThinking = string.Equals(payloadKind, "agentTurn", StringComparison.Ordinal)
            ? NormalizeOptionalCronPayloadString(routine.CronPayloadThinking)
            : null;
        var payloadTimeoutSeconds = string.Equals(payloadKind, "agentTurn", StringComparison.Ordinal)
            ? routine.CronPayloadTimeoutSeconds
            : null;
        var payloadLightContext = string.Equals(payloadKind, "agentTurn", StringComparison.Ordinal)
            ? routine.CronPayloadLightContext
            : null;
        var status = NormalizeCronRunStatus(routine.LastStatus);
        var lastError = status == "error"
            ? TrimForCronError(routine.LastOutput)
            : null;
        var scheduleKind = NormalizeCronScheduleKind(routine.CronScheduleKind);
        var scheduleExpr = scheduleKind == "cron"
            ? (string.IsNullOrWhiteSpace(routine.CronScheduleExpr) ? $"{routine.Minute} {routine.Hour} * * *" : routine.CronScheduleExpr.Trim())
            : null;
        var scheduleTz = scheduleKind == "cron"
            ? (string.IsNullOrWhiteSpace(routine.TimezoneId) ? TimeZoneInfo.Local.Id : routine.TimezoneId)
            : null;
        var scheduleAt = scheduleKind == "at"
            ? FormatCronAtSchedule(routine.CronScheduleAtMs)
            : null;
        var scheduleEveryMs = scheduleKind == "every"
            ? NormalizeCronEveryMs(routine.CronScheduleEveryMs)
            : null;
        var scheduleAnchorMs = scheduleKind == "every"
            ? routine.CronScheduleAnchorMs
            : null;

        return new CronToolJob(
            Id: routine.Id,
            Name: string.IsNullOrWhiteSpace(routine.Title) ? routine.Id : routine.Title,
            Enabled: routine.Enabled,
            CreatedAtMs: createdAtMs,
            UpdatedAtMs: updatedAtMs,
            SessionTarget: NormalizeCronSessionTargetOrDefault(routine.CronSessionTarget),
            WakeMode: string.IsNullOrWhiteSpace(routine.CronWakeMode) ? "next-heartbeat" : routine.CronWakeMode,
            Schedule: new CronToolSchedule(
                Kind: scheduleKind,
                Expr: scheduleExpr,
                Tz: scheduleTz,
                At: scheduleAt,
                EveryMs: scheduleEveryMs,
                AnchorMs: scheduleAnchorMs
            ),
            Payload: new CronToolPayload(
                payloadKind,
                payloadText,
                payloadMessage,
                payloadModel,
                payloadThinking,
                payloadTimeoutSeconds,
                payloadLightContext
            ),
            State: new CronToolJobState(
                NextRunAtMs: routine.Enabled ? routine.NextRunUtc.ToUnixTimeMilliseconds() : null,
                RunningAtMs: routine.Running ? DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() : null,
                LastRunAtMs: routine.LastRunUtc?.ToUnixTimeMilliseconds(),
                LastRunStatus: status,
                LastError: lastError,
                LastDurationMs: routine.LastDurationMs
            ),
            Description: string.IsNullOrWhiteSpace(routine.CronDescription) ? routine.ScheduleText : routine.CronDescription
        );
    }

    private static IReadOnlyList<CronToolRunLogEntry> BuildCronRunEntries(RoutineDefinition routine)
    {
        var entries = new List<CronToolRunLogEntry>();
        if (routine.CronRunLog != null)
        {
            foreach (var raw in routine.CronRunLog)
            {
                if (raw is null || raw.Ts <= 0)
                {
                    continue;
                }

                var action = string.IsNullOrWhiteSpace(raw.Action)
                    ? "finished"
                    : raw.Action.Trim().ToLowerInvariant();
                if (!string.Equals(action, "finished", StringComparison.Ordinal))
                {
                    continue;
                }

                var status = NormalizeCronRunStatus(raw.Status);
                entries.Add(new CronToolRunLogEntry(
                    Ts: raw.Ts,
                    JobId: routine.Id,
                    Action: "finished",
                    Status: status,
                    Source: string.IsNullOrWhiteSpace(raw.Source) ? null : raw.Source,
                    AttemptCount: Math.Max(1, raw.AttemptCount),
                    Error: status == "error" ? TrimForCronError(raw.Error) : null,
                    Summary: BuildCronRunEntrySummary(raw.Summary ?? string.Empty),
                    TelegramStatus: string.IsNullOrWhiteSpace(raw.TelegramStatus) ? null : raw.TelegramStatus,
                    ArtifactPath: string.IsNullOrWhiteSpace(raw.ArtifactPath) ? null : raw.ArtifactPath,
                    RunAtMs: raw.RunAtMs,
                    DurationMs: raw.DurationMs,
                    NextRunAtMs: raw.NextRunAtMs,
                    JobName: string.IsNullOrWhiteSpace(routine.Title) ? null : routine.Title
                ));
            }
        }

        if (entries.Count > 0 || !routine.LastRunUtc.HasValue)
        {
            return entries;
        }

        var fallbackStatus = NormalizeCronRunStatus(routine.LastStatus);
        entries.Add(new CronToolRunLogEntry(
            Ts: routine.LastRunUtc.Value.ToUnixTimeMilliseconds(),
            JobId: routine.Id,
            Action: "finished",
            Status: fallbackStatus,
            Source: null,
            AttemptCount: 1,
            Error: fallbackStatus == "error" ? TrimForCronError(routine.LastOutput) : null,
            Summary: BuildCronRunEntrySummary(routine.LastOutput),
            TelegramStatus: null,
            ArtifactPath: null,
            RunAtMs: routine.LastRunUtc.Value.ToUnixTimeMilliseconds(),
            DurationMs: routine.LastDurationMs,
            NextRunAtMs: routine.Enabled ? routine.NextRunUtc.ToUnixTimeMilliseconds() : null,
            JobName: string.IsNullOrWhiteSpace(routine.Title) ? null : routine.Title
        ));
        return entries;
    }

    private static bool IsCronRunLogJobIdSafe(string candidate)
    {
        return candidate.IndexOf('/') < 0
            && candidate.IndexOf('\\') < 0
            && !candidate.Contains('\0');
    }

    private static string? ReadJsonString(JsonElement obj, string propertyName)
    {
        if (!obj.TryGetProperty(propertyName, out var element))
        {
            return null;
        }

        if (element.ValueKind != JsonValueKind.String)
        {
            return null;
        }

        var value = element.GetString();
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }

    internal static string? NormalizeOptionalCronPayloadString(string? value)
    {
        var normalized = (value ?? string.Empty).Trim();
        return normalized.Length == 0 ? null : normalized;
    }

    private static bool TryReadCronPayloadTimeoutSeconds(JsonElement element, out int timeoutSeconds)
    {
        timeoutSeconds = 0;
        if (element.ValueKind == JsonValueKind.Number)
        {
            if (!element.TryGetInt32(out timeoutSeconds))
            {
                return false;
            }

            return timeoutSeconds >= 0;
        }

        if (element.ValueKind == JsonValueKind.String)
        {
            var raw = (element.GetString() ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(raw)
                || !int.TryParse(raw, NumberStyles.Integer, CultureInfo.InvariantCulture, out timeoutSeconds))
            {
                return false;
            }

            return timeoutSeconds >= 0;
        }

        return false;
    }

    private static bool TryParseDailyCronExpression(
        string expr,
        out int hour,
        out int minute,
        out string normalizedExpr,
        out string error
    )
    {
        hour = 0;
        minute = 0;
        normalizedExpr = string.Empty;
        error = "invalid cron expression";

        var tokens = (expr ?? string.Empty)
            .Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (tokens.Length != 5)
        {
            error = "schedule.expr must use 5-field cron syntax (m h dom mon dow)";
            return false;
        }

        if (!int.TryParse(tokens[0], NumberStyles.Integer, CultureInfo.InvariantCulture, out minute)
            || minute < 0 || minute > 59)
        {
            error = "schedule.expr minute must be 0-59";
            return false;
        }

        if (!int.TryParse(tokens[1], NumberStyles.Integer, CultureInfo.InvariantCulture, out hour)
            || hour < 0 || hour > 23)
        {
            error = "schedule.expr hour must be 0-23";
            return false;
        }

        if (!string.Equals(tokens[2], "*", StringComparison.Ordinal)
            || !string.Equals(tokens[3], "*", StringComparison.Ordinal)
            || !string.Equals(tokens[4], "*", StringComparison.Ordinal))
        {
            error = "routine bridge only supports daily cron expressions: '<minute> <hour> * * *'";
            return false;
        }

        normalizedExpr = $"{minute} {hour} * * *";
        return true;
    }

    private static bool TryResolveCronTimeZone(string? timezoneRaw, out string timezoneId, out string error)
    {
        error = string.Empty;
        if (string.IsNullOrWhiteSpace(timezoneRaw))
        {
            timezoneId = TimeZoneInfo.Local.Id;
            return true;
        }

        var candidate = timezoneRaw.Trim();
        try
        {
            timezoneId = TimeZoneInfo.FindSystemTimeZoneById(candidate).Id;
            return true;
        }
        catch
        {
            timezoneId = TimeZoneInfo.Local.Id;
            error = $"unsupported timezone: {candidate}";
            return false;
        }
    }

    private static bool TryReadJsonLong(JsonElement element, out long value)
    {
        value = 0L;
        if (element.ValueKind == JsonValueKind.Number)
        {
            return element.TryGetInt64(out value);
        }

        if (element.ValueKind != JsonValueKind.String)
        {
            return false;
        }

        var raw = (element.GetString() ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(raw))
        {
            return false;
        }

        return long.TryParse(raw, NumberStyles.Integer, CultureInfo.InvariantCulture, out value);
    }

    private static bool TryConvertUnixMsToLocalTime(long unixMs, out DateTimeOffset localTime)
    {
        localTime = DateTimeOffset.MinValue;
        try
        {
            localTime = DateTimeOffset.FromUnixTimeMilliseconds(unixMs).ToLocalTime();
            return true;
        }
        catch
        {
            return false;
        }
    }

    private static bool TryParseCronEverySchedule(
        JsonElement scheduleElement,
        out long everyMs,
        out long? anchorMs,
        out string error
    )
    {
        everyMs = 0L;
        anchorMs = null;
        error = string.Empty;

        if (!scheduleElement.TryGetProperty("everyMs", out var everyElement))
        {
            error = "schedule.everyMs is required for schedule.kind=every";
            return false;
        }

        if (!TryReadJsonLong(everyElement, out everyMs) || everyMs < 1)
        {
            error = "schedule.everyMs must be integer >= 1";
            return false;
        }

        if (!scheduleElement.TryGetProperty("anchorMs", out var anchorElement))
        {
            return true;
        }

        if (!TryReadJsonLong(anchorElement, out var parsedAnchorMs) || parsedAnchorMs < 0)
        {
            error = "schedule.anchorMs must be integer >= 0 when provided";
            return false;
        }

        if (!TryConvertUnixMsToLocalTime(parsedAnchorMs, out _))
        {
            error = "schedule.anchorMs is out of range";
            return false;
        }

        anchorMs = parsedAnchorMs;
        return true;
    }

    private static long ResolveCronEveryAnchorMs(long? anchorMs, long fallbackAnchorMs)
    {
        if (anchorMs.HasValue)
        {
            return Math.Max(0L, anchorMs.Value);
        }

        return Math.Max(0L, fallbackAnchorMs);
    }

    private static long? NormalizeCronEveryMs(long? everyMs)
    {
        if (!everyMs.HasValue)
        {
            return null;
        }

        return everyMs.Value < 1 ? 1 : everyMs.Value;
    }

    private static long ComputeNextCronEveryFromAnchorMs(
        long everyMsRaw,
        long anchorMsRaw,
        long nowMs,
        long? lastRunAtMs
    )
    {
        var everyMs = Math.Max(1L, everyMsRaw);
        if (lastRunAtMs.HasValue && lastRunAtMs.Value >= 0)
        {
            var nextFromLastRun = lastRunAtMs.Value + everyMs;
            if (nextFromLastRun > nowMs && nextFromLastRun > 0)
            {
                return nextFromLastRun;
            }
        }

        var anchorMs = Math.Max(0L, anchorMsRaw);
        if (nowMs < anchorMs)
        {
            return anchorMs;
        }

        var elapsed = nowMs - anchorMs;
        var steps = Math.Max(1L, (elapsed + everyMs - 1L) / everyMs);
        if (steps > (long.MaxValue / everyMs))
        {
            return long.MaxValue;
        }

        var next = anchorMs + (steps * everyMs);
        if (next <= nowMs)
        {
            if (everyMs > long.MaxValue - next)
            {
                return long.MaxValue;
            }

            next += everyMs;
        }

        return next;
    }

    private static DateTimeOffset ComputeNextCronEveryFromAnchorUtc(
        long everyMs,
        long anchorMs,
        DateTimeOffset nowUtc,
        long? lastRunAtMs
    )
    {
        var nowMs = nowUtc.ToUnixTimeMilliseconds();
        var nextMs = ComputeNextCronEveryFromAnchorMs(everyMs, anchorMs, nowMs, lastRunAtMs);
        try
        {
            return DateTimeOffset.FromUnixTimeMilliseconds(nextMs).ToUniversalTime();
        }
        catch
        {
            return nowUtc;
        }
    }

    private static string FormatCronEveryInterval(long everyMsRaw)
    {
        var everyMs = Math.Max(1L, everyMsRaw);
        if (everyMs % (60L * 60L * 1000L) == 0)
        {
            return $"매 {everyMs / (60L * 60L * 1000L)}시간마다";
        }

        if (everyMs % (60L * 1000L) == 0)
        {
            return $"매 {everyMs / (60L * 1000L)}분마다";
        }

        if (everyMs % 1000L == 0)
        {
            return $"매 {everyMs / 1000L}초마다";
        }

        return $"매 {everyMs}ms마다";
    }

    private static string BuildCronEveryScheduleDisplay(long everyMs, long? anchorMs)
    {
        var intervalText = FormatCronEveryInterval(everyMs);
        if (!anchorMs.HasValue)
        {
            return intervalText;
        }

        try
        {
            var anchorLocal = DateTimeOffset.FromUnixTimeMilliseconds(anchorMs.Value).ToLocalTime();
            return $"{intervalText} (기준 {anchorLocal:yyyy-MM-dd HH:mm:ss} local)";
        }
        catch
        {
            return intervalText;
        }
    }

    private static bool TryParseCronSessionTarget(string? sessionTargetRaw, bool allowEmpty, out string normalized)
    {
        normalized = "main";
        var candidate = (sessionTargetRaw ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(candidate))
        {
            return allowEmpty;
        }

        var lower = candidate.ToLowerInvariant();
        if (lower is "main" or "isolated")
        {
            normalized = lower;
            return true;
        }

        return false;
    }

    private static bool TryParseCronPayloadKind(string? payloadKindRaw, bool allowEmpty, out string normalized)
    {
        normalized = "systemEvent";
        var candidate = (payloadKindRaw ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(candidate))
        {
            return allowEmpty;
        }

        var compact = candidate.Replace("-", string.Empty, StringComparison.Ordinal)
            .Replace("_", string.Empty, StringComparison.Ordinal)
            .ToLowerInvariant();
        if (compact == "systemevent")
        {
            normalized = "systemEvent";
            return true;
        }

        if (compact == "agentturn")
        {
            normalized = "agentTurn";
            return true;
        }

        return false;
    }

    internal static string NormalizeCronPayloadKindOrDefault(string? payloadKindRaw)
    {
        return TryParseCronPayloadKind(payloadKindRaw, allowEmpty: true, out var normalized)
            ? normalized
            : "systemEvent";
    }

    private static string? ValidateCronPayloadContract(string sessionTarget, string payloadKind)
    {
        if (string.Equals(sessionTarget, "main", StringComparison.Ordinal)
            && !string.Equals(payloadKind, "systemEvent", StringComparison.Ordinal))
        {
            return "main cron jobs require payload.kind=\"systemEvent\"";
        }

        if (string.Equals(sessionTarget, "isolated", StringComparison.Ordinal)
            && !string.Equals(payloadKind, "agentTurn", StringComparison.Ordinal))
        {
            return "isolated cron jobs require payload.kind=\"agentTurn\"";
        }

        return null;
    }

    internal static string NormalizeCronSessionTargetOrDefault(string? sessionTargetRaw)
    {
        return TryParseCronSessionTarget(sessionTargetRaw, allowEmpty: true, out var normalized)
            ? normalized
            : "main";
    }

    internal static string NormalizeCronScheduleKind(string? kind)
    {
        var normalized = (kind ?? string.Empty).Trim().ToLowerInvariant();
        return normalized switch
        {
            "at" => "at",
            "every" => "every",
            _ => "cron"
        };
    }

    internal static DateTimeOffset ComputeNextCronBridgeRunUtc(RoutineDefinition routine, DateTimeOffset nowUtc)
    {
        var scheduleKind = NormalizeCronScheduleKind(routine.CronScheduleKind);
        if (string.Equals(scheduleKind, "at", StringComparison.Ordinal))
        {
            if (routine.CronScheduleAtMs.HasValue)
            {
                try
                {
                    return DateTimeOffset.FromUnixTimeMilliseconds(routine.CronScheduleAtMs.Value).ToUniversalTime();
                }
                catch
                {
                }
            }

            return nowUtc;
        }

        if (string.Equals(scheduleKind, "every", StringComparison.Ordinal))
        {
            var everyMs = NormalizeCronEveryMs(routine.CronScheduleEveryMs) ?? 1L;
            var fallbackAnchorMs = nowUtc.ToUnixTimeMilliseconds();
            if (routine.CreatedUtc != DateTimeOffset.MinValue)
            {
                try
                {
                    fallbackAnchorMs = routine.CreatedUtc.ToUnixTimeMilliseconds();
                }
                catch
                {
                }
            }

            var anchorMs = ResolveCronEveryAnchorMs(routine.CronScheduleAnchorMs, fallbackAnchorMs);
            return ComputeNextCronEveryFromAnchorUtc(
                everyMs,
                anchorMs,
                nowUtc,
                routine.LastRunUtc?.ToUnixTimeMilliseconds()
            );
        }

        return ComputeNextSupportedRoutineCronUtc(
            routine.CronScheduleExpr,
            routine.TimezoneId,
            routine.Hour,
            routine.Minute,
            nowUtc
        );
    }

    private static DateTimeOffset ComputeNextSupportedRoutineCronUtc(
        string? cronExpr,
        string timezoneId,
        int fallbackHour,
        int fallbackMinute,
        DateTimeOffset nowUtc
    )
    {
        if (!RoutineSchedulePolicy.TryParseSupportedCronExpression(
                cronExpr,
                out var kind,
                out var hour,
                out var minute,
                out var dayOfMonth,
                out var weekdays,
                out _,
                out _
            ))
        {
            return ComputeNextDailyRunUtc(fallbackHour, fallbackMinute, timezoneId, nowUtc);
        }

        var tz = RoutineSchedulePolicy.ResolveTimeZone(timezoneId);
        var nowLocal = TimeZoneInfo.ConvertTime(nowUtc, tz);
        var startDate = nowLocal.Date;
        for (var offsetDays = 0; offsetDays <= 800; offsetDays += 1)
        {
            var candidateDate = startDate.AddDays(offsetDays);
            if (string.Equals(kind, "weekly", StringComparison.Ordinal)
                && Array.IndexOf(weekdays, (int)candidateDate.DayOfWeek) < 0)
            {
                continue;
            }

            if (string.Equals(kind, "monthly", StringComparison.Ordinal)
                && candidateDate.Day != dayOfMonth.GetValueOrDefault())
            {
                continue;
            }

            var candidateLocal = new DateTime(
                candidateDate.Year,
                candidateDate.Month,
                candidateDate.Day,
                hour,
                minute,
                0,
                DateTimeKind.Unspecified
            );
            var candidateOffset = tz.GetUtcOffset(candidateLocal);
            var candidateUtc = new DateTimeOffset(candidateLocal, candidateOffset).ToUniversalTime();
            if (candidateUtc > nowUtc)
            {
                return candidateUtc;
            }
        }

        return ComputeNextDailyRunUtc(fallbackHour, fallbackMinute, timezoneId, nowUtc);
    }

    private static string? FormatCronAtSchedule(long? atMs)
    {
        if (!atMs.HasValue)
        {
            return null;
        }

        try
        {
            return DateTimeOffset.FromUnixTimeMilliseconds(atMs.Value)
                .ToUniversalTime()
                .ToString("O", CultureInfo.InvariantCulture);
        }
        catch
        {
            return null;
        }
    }

    private static string BuildCronAtScheduleDisplay(DateTimeOffset atUtc)
    {
        var local = atUtc.ToLocalTime();
        return $"한 번 실행 {local:yyyy-MM-dd HH:mm:ss} (local)";
    }

    private static bool TryParseCronAtSchedule(
        string atRaw,
        out DateTimeOffset atUtc,
        out string normalizedAt,
        out string error
    )
    {
        atUtc = DateTimeOffset.MinValue;
        normalizedAt = string.Empty;
        error = "schedule.at must be an ISO-8601 timestamp or epoch milliseconds";

        var candidate = (atRaw ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(candidate))
        {
            return false;
        }

        if (long.TryParse(candidate, NumberStyles.Integer, CultureInfo.InvariantCulture, out var epochMs)
            && epochMs > 0)
        {
            try
            {
                atUtc = DateTimeOffset.FromUnixTimeMilliseconds(epochMs).ToUniversalTime();
                normalizedAt = atUtc.ToString("O", CultureInfo.InvariantCulture);
                return true;
            }
            catch
            {
                return false;
            }
        }

        var normalizedInput = candidate;
        if (Regex.IsMatch(candidate, @"^\d{4}-\d{2}-\d{2}$", RegexOptions.CultureInvariant))
        {
            normalizedInput = $"{candidate}T00:00:00Z";
        }
        else if (Regex.IsMatch(candidate, @"^\d{4}-\d{2}-\d{2}T", RegexOptions.CultureInvariant)
            && !Regex.IsMatch(candidate, @"(Z|[+-]\d{2}:?\d{2})$", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant))
        {
            normalizedInput = $"{candidate}Z";
        }

        if (!DateTimeOffset.TryParse(
                normalizedInput,
                CultureInfo.InvariantCulture,
                DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal,
                out var parsed))
        {
            return false;
        }

        atUtc = parsed.ToUniversalTime();
        normalizedAt = atUtc.ToString("O", CultureInfo.InvariantCulture);
        return true;
    }

    internal static string ResolveRoutineExecutionRequestText(string? request, string? title, string? scheduleSourceMode)
    {
        var normalizedTask = NormalizeRoutineTaskRequest(request);
        if (!string.IsNullOrWhiteSpace(normalizedTask))
        {
            return normalizedTask;
        }

        var raw = (request ?? string.Empty).Trim();
        if (!string.IsNullOrWhiteSpace(raw))
        {
            return raw;
        }

        return string.IsNullOrWhiteSpace(title)
            ? "scheduled routine"
            : title.Trim();
    }

    internal static string NormalizeRoutineScheduleSourceMode(string? mode, string? request)
    {
        var normalized = (mode ?? string.Empty).Trim().ToLowerInvariant();
        if (normalized is "auto" or "manual")
        {
            return normalized;
        }

        return RoutineSchedulePolicy.ContainsScheduleExpression(request)
            ? "auto"
            : "manual";
    }


    private static string NormalizeRoutineTaskRequest(string? request)
    {
        var normalized = Regex.Replace(
                (request ?? string.Empty).Replace("\r", " ", StringComparison.Ordinal).Replace("\n", " ", StringComparison.Ordinal),
                @"\s+",
                " ",
                RegexOptions.CultureInvariant
            )
            .Trim();
        if (normalized.Length == 0)
        {
            return string.Empty;
        }

        for (var i = 0; i < 4; i += 1)
        {
            var updated = StripLeadingRoutineScheduleDirective(normalized);
            if (string.Equals(updated, normalized, StringComparison.Ordinal))
            {
                break;
            }

            normalized = updated;
        }

        normalized = Regex.Replace(
            normalized,
            @"\s+(?:매일|매주|매월|(?:월|화|수|목|금|토|일)요일(?:마다)?|(?:아침|오전|오후|저녁|밤|새벽)?\s*\d{1,2}(?::\d{2})?\s*(?:시(?:\s*\d{1,2}\s*분)?|분)?(?:\s*반)?)(?:에|마다)?(?=\s*(?:알려줘|보내줘|전송해줘|정리해줘|요약해줘|브리핑해줘|말해줘|공유해줘))",
            string.Empty,
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant
        );
        normalized = Regex.Replace(
            normalized,
            @"\s+(?:보내줘|전송해줘|공유해줘|알려줘|말해줘|보여줘)(?:[.!?]+)?$",
            string.Empty,
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant
        );
        normalized = Regex.Replace(
            normalized,
            @"\s+정리해줘(?:[.!?]+)?$",
            " 정리",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant
        );
        normalized = Regex.Replace(
            normalized,
            @"\s+요약해줘(?:[.!?]+)?$",
            " 요약",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant
        );
        normalized = Regex.Replace(
            normalized,
            @"\s+브리핑해줘(?:[.!?]+)?$",
            " 브리핑",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant
        );
        normalized = Regex.Replace(normalized, @"^\s*[-,:;·/]+\s*", string.Empty, RegexOptions.CultureInvariant).Trim();
        normalized = Regex.Replace(normalized, @"\s{2,}", " ", RegexOptions.CultureInvariant).Trim();
        return normalized;
    }

    private static string StripLeadingRoutineScheduleDirective(string text)
    {
        var normalized = (text ?? string.Empty).Trim();
        if (normalized.Length == 0)
        {
            return string.Empty;
        }

        var options = RegexOptions.IgnoreCase | RegexOptions.CultureInvariant;
        normalized = Regex.Replace(normalized, @"^(?:매일|매주|매월)\s+", string.Empty, options);
        normalized = Regex.Replace(normalized, @"^(?:매주\s*)?(?:월|화|수|목|금|토|일)(?:요일)?(?:\s*(?:,|/|·|및)\s*(?:월|화|수|목|금|토|일)(?:요일)?)*(?:마다)?\s+", string.Empty, options);
        normalized = Regex.Replace(normalized, @"^(?:월|화|수|목|금|토|일)(?:요일)?(?:마다)?\s+", string.Empty, options);
        normalized = Regex.Replace(normalized, @"^매월\s*\d{1,2}\s*일(?:마다)?\s+", string.Empty, options);
        normalized = Regex.Replace(normalized, @"^(?:아침|오전|오후|저녁|밤|새벽)?\s*\d{1,2}(?::\d{2})?\s*(?:시(?:\s*\d{1,2}\s*분)?|분)?(?:\s*반)?(?:에|마다)?\s+", string.Empty, options);
        normalized = Regex.Replace(normalized, @"^(?:마다|에)\s+", string.Empty, options);
        return normalized.Trim();
    }

    internal static string? NormalizeCronRunStatus(string? status)
    {
        var normalized = (status ?? string.Empty).Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return null;
        }

        if (normalized.Contains("error", StringComparison.Ordinal)
            || normalized.Contains("fail", StringComparison.Ordinal))
        {
            return "error";
        }

        if (normalized.Contains("skip", StringComparison.Ordinal))
        {
            return "skipped";
        }

        if (normalized is "ok" or "success" or "completed")
        {
            return "ok";
        }

        return null;
    }

    internal static string? TrimForCronError(string? text)
    {
        var normalized = (text ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return null;
        }

        const int maxChars = 400;
        if (normalized.Length <= maxChars)
        {
            return normalized;
        }

        return normalized[..maxChars] + "...";
    }
}
