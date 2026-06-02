using System.Globalization;
using System.Net.Http.Headers;

namespace Omnux.Middleware;

internal static class GroqRateLimitHeaderParser
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
