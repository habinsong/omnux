using System.Globalization;
using System.Net.Http.Headers;

namespace Omnux.Middleware;

/// <summary>
/// 표준 `x-ratelimit-*` 헤더와 `retry-after` 를 읽는다. Groq 전용이 아니라 OpenAI 호환 제공자가
/// 공통으로 쓰는 규격이라 제공자와 무관하게 쓴다.
/// </summary>
internal static class ProviderRateLimitHeaderParser
{
    private static readonly TimeSpan MaxRetryAfterCooldown = TimeSpan.FromMinutes(30);

    public static GroqRateLimit Parse(
        HttpResponseHeaders headers,
        DateTimeOffset capturedAtUtc,
        bool isRateLimited = false
    )
    {
        return new GroqRateLimit
        {
            LimitRequests = ReadHeaderLong(headers, "x-ratelimit-limit-requests"),
            RemainingRequests = ReadHeaderLong(headers, "x-ratelimit-remaining-requests"),
            LimitTokens = ReadHeaderLong(headers, "x-ratelimit-limit-tokens"),
            RemainingTokens = ReadHeaderLong(headers, "x-ratelimit-remaining-tokens"),
            ResetRequests = ReadHeaderString(headers, "x-ratelimit-reset-requests"),
            ResetTokens = ReadHeaderString(headers, "x-ratelimit-reset-tokens"),
            CooldownUntilUtc = isRateLimited ? ParseRetryAfterUntilUtc(headers, capturedAtUtc) : null,
            LastUpdatedUtc = capturedAtUtc
        };
    }

    /// <summary>한도와 관련된 헤더를 이름째 요약한다. 제공자가 실제로 무엇을 주는지 보려고 쓴다.</summary>
    public static string DescribeRateLimitHeaders(HttpResponseHeaders headers)
    {
        if (headers == null)
        {
            return string.Empty;
        }

        var parts = new List<string>();
        foreach (var header in headers)
        {
            var name = header.Key ?? string.Empty;
            if (!name.Contains("ratelimit", StringComparison.OrdinalIgnoreCase)
                && !name.Contains("rate-limit", StringComparison.OrdinalIgnoreCase)
                && !name.Contains("retry-after", StringComparison.OrdinalIgnoreCase)
                && !name.Contains("quota", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            parts.Add($"{name}={string.Join("/", header.Value ?? Array.Empty<string>())}");
        }

        return string.Join(" ", parts);
    }

    private static long? ReadHeaderLong(HttpResponseHeaders headers, string key)
    {
        if (!headers.TryGetValues(key, out var values))
        {
            return null;
        }

        var first = values.FirstOrDefault();
        if (long.TryParse(first, out var parsed))
        {
            return parsed;
        }

        return null;
    }

    private static string? ReadHeaderString(HttpResponseHeaders headers, string key)
    {
        if (!headers.TryGetValues(key, out var values))
        {
            return null;
        }

        return values.FirstOrDefault();
    }

    private static DateTimeOffset? ParseRetryAfterUntilUtc(HttpResponseHeaders headers, DateTimeOffset capturedAtUtc)
    {
        if (!headers.TryGetValues("retry-after", out var values))
        {
            return null;
        }

        var first = values.FirstOrDefault();
        if (string.IsNullOrWhiteSpace(first))
        {
            return null;
        }

        if (int.TryParse(first.Trim(), out var seconds) && seconds > 0)
        {
            return ClampRetryAfter(capturedAtUtc, capturedAtUtc.AddSeconds(seconds));
        }

        if (DateTimeOffset.TryParse(first, out var parsedAt))
        {
            var utc = parsedAt.ToUniversalTime();
            return utc > capturedAtUtc ? ClampRetryAfter(capturedAtUtc, utc) : null;
        }

        if (double.TryParse(first, NumberStyles.Float, CultureInfo.InvariantCulture, out var deltaSeconds)
            && deltaSeconds > 0)
        {
            var rounded = Math.Ceiling(deltaSeconds);
            return ClampRetryAfter(capturedAtUtc, capturedAtUtc.AddSeconds(rounded));
        }

        return null;
    }

    private static DateTimeOffset ClampRetryAfter(DateTimeOffset capturedAtUtc, DateTimeOffset requestedUntilUtc)
    {
        var maxUntil = capturedAtUtc.Add(MaxRetryAfterCooldown);
        return requestedUntilUtc > maxUntil ? maxUntil : requestedUntilUtc;
    }
}
