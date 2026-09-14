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

    private readonly ConcurrentDictionary<string, (DateTimeOffset UntilUtc, string Reason, string CredentialFingerprint)> _providerCooldowns =
        new(StringComparer.OrdinalIgnoreCase);

    /// <summary>
    /// 제공자 전체를 잠시 쓰지 않는다. 키가 없거나 크레딧이 없어서 나는 실패는 모델을 바꿔도 똑같으므로,
    /// 그 제공자를 가용 목록에서 빼야 자동 선택·멀티 실행이 죽은 제공자를 계속 고르지 않는다.
    /// </summary>
    /// <param name="credentialFingerprint">
    /// 그 제공자의 자격증명을 식별하는 값(키 자체가 아니다). 사용자가 키를 바꾸면 달라지므로,
    /// 달라진 순간 이 냉각은 낡은 것으로 보고 버린다. 그래야 키를 고친 직후 바로 쓸 수 있다.
    /// </param>
    public void MarkProviderUnavailable(
        string provider,
        DateTimeOffset nowUtc,
        TimeSpan cooldown,
        string reason,
        string credentialFingerprint = ""
    )
    {
        var key = (provider ?? string.Empty).Trim().ToLowerInvariant();
        if (key.Length == 0)
        {
            return;
        }

        _providerCooldowns[key] = (
            nowUtc.Add(cooldown),
            string.IsNullOrWhiteSpace(reason) ? "unavailable" : reason,
            credentialFingerprint ?? string.Empty
        );
    }

    public bool IsProviderCoolingDown(string provider, DateTimeOffset nowUtc, string credentialFingerprint = "")
        => TryGetProviderCooldown(provider, nowUtc, out _, credentialFingerprint);

    public bool TryGetProviderCooldown(
        string provider,
        DateTimeOffset nowUtc,
        out string reason,
        string credentialFingerprint = ""
    )
    {
        reason = string.Empty;
        var key = (provider ?? string.Empty).Trim().ToLowerInvariant();
        if (key.Length == 0 || !_providerCooldowns.TryGetValue(key, out var entry))
        {
            return false;
        }

        if (entry.UntilUtc <= nowUtc)
        {
            _providerCooldowns.TryRemove(key, out _);
            return false;
        }

        // 자격증명이 바뀌었으면 이 냉각은 더 이상 유효하지 않다(키를 고쳤을 수 있다).
        if (credentialFingerprint.Length > 0
            && entry.CredentialFingerprint.Length > 0
            && !string.Equals(entry.CredentialFingerprint, credentialFingerprint, StringComparison.Ordinal))
        {
            _providerCooldowns.TryRemove(key, out _);
            return false;
        }

        reason = entry.Reason;
        return true;
    }

    public void ClearProviderCooldown(string provider)
        => _providerCooldowns.TryRemove((provider ?? string.Empty).Trim().ToLowerInvariant(), out _);

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

    public void Clear()
    {
        _states.Clear();
        _providerCooldowns.Clear();
    }
}
