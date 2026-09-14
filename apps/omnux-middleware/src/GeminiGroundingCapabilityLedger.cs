using System.Collections.Concurrent;

namespace Omnux.Middleware;

/// <summary>
/// 어떤 Gemini 모델이 google_search 근거(grounding)를 실제로 붙여 주는지 호출 결과로 배운다.
/// 목록에 있다고 다 붙여 주지 않는다(실측: gemini-3.1-flash-lite 는 검색 없이 기억으로 답해
/// 출처가 0건이었고, 같은 질문에서 3.5/3.6/3.8 은 4건을 돌려줬다).
/// 모델 이름을 코드에 박지 않고, 결과가 바뀌면 판단도 바로 바뀌게 한다.
/// </summary>
public sealed class GeminiGroundingCapabilityLedger
{
    /// <summary>이만큼 연속으로 근거가 없으면 그 모델은 검색 경로에서 뺀다.</summary>
    private const int MissesBeforeAvoiding = 2;

    private readonly ConcurrentDictionary<string, int> _consecutiveMisses = new(StringComparer.OrdinalIgnoreCase);

    private static string Key(string? model) => (model ?? string.Empty).Trim();

    public void Record(string? model, bool grounded)
    {
        var key = Key(model);
        if (key.Length == 0)
        {
            return;
        }

        if (grounded)
        {
            _consecutiveMisses[key] = 0;
            return;
        }

        _consecutiveMisses.AddOrUpdate(key, 1, (_, current) => current + 1);
    }

    public bool IsKnownNotGrounding(string? model)
    {
        var key = Key(model);
        return key.Length > 0
               && _consecutiveMisses.TryGetValue(key, out var misses)
               && misses >= MissesBeforeAvoiding;
    }

    /// <summary>근거를 붙여 주는 것으로 아는 첫 후보. 전부 모르면 원래 모델을 그대로 쓴다.</summary>
    public string ResolveGroundingModel(string preferredModel, IReadOnlyList<string> fallbackModels)
    {
        if (!IsKnownNotGrounding(preferredModel))
        {
            return preferredModel;
        }

        foreach (var candidate in fallbackModels ?? Array.Empty<string>())
        {
            if (!string.IsNullOrWhiteSpace(candidate) && !IsKnownNotGrounding(candidate))
            {
                return candidate;
            }
        }

        return preferredModel;
    }

    public void Clear() => _consecutiveMisses.Clear();
}
