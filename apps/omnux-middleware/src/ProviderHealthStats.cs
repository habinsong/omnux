using System.Collections.Concurrent;

namespace Omnux.Middleware;

/// <summary>제공자 하나의 최근 상태. 실제 호출 결과로만 채운다(추정값 없음).</summary>
public sealed record ProviderHealthSnapshot(
    string Provider,
    int Samples,
    double SuccessRate,
    double AverageLatencyMs,
    DateTimeOffset LastUpdatedUtc
);

/// <summary>
/// 제공자별 최근 성공률과 응답 속도. 자동 선택이 고정 순서를 따르지 않고 "지금 잘 되는 쪽"을
/// 먼저 쓰게 하려고 둔다. 어떤 제공자가 빠른지는 키 티어·시간대·모델에 따라 달라지므로
/// 목록을 코드에 박아 두면 금방 틀린다.
/// </summary>
public sealed class ProviderHealthStats
{
    private const int MaxSamples = 20;
    /// <summary>한두 번 결과로 순서를 뒤집지 않도록, 비교에 쓰려면 최소한 이만큼은 모여야 한다.</summary>
    private const int MinSamplesForComparison = 3;
    /// <summary>이 아래로 떨어지면 간헐 실패, 더 떨어지면 사실상 못 쓰는 제공자로 본다.</summary>
    private const double HealthySuccessRate = 0.85;
    private const double DegradedSuccessRate = 0.5;
    /// <summary>후보 중 가장 빠른 제공자보다 이 배 이상 느리면 뒤로 민다.</summary>
    private const double SlowLatencyRatio = 2.0;

    private sealed class Entry
    {
        public int Samples;
        public double SuccessRate = 1.0;
        public double AverageLatencyMs;
        public DateTimeOffset LastUpdatedUtc = DateTimeOffset.MinValue;
    }

    private readonly ConcurrentDictionary<string, Entry> _entries = new(StringComparer.OrdinalIgnoreCase);

    private static string Key(string? provider) => (provider ?? string.Empty).Trim().ToLowerInvariant();

    /// <summary>호출 한 번의 결과를 기록한다. 최근 것에 가중치를 두는 지수 이동 평균이다.</summary>
    public void Record(string provider, bool success, double elapsedMs, DateTimeOffset nowUtc)
    {
        var key = Key(provider);
        if (key.Length == 0)
        {
            return;
        }

        var entry = _entries.GetOrAdd(key, _ => new Entry());
        lock (entry)
        {
            var weight = 1.0 / Math.Min(MaxSamples, entry.Samples + 1);
            entry.SuccessRate += ((success ? 1.0 : 0.0) - entry.SuccessRate) * weight;
            var latency = Math.Max(0, elapsedMs);
            entry.AverageLatencyMs = entry.Samples == 0
                ? latency
                : entry.AverageLatencyMs + (latency - entry.AverageLatencyMs) * weight;
            entry.Samples = Math.Min(MaxSamples, entry.Samples + 1);
            entry.LastUpdatedUtc = nowUtc;
        }
    }

    public ProviderHealthSnapshot? TryGet(string provider)
    {
        var key = Key(provider);
        if (key.Length == 0 || !_entries.TryGetValue(key, out var entry))
        {
            return null;
        }

        lock (entry)
        {
            return new ProviderHealthSnapshot(key, entry.Samples, entry.SuccessRate, entry.AverageLatencyMs, entry.LastUpdatedUtc);
        }
    }

    /// <summary>
    /// 후보를 "지금 잘 되는 순서"로 돌려준다. 기본은 주어진 순서를 그대로 지키고, 실제로 실패하고
    /// 있거나 눈에 띄게 느린 제공자만 뒤로 민다. 기록이 없는 제공자는 손대지 않는다(모르는 것을
    /// 앞세우지도, 밀어내지도 않는다).
    /// </summary>
    public IReadOnlyList<string> OrderByHealth(IReadOnlyList<string> candidates)
    {
        if (candidates == null || candidates.Count <= 1)
        {
            return candidates ?? Array.Empty<string>();
        }

        var rows = candidates
            .Select((provider, index) => (provider, index, stats: TryGet(provider)))
            .ToArray();

        // "느리다"의 기준은 코드에 박지 않고, 이번 후보들 중 가장 빠른 값에서 뽑는다.
        var measured = rows
            .Where(row => row.stats != null && row.stats.Samples >= MinSamplesForComparison && row.stats.AverageLatencyMs > 0)
            .Select(row => row.stats!.AverageLatencyMs)
            .ToArray();
        var fastest = measured.Length == 0 ? 0 : measured.Min();

        return rows
            .OrderBy(row => FailureRank(row.stats))
            .ThenBy(row => fastest > 0
                && row.stats != null
                && row.stats.Samples >= MinSamplesForComparison
                && row.stats.AverageLatencyMs >= fastest * SlowLatencyRatio
                ? 1
                : 0)
            .ThenBy(row => row.index)
            .Select(row => row.provider)
            .ToArray();
    }

    /// <summary>0=정상, 1=간헐 실패, 2=대부분 실패. 기록이 없으면 정상으로 본다.</summary>
    private static int FailureRank(ProviderHealthSnapshot? stats)
    {
        if (stats == null || stats.Samples == 0)
        {
            return 0;
        }

        if (stats.SuccessRate >= HealthySuccessRate)
        {
            return 0;
        }

        return stats.SuccessRate >= DegradedSuccessRate ? 1 : 2;
    }

    public IReadOnlyList<ProviderHealthSnapshot> Snapshot()
    {
        return _entries.Keys
            .Select(TryGet)
            .Where(item => item != null)
            .Select(item => item!)
            .OrderBy(item => item.Provider, StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    public void Clear() => _entries.Clear();
}
