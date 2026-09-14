using System.Diagnostics;
using System.Globalization;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Xml.Linq;

namespace Omnux.Middleware;

// 웹 검색 도구 표면. 원래 CommandService.Config.cs 에 세션·웹 검색·크론이 함께 있어 4,200줄이었다.
// 저장소 규칙은 파일당 500줄이다. partial class 라 파일만 나누면 동작은 그대로다.
// 경계는 줄 번호가 아니라 심볼로 잡는다. 줄 범위로 자르면 뒤쪽에 흩어진 크론 헬퍼가 딸려온다.
// 아래 정적 필드는 전부 이 영역 전용이다(다른 파일 참조 없음을 확인했다).
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
}
