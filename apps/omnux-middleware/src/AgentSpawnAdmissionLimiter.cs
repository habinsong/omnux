using System.Globalization;

namespace Omnux.Middleware;

internal sealed record AgentSpawnAdmissionDecision(
    bool Allowed,
    string Reason,
    string CostClass,
    int EstimatedTokens,
    int RemainingTokens,
    int ActiveSpawns,
    string? Error,
    string? Note,
    Guid ReservationId = default,
    DateTimeOffset ReservationExpiresAtUtc = default
);

internal sealed class AgentSpawnAdmissionLimiter
{
    public const int DefaultTokenCapacity = 24_000;
    public const int DefaultRefillTokensPerMinute = 6_000;
    public const int DefaultMaxConcurrentSpawns = 2;
    public const int DefaultElevatedMaxConcurrentSpawns = 1;
    public const int MinimumTokensPerSpawn = 800;

    private readonly object _lock = new();
    private readonly Func<DateTimeOffset> _utcNow;
    private readonly int _tokenCapacity;
    private readonly int _refillTokensPerMinute;
    private readonly int _maxConcurrentSpawns;
    private readonly int _elevatedMaxConcurrentSpawns;
    private readonly List<Reservation> _reservations = new();
    private double _availableTokens;
    private DateTimeOffset _lastRefillUtc;

    public AgentSpawnAdmissionLimiter()
        : this(
            utcNow: () => DateTimeOffset.UtcNow,
            tokenCapacity: DefaultTokenCapacity,
            refillTokensPerMinute: DefaultRefillTokensPerMinute,
            maxConcurrentSpawns: DefaultMaxConcurrentSpawns,
            elevatedMaxConcurrentSpawns: DefaultElevatedMaxConcurrentSpawns
        )
    {
    }

    internal AgentSpawnAdmissionLimiter(
        Func<DateTimeOffset> utcNow,
        int tokenCapacity,
        int refillTokensPerMinute,
        int maxConcurrentSpawns,
        int elevatedMaxConcurrentSpawns
    )
    {
        _utcNow = utcNow;
        _tokenCapacity = Math.Max(MinimumTokensPerSpawn, tokenCapacity);
        _refillTokensPerMinute = Math.Max(MinimumTokensPerSpawn, refillTokensPerMinute);
        _maxConcurrentSpawns = Math.Max(1, maxConcurrentSpawns);
        _elevatedMaxConcurrentSpawns = Math.Max(1, Math.Min(elevatedMaxConcurrentSpawns, _maxConcurrentSpawns));
        _availableTokens = _tokenCapacity;
        _lastRefillUtc = _utcNow();
    }

    public AgentSpawnAdmissionDecision TryAcquire(
        AgentSpawnBudgetDecision budgetDecision,
        string runtime,
        string mode,
        int runTimeoutSeconds,
        int taskLength
    )
    {
        var costClass = string.IsNullOrWhiteSpace(budgetDecision.CostClass)
            ? "unknown"
            : budgetDecision.CostClass;
        var estimatedTokens = EstimateTokens(runtime, mode, runTimeoutSeconds, taskLength, costClass);
        var elevated = IsElevated(costClass);
        var now = _utcNow();

        lock (_lock)
        {
            RefillLocked(now);
            PruneExpiredReservationsLocked(now);
            var activeSpawns = _reservations.Count;
            var activeElevatedSpawns = _reservations.Count(reservation => reservation.Elevated);

            if (activeSpawns >= _maxConcurrentSpawns)
            {
                return Reject(
                    "concurrency_limit",
                    costClass,
                    estimatedTokens,
                    activeSpawns,
                    $"sessions_spawn admission rejected: active spawn limit reached ({activeSpawns}/{_maxConcurrentSpawns})."
                );
            }

            if (elevated && activeElevatedSpawns >= _elevatedMaxConcurrentSpawns)
            {
                return Reject(
                    "elevated_concurrency_limit",
                    costClass,
                    estimatedTokens,
                    activeSpawns,
                    $"sessions_spawn admission rejected: elevated spawn limit reached ({activeElevatedSpawns}/{_elevatedMaxConcurrentSpawns})."
                );
            }

            if (_availableTokens < estimatedTokens)
            {
                return Reject(
                    "token_bucket_depleted",
                    costClass,
                    estimatedTokens,
                    activeSpawns,
                    $"sessions_spawn admission rejected: token bucket depleted (need {estimatedTokens.ToString(CultureInfo.InvariantCulture)}, remaining {Math.Floor(_availableTokens).ToString(CultureInfo.InvariantCulture)})."
                );
            }

            _availableTokens -= estimatedTokens;
            _reservations.Add(new Reservation(
                Guid.NewGuid(),
                elevated,
                now.AddSeconds(ResolveReservationSeconds(runTimeoutSeconds, mode))
            ));
            activeSpawns = _reservations.Count;
            var reservation = _reservations[^1];
            return Allow(costClass, estimatedTokens, activeSpawns, reservation.Id, reservation.ExpiresAtUtc);
        }
    }

    internal int EstimateTokens(
        string runtime,
        string mode,
        int runTimeoutSeconds,
        int taskLength,
        string costClass
    )
    {
        var normalizedRuntime = (runtime ?? string.Empty).Trim().ToLowerInvariant();
        var normalizedMode = (mode ?? string.Empty).Trim().ToLowerInvariant();
        var lengthTokens = Math.Max(1, taskLength) / 4;
        var timeoutTokens = Math.Clamp(Math.Max(0, runTimeoutSeconds) / 4, 0, 2_400);
        var multiplier = 1.0;

        if (normalizedRuntime == "acp")
        {
            multiplier += 0.5;
        }

        if (normalizedMode == "session")
        {
            multiplier += 0.5;
        }

        if (IsElevated(costClass))
        {
            multiplier += 0.75;
        }

        return Math.Clamp(
            (int)Math.Ceiling((MinimumTokensPerSpawn + lengthTokens + timeoutTokens) * multiplier),
            MinimumTokensPerSpawn,
            _tokenCapacity
        );
    }

    public bool Release(Guid reservationId)
    {
        if (reservationId == Guid.Empty)
        {
            return false;
        }

        lock (_lock)
        {
            var removed = _reservations.RemoveAll(reservation => reservation.Id == reservationId) > 0;
            return removed;
        }
    }

    private AgentSpawnAdmissionDecision Allow(
        string costClass,
        int estimatedTokens,
        int activeSpawns,
        Guid reservationId,
        DateTimeOffset expiresAtUtc
    ) =>
        new(
            true,
            "accepted",
            costClass,
            estimatedTokens,
            (int)Math.Floor(_availableTokens),
            activeSpawns,
            null,
            $"spawn admission: token_bucket_remaining={(int)Math.Floor(_availableTokens)} active_spawns={activeSpawns} estimated_tokens={estimatedTokens}.",
            reservationId,
            expiresAtUtc
        );

    private AgentSpawnAdmissionDecision Reject(
        string reason,
        string costClass,
        int estimatedTokens,
        int activeSpawns,
        string error
    ) =>
        new(
            false,
            reason,
            costClass,
            estimatedTokens,
            (int)Math.Floor(_availableTokens),
            activeSpawns,
            error,
            null
        );

    private void RefillLocked(DateTimeOffset now)
    {
        var elapsedSeconds = Math.Max(0, (now - _lastRefillUtc).TotalSeconds);
        if (elapsedSeconds <= 0)
        {
            return;
        }

        var refill = elapsedSeconds * _refillTokensPerMinute / 60.0;
        _availableTokens = Math.Min(_tokenCapacity, _availableTokens + refill);
        _lastRefillUtc = now;
    }

    private void PruneExpiredReservationsLocked(DateTimeOffset now)
    {
        _reservations.RemoveAll(reservation => reservation.ExpiresAtUtc <= now);
    }

    private static int ResolveReservationSeconds(int runTimeoutSeconds, string mode)
    {
        var fallback = string.Equals(mode, "session", StringComparison.OrdinalIgnoreCase) ? 1_800 : 900;
        return Math.Clamp(runTimeoutSeconds > 0 ? runTimeoutSeconds : fallback, 60, 7_200);
    }

    private static bool IsElevated(string costClass) =>
        costClass.Contains("elevated", StringComparison.OrdinalIgnoreCase)
        || costClass.Contains("acp_session", StringComparison.OrdinalIgnoreCase)
        || costClass.Contains("controlled", StringComparison.OrdinalIgnoreCase);

    private sealed record Reservation(Guid Id, bool Elevated, DateTimeOffset ExpiresAtUtc);
}
