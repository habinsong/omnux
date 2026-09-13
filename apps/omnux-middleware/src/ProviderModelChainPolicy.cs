namespace Omnux.Middleware;

/// <summary>
/// 한 제공자 안에서 이어받을 모델 순서를 만든다. 분당 호출·토큰 한도에 걸렸을 때 다른 제공자로
/// 넘어가기 전에 같은 제공자의 다른 모델로 먼저 이어받는 것이 사용자 입장에서 덜 놀랍다
/// (선택한 제공자가 유지되고, 키·요금 체계도 그대로다).
///
/// 목록은 `apps/shared/model-registry.json` 에서 생성된 `ModelRegistry` 를 그대로 쓴다.
/// 여기에 모델 이름을 적지 않는다.
/// </summary>
public static class ProviderModelChainPolicy
{
    /// <summary>요청한 모델을 맨 앞에 두고, 같은 제공자의 나머지 후보를 뒤에 붙인다.</summary>
    public static IReadOnlyList<string> BuildChain(string? primaryModel, IReadOnlyList<string>? providerFallbacks)
    {
        var chain = new List<string>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        void Add(string? candidate)
        {
            var normalized = (candidate ?? string.Empty).Trim();
            if (normalized.Length == 0 || !seen.Add(normalized))
            {
                return;
            }

            chain.Add(normalized);
        }

        Add(primaryModel);
        foreach (var candidate in providerFallbacks ?? Array.Empty<string>())
        {
            Add(candidate);
        }

        return chain;
    }

}
