namespace Omnux.Middleware;

public sealed partial class CommandService
{
    private async Task<string> SetChannelModelForProviderAsync(
        string source,
        string provider,
        string model,
        CancellationToken cancellationToken
    )
    {
        return provider switch
        {
            "groq" => await SetGroqModelForChannelAsync(source, model, cancellationToken),
            "copilot" => await SetCopilotModelForChannelAsync(source, model, cancellationToken),
            "codex" => SetChannelModelWithProvider(source, "codex", model),
            "nvidia" => SetChannelModelWithProvider(source, "nvidia", model),
            _ => "알 수 없는 /llm 명령입니다. /llm help 또는 자연어 요청을 사용하세요."
        };
    }

    private string SetChannelModelWithProvider(string source, string provider, string model)
    {
        var providerSet = SetChannelProvider(source, "single", provider);
        if (providerSet.StartsWith("지원", StringComparison.OrdinalIgnoreCase)
            || providerSet.StartsWith("invalid", StringComparison.OrdinalIgnoreCase))
        {
            return providerSet;
        }

        return SetChannelModel(source, "single", model);
    }

    private async Task<string> SetGroqModelForChannelAsync(
        string source,
        string model,
        CancellationToken cancellationToken
    )
    {
        var models = await _groqModelCatalog.GetModelsAsync(cancellationToken);
        if (!models.Any(x => x.Id.Equals(model, StringComparison.OrdinalIgnoreCase)))
        {
            return $"알 수 없는 Groq 모델: {model}";
        }

        _llmRouter.TrySetSelectedGroqModel(model);
        var providerSet = SetChannelProvider(source, "single", "groq");
        if (providerSet.StartsWith("invalid", StringComparison.OrdinalIgnoreCase))
        {
            return providerSet;
        }

        return SetChannelModel(source, "single", model);
    }

    private async Task<string> SetCopilotModelForChannelAsync(
        string source,
        string model,
        CancellationToken cancellationToken
    )
    {
        var models = await _copilotWrapper.GetModelsAsync(cancellationToken);
        if (!models.Any(x => x.Id.Equals(model, StringComparison.OrdinalIgnoreCase)))
        {
            return $"알 수 없는 Copilot 모델: {model}";
        }

        if (!_copilotWrapper.TrySetSelectedModel(model))
        {
            return $"Copilot 모델 설정 실패: {model}";
        }

        var providerSet = SetChannelProvider(source, "single", "copilot");
        if (providerSet.StartsWith("invalid", StringComparison.OrdinalIgnoreCase))
        {
            return providerSet;
        }

        return SetChannelModel(source, "single", model);
    }
}
