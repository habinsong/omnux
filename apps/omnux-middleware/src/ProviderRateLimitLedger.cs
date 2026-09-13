using System.Collections.Concurrent;
using System.Net.Http.Headers;

namespace Omnux.Middleware;

/// <summary>제공자·모델 하나의 한도 상태. 응답 헤더에서 읽은 값만 담는다(추정값을 넣지 않는다).</summary>
public sealed record ProviderRateLimitState(
    string Provider,
    string Model,
    long? LimitRequests,
    long? RemainingRequests,
    long? LimitTokens,
    long? RemainingTokens,
    string? ResetRequests,
    string? ResetTokens,
    DateTimeOffset? CooldownUntilUtc,
    DateTimeOffset LastUpdatedUtc
);

/// <summary>
/// 제공자별 한도 상태 장부. Groq·Cerebras·NVIDIA·DeepSeek 처럼 분당 호출·토큰 한도가 있는 곳에서
/// 응답 헤더와 429 응답으로 실제 한도를 배워 둔다. 한도 숫자를 코드에 박지 않는 이유는 제공자가
/// 티어·모델·시점마다 다르게 주기 때문이다.
/// </summary>
public sealed class ProviderRateLimitLedger
{
    private readonly ConcurrentDictionary<string, ProviderRateLimitState> _states = new(StringComparer.OrdinalIgnoreCase);

    private static string Key(string? provider, string? model)
        => $"{(provider ?? string.Empty).Trim().ToLowerInvariant()}|{(model ?? string.Empty).Trim()}";

    /// <summary>응답 헤더에서 한도를 읽어 장부에 넣는다. 읽을 게 없으면 아무것도 하지 않는다.</summary>
    public ProviderRateLimitState? Capture(
        string provider,
        string model,
        HttpResponseHeaders headers,
        DateTimeOffset capturedAtUtc,
        bool isRateLimited = false
    )
    {
        if (headers == null || string.IsNullOrWhiteSpace(provider))
        {
            return null;
        }

        var parsed = ProviderRateLimitHeaderParser.Parse(headers, capturedAtUtc, isRateLimited);
        var hasSignal = parsed.LimitRequests.HasValue
                        || parsed.RemainingRequests.HasValue
                        || parsed.LimitTokens.HasValue
                        || parsed.RemainingTokens.HasValue
                        || parsed.CooldownUntilUtc.HasValue;
        if (!hasSignal)
        {
            return null;
        }

        var state = new ProviderRateLimitState(
            provider.Trim().ToLowerInvariant(),
            (model ?? string.Empty).Trim(),
            parsed.LimitRequests,
            parsed.RemainingRequests,
            parsed.LimitTokens,
            parsed.RemainingTokens,
            parsed.ResetRequests,
            parsed.ResetTokens,
            parsed.CooldownUntilUtc,
            capturedAtUtc
        );
        _states[Key(provider, model)] = state;
        return state;
    }

    /// <summary>429 를 받았을 때 쓰는 최소 냉각. 헤더가 없으면 이 값으로라도 잠시 피한다.</summary>
    public ProviderRateLimitState MarkRateLimited(
        string provider,
        string model,
        DateTimeOffset nowUtc,
        TimeSpan fallbackCooldown
    )
    {
        var key = Key(provider, model);
        var existing = _states.TryGetValue(key, out var known) ? known : null;
        var until = existing?.CooldownUntilUtc is { } knownUntil && knownUntil > nowUtc
            ? knownUntil
            : nowUtc.Add(fallbackCooldown);
        var state = (existing ?? new ProviderRateLimitState(
            provider.Trim().ToLowerInvariant(),
            (model ?? string.Empty).Trim(),
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            nowUtc
        )) with
        {
            CooldownUntilUtc = until,
            LastUpdatedUtc = nowUtc
        };
        _states[key] = state;
        return state;
    }

    public ProviderRateLimitState? TryGet(string provider, string model)
        => _states.TryGetValue(Key(provider, model), out var state) ? state : null;

    /// <summary>이 모델이 지금 냉각 중인지.</summary>
    public bool IsCoolingDown(string provider, string model, DateTimeOffset nowUtc)
    {
        var state = TryGet(provider, model);
        return state?.CooldownUntilUtc is { } until && until > nowUtc;
    }

    /// <summary>
    /// 이 모델로 지금 호출하면 한도에 걸릴 것 같은지. 남은 호출이 없거나 남은 토큰이 이번 요청에
    /// 필요한 양보다 적으면 참. 헤더를 못 받은 모델은 판단 근거가 없으니 거짓(그대로 시도).
    /// </summary>
    public bool IsExhaustionImminent(string provider, string model, int expectedTokens, DateTimeOffset nowUtc)
    {
        var state = TryGet(provider, model);
        if (state == null)
        {
            return false;
        }

        if (state.CooldownUntilUtc is { } until && until > nowUtc)
        {
            return true;
        }

        if (state.RemainingRequests is { } remainingRequests && remainingRequests <= 1)
        {
            return true;
        }

        return state.RemainingTokens is { } remainingTokens
               && remainingTokens < Math.Max(1, expectedTokens);
    }

    public IReadOnlyList<ProviderRateLimitState> Snapshot(string? provider = null)
    {
        var normalized = (provider ?? string.Empty).Trim();
        return _states.Values
            .Where(state => normalized.Length == 0
                            || state.Provider.Equals(normalized, StringComparison.OrdinalIgnoreCase))
            .OrderBy(state => state.Provider, StringComparer.OrdinalIgnoreCase)
            .ThenBy(state => state.Model, StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    public void Clear() => _states.Clear();
}
