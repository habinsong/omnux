using System.Globalization;
using System.Text;
using System.Text.Json;

namespace Omnux.Middleware;

internal sealed record AgentSpawnDailyCostDecision(
    bool Allowed,
    string Reason,
    string CostClass,
    int EstimatedTokens,
    int RemainingTokens,
    int SpentTokens,
    int DailyCapTokens,
    string? Error,
    string? Note,
    Guid ReservationId = default
);

internal sealed record AgentSpawnDailyCostSnapshot(
    string DayKey,
    int SpentTokens,
    int RemainingTokens,
    int DailyCapTokens,
    int ReservationCount
);

internal sealed class AgentSpawnDailyCostLedger
{
    public const int DefaultDailyTokenCap = 60_000;
    public const int MinimumDailyTokenCap = 1;

    private readonly object _lock = new();
    private readonly string _statePath;
    private readonly int _dailyTokenCap;
    private readonly Func<DateTimeOffset> _utcNow;
    private AgentSpawnDailyCostLedgerState _state;

    public AgentSpawnDailyCostLedger(string statePath, int? dailyTokenCap = null, Func<DateTimeOffset>? utcNow = null)
    {
        _statePath = Path.GetFullPath(statePath);
        _utcNow = utcNow ?? (() => DateTimeOffset.UtcNow);
        _dailyTokenCap = ResolveDailyTokenCap(dailyTokenCap);
        _state = LoadState();
        NormalizeDayLocked(_utcNow());
    }

    public AgentSpawnDailyCostDecision TryReserve(
        int estimatedTokens,
        string costClass,
        string runtime,
        string mode,
        int runTimeoutSeconds
    )
    {
        var normalizedCostClass = string.IsNullOrWhiteSpace(costClass)
            ? "unknown"
            : costClass.Trim();
        var now = _utcNow();

        lock (_lock)
        {
            NormalizeDayLocked(now);
            var spentTokens = GetSpentTokensLocked();
            var remainingTokens = Math.Max(0, _dailyTokenCap - spentTokens);
            var safeEstimatedTokens = Math.Max(1, estimatedTokens);

            if (safeEstimatedTokens > remainingTokens)
            {
                return Reject(
                    "daily_cost_cap_reached",
                    normalizedCostClass,
                    safeEstimatedTokens,
                    spentTokens,
                    remainingTokens,
                    $"sessions_spawn daily cost cap rejected: spent {spentTokens.ToString(CultureInfo.InvariantCulture)}/{_dailyTokenCap.ToString(CultureInfo.InvariantCulture)} tokens, need {safeEstimatedTokens.ToString(CultureInfo.InvariantCulture)} more."
                );
            }

            var reservation = new AgentSpawnDailyCostLedgerReservation
            {
                Id = Guid.NewGuid(),
                Tokens = safeEstimatedTokens,
                CostClass = normalizedCostClass,
                Runtime = NormalizeToken(runtime, "unknown"),
                Mode = NormalizeToken(mode, "run"),
                RunTimeoutSeconds = Math.Max(0, runTimeoutSeconds),
                CreatedUtc = now
            };
            _state.Reservations.Add(reservation);
            SaveLocked();

            spentTokens += safeEstimatedTokens;
            remainingTokens = Math.Max(0, _dailyTokenCap - spentTokens);
            return Allow(normalizedCostClass, safeEstimatedTokens, spentTokens, remainingTokens, reservation.Id);
        }
    }

    public bool Release(Guid reservationId)
    {
        if (reservationId == Guid.Empty)
        {
            return false;
        }

        lock (_lock)
        {
            NormalizeDayLocked(_utcNow());
            var removed = _state.Reservations.RemoveAll(reservation => reservation.Id == reservationId);
            if (removed <= 0)
            {
                return false;
            }

            SaveLocked();
            return true;
        }
    }

    public AgentSpawnDailyCostSnapshot GetSnapshot()
    {
        lock (_lock)
        {
            NormalizeDayLocked(_utcNow());
            var spentTokens = GetSpentTokensLocked();
            return new AgentSpawnDailyCostSnapshot(
                _state.DayKey,
                spentTokens,
                Math.Max(0, _dailyTokenCap - spentTokens),
                _dailyTokenCap,
                _state.Reservations.Count
            );
        }
    }

    private AgentSpawnDailyCostDecision Allow(
        string costClass,
        int estimatedTokens,
        int spentTokens,
        int remainingTokens,
        Guid reservationId
    ) =>
        new(
            true,
            "accepted",
            costClass,
            estimatedTokens,
            remainingTokens,
            spentTokens,
            _dailyTokenCap,
            null,
            $"spawn cost: daily_spent={spentTokens} daily_remaining={remainingTokens} daily_cap={_dailyTokenCap} estimated_tokens={estimatedTokens}.",
            reservationId
        );

    private AgentSpawnDailyCostDecision Reject(
        string reason,
        string costClass,
        int estimatedTokens,
        int spentTokens,
        int remainingTokens,
        string error
    ) =>
        new(
            false,
            reason,
            costClass,
            estimatedTokens,
            remainingTokens,
            spentTokens,
            _dailyTokenCap,
            error,
            null
        );

    private int GetSpentTokensLocked()
    {
        return _state.Reservations.Sum(reservation => Math.Max(0, reservation.Tokens));
    }

    private void NormalizeDayLocked(DateTimeOffset now)
    {
        var dayKey = GetDayKey(now);
        if (string.Equals(_state.DayKey, dayKey, StringComparison.Ordinal))
        {
            return;
        }

        _state = new AgentSpawnDailyCostLedgerState
        {
            DayKey = dayKey,
            Reservations = new List<AgentSpawnDailyCostLedgerReservation>()
        };
        SaveLocked();
    }

    private AgentSpawnDailyCostLedgerState LoadState()
    {
        try
        {
            var json = AtomicFileStore.ReadAllTextWithBackup(
                _statePath,
                IsValidStateJson,
                Encoding.UTF8,
                "agent-spawn-cost"
            );
            if (string.IsNullOrWhiteSpace(json))
            {
                return CreateFreshState(_utcNow());
            }

            var state = JsonSerializer.Deserialize(json, OmniJsonContext.Default.AgentSpawnDailyCostLedgerState);
            if (state == null)
            {
                return CreateFreshState(_utcNow());
            }

            state.DayKey = NormalizeToken(state.DayKey, GetDayKey(_utcNow()));
            state.Reservations = (state.Reservations ?? new List<AgentSpawnDailyCostLedgerReservation>())
                .Where(reservation => reservation != null && reservation.Id != Guid.Empty && reservation.Tokens > 0)
                .Select(reservation => new AgentSpawnDailyCostLedgerReservation
                {
                    Id = reservation.Id,
                    Tokens = reservation.Tokens,
                    CostClass = NormalizeToken(reservation.CostClass, "unknown"),
                    Runtime = NormalizeToken(reservation.Runtime, "unknown"),
                    Mode = NormalizeToken(reservation.Mode, "run"),
                    RunTimeoutSeconds = Math.Max(0, reservation.RunTimeoutSeconds),
                    CreatedUtc = reservation.CreatedUtc == default ? _utcNow() : reservation.CreatedUtc
                })
                .ToList();
            return state;
        }
        catch
        {
            return CreateFreshState(_utcNow());
        }
    }

    private void SaveLocked()
    {
        var json = JsonSerializer.Serialize(_state, OmniJsonContext.Default.AgentSpawnDailyCostLedgerState);
        AtomicFileStore.WriteAllText(_statePath, json, ownerOnly: true);
    }

    private static AgentSpawnDailyCostLedgerState CreateFreshState(DateTimeOffset now)
    {
        return new AgentSpawnDailyCostLedgerState
        {
            DayKey = GetDayKey(now),
            Reservations = new List<AgentSpawnDailyCostLedgerReservation>()
        };
    }

    private static bool IsValidStateJson(string json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return false;
        }

        try
        {
            return JsonSerializer.Deserialize(json, OmniJsonContext.Default.AgentSpawnDailyCostLedgerState) != null;
        }
        catch
        {
            return false;
        }
    }

    private static string GetDayKey(DateTimeOffset now)
    {
        return now.UtcDateTime.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
    }

    private static int ResolveDailyTokenCap(int? dailyTokenCap)
    {
        if (dailyTokenCap.HasValue && dailyTokenCap.Value > 0)
        {
            return Math.Max(MinimumDailyTokenCap, dailyTokenCap.Value);
        }

        var fromEnvRaw = (Env.Get("OMNUX_AGENT_SPAWN_DAILY_TOKEN_CAP") ?? string.Empty).Trim();
        if (int.TryParse(fromEnvRaw, NumberStyles.Integer, CultureInfo.InvariantCulture, out var fromEnv)
            && fromEnv > 0)
        {
            return Math.Max(MinimumDailyTokenCap, fromEnv);
        }

        return Math.Max(MinimumDailyTokenCap, DefaultDailyTokenCap);
    }

    private static string NormalizeToken(string? value, string fallback)
    {
        var normalized = (value ?? string.Empty).Trim().ToLowerInvariant();
        return string.IsNullOrWhiteSpace(normalized) ? fallback : normalized;
    }
}

internal sealed class AgentSpawnDailyCostLedgerState
{
    public string DayKey { get; set; } = string.Empty;
    public List<AgentSpawnDailyCostLedgerReservation> Reservations { get; set; } = new();
}

internal sealed class AgentSpawnDailyCostLedgerReservation
{
    public Guid Id { get; set; }
    public int Tokens { get; set; }
    public string CostClass { get; set; } = string.Empty;
    public string Runtime { get; set; } = string.Empty;
    public string Mode { get; set; } = string.Empty;
    public int RunTimeoutSeconds { get; set; }
    public DateTimeOffset CreatedUtc { get; set; }
}
