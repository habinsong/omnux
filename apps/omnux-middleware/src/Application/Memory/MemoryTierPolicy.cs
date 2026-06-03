namespace Omnux.Middleware;

internal static class MemoryTierPolicy
{
    public const string Working = "working";
    public const string ShortTerm = "short_term";
    public const string Episodic = "episodic";
    public const string LongTerm = "long_term";

    private const double DecayLambda = 0.08d;
    private const double MinimumConfidenceFloor = 0.62d;

    public static string ResolveTier(long lastAccessedUnixMs, DateTimeOffset nowUtc)
    {
        var age = ResolveAge(lastAccessedUnixMs, nowUtc);
        if (age.TotalHours < 1)
        {
            return Working;
        }

        if (age.TotalHours < 24)
        {
            return ShortTerm;
        }

        if (age.TotalDays < 7)
        {
            return Episodic;
        }

        return LongTerm;
    }

    public static double ApplyTierScore(
        double baseScore,
        string? tier,
        long lastAccessedUnixMs,
        DateTimeOffset nowUtc
    )
    {
        var safeBase = double.IsFinite(baseScore) ? Math.Clamp(baseScore, 0d, 1d) : 0d;
        if (safeBase <= 0d)
        {
            return 0d;
        }

        var confidence = ResolveConfidence(lastAccessedUnixMs, nowUtc);
        var tierBoost = NormalizeTier(tier) switch
        {
            Working => 1.12d,
            ShortTerm => 1.06d,
            Episodic => 1.0d,
            _ => 0.94d
        };
        var scored = safeBase * tierBoost * confidence;
        return Math.Clamp(scored, safeBase * MinimumConfidenceFloor, 1d);
    }

    public static double ResolveConfidence(long lastAccessedUnixMs, DateTimeOffset nowUtc)
    {
        var age = ResolveAge(lastAccessedUnixMs, nowUtc);
        var decay = Math.Exp(-DecayLambda * Math.Max(0d, age.TotalDays));
        return Math.Clamp(Math.Max(decay, MinimumConfidenceFloor), MinimumConfidenceFloor, 1d);
    }

    public static string NormalizeTier(string? tier)
    {
        var normalized = (tier ?? string.Empty).Trim().ToLowerInvariant();
        return normalized switch
        {
            Working => Working,
            ShortTerm => ShortTerm,
            Episodic => Episodic,
            LongTerm => LongTerm,
            _ => LongTerm
        };
    }

    private static TimeSpan ResolveAge(long lastAccessedUnixMs, DateTimeOffset nowUtc)
    {
        if (lastAccessedUnixMs <= 0)
        {
            return TimeSpan.FromDays(3650);
        }

        var accessed = DateTimeOffset.FromUnixTimeMilliseconds(lastAccessedUnixMs).ToUniversalTime();
        var now = nowUtc.ToUniversalTime();
        return accessed >= now ? TimeSpan.Zero : now - accessed;
    }
}
