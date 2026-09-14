namespace Omnux.Middleware;

public sealed record ProviderAvailability(
    string Provider,
    bool Available,
    string Reason,
    bool VisualCapable,
    bool CodeCapable,
    bool SearchCapable,
    bool CliAuthRequired,
    bool BackgroundSafe
);

public sealed class ProviderRegistry
{
    private static readonly string[] AutoPriority = { "gemini", "groq", "nvidia", "deepseek", "cerebras", "copilot", "codex", "grok" };
    private readonly LlmRouter _llmRouter;
    private readonly CopilotCliWrapper _copilotWrapper;
    private readonly CodexCliWrapper _codexWrapper;

    public ProviderRegistry(LlmRouter llmRouter, CopilotCliWrapper copilotWrapper, CodexCliWrapper codexWrapper)
    {
        _llmRouter = llmRouter;
        _copilotWrapper = copilotWrapper;
        _codexWrapper = codexWrapper;
    }

    public async Task<IReadOnlyList<string>> GetAvailableProvidersAsync(CancellationToken cancellationToken)
    {
        var snapshot = await GetAvailabilitySnapshotAsync(cancellationToken);
        return snapshot
            .Where(item => item.Available)
            .Select(item => item.Provider)
            .ToArray();
    }

    /// <summary>
    /// 자동 선택. 기본 순서(AutoPriority)는 아무 기록도 없을 때의 출발점일 뿐이고, 실제로는 최근
    /// 성공률과 응답 속도가 좋은 제공자를 먼저 고른다. 어떤 제공자가 빠른지는 키 티어·시간대·모델에
    /// 따라 달라져서 순서를 코드에 박아 두면 금방 틀린다.
    /// </summary>
    public async Task<string> ResolveAutoProviderAsync(CancellationToken cancellationToken)
    {
        var available = await GetAvailableProvidersAsync(cancellationToken);
        var ordered = AutoPriority
            .Where(provider => available.Contains(provider, StringComparer.OrdinalIgnoreCase))
            .ToArray();
        if (ordered.Length == 0)
        {
            return "none";
        }

        return _llmRouter.Health.OrderByHealth(ordered).FirstOrDefault() ?? "none";
    }

    public async Task<IReadOnlyList<ProviderAvailability>> GetAvailabilitySnapshotAsync(CancellationToken cancellationToken)
    {
        var snapshot = await BuildAvailabilitySnapshotAsync(cancellationToken);
        // 키가 있어도 크레딧이 없거나(402) 키가 무효면(401/403) 그 제공자는 지금 쓸 수 없다.
        // 그 사실을 여기서 반영하지 않으면 자동 선택과 멀티 실행이 죽은 제공자를 계속 고른다.
        var now = DateTimeOffset.UtcNow;
        return snapshot
            .Select(item => _llmRouter.RateLimits.TryGetProviderCooldown(item.Provider, now, out var reason)
                ? item with { Available = false, Reason = reason }
                : item)
            .ToArray();
    }

    private async Task<IReadOnlyList<ProviderAvailability>> BuildAvailabilitySnapshotAsync(CancellationToken cancellationToken)
    {
        var items = new List<ProviderAvailability>(7)
        {
            _llmRouter.HasGeminiApiKey()
                ? new ProviderAvailability("gemini", true, "configured", true, true, true, false, true)
                : new ProviderAvailability("gemini", false, "api_key_missing", true, true, true, false, true),
            _llmRouter.HasGroqApiKey()
                ? new ProviderAvailability("groq", true, "configured", false, true, false, false, true)
                : new ProviderAvailability("groq", false, "api_key_missing", false, true, false, false, true),
            _llmRouter.HasNvidiaApiKey()
                ? new ProviderAvailability("nvidia", true, "configured", false, true, false, false, true)
                : new ProviderAvailability("nvidia", false, "api_key_missing", false, true, false, false, true),
            _llmRouter.HasCerebrasApiKey()
                ? new ProviderAvailability("cerebras", true, "configured", false, true, false, false, true)
                : new ProviderAvailability("cerebras", false, "api_key_missing", false, true, false, false, true),
            _llmRouter.HasDeepseekApiKey()
                ? new ProviderAvailability("deepseek", true, "configured", false, true, false, false, true)
                : new ProviderAvailability("deepseek", false, "api_key_missing", false, true, false, false, true)
        };

        var copilot = await _copilotWrapper.GetStatusAsync(cancellationToken);
        items.Add(copilot.Installed && copilot.Authenticated
            ? new ProviderAvailability("copilot", true, "ready", false, true, false, true, false)
            : new ProviderAvailability("copilot", false, "not_ready", false, true, false, true, false));
        var codex = await _codexWrapper.GetStatusAsync(cancellationToken);
        items.Add(codex.Installed && codex.Authenticated
            ? new ProviderAvailability("codex", true, "ready", false, true, false, true, false)
            : new ProviderAvailability("codex", false, "not_ready", false, true, false, true, false));

        var grok = await _llmRouter.GrokClient.GetStatusAsync(cancellationToken);
        items.Add(new ProviderAvailability("grok", grok.Installed && grok.Authenticated,
            grok.Authenticated ? "ready" : grok.Mode, false, true, false, true, false));
        return items;
    }
}
