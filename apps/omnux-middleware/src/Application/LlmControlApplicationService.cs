namespace Omnux.Middleware;

/// <summary>
/// <c>/llm set …</c> 모델 선택 오케스트레이션(카탈로그 검증 + 선택 모델 설정 + 채널 provider/model 적용)을
/// 담당하는 application service. CommandService private state 대신 인프라 서비스와
/// <see cref="ILlmSettingsApplicationService"/>만 의존한다(결함 4번 M4).
/// 기존 CommandService.SetGroqModelForChannelAsync / SetCopilotModelForChannelAsync /
/// SetChannelModelForProviderAsync 로직을 동일하게 옮긴 것.
/// (usage/models 리포트는 별도 후속에서 분리한다.)
/// </summary>
internal interface ILlmControlApplicationService
{
    Task<string> SetGroqModelAsync(string source, string model, CancellationToken cancellationToken);
    Task<string> SetCopilotModelAsync(string source, string model, CancellationToken cancellationToken);
    Task<string> SetModelForProviderAsync(string source, string provider, string model, CancellationToken cancellationToken);
}

internal sealed class LlmControlApplicationService : ILlmControlApplicationService
{
    private const string UnknownLlmCommand = "알 수 없는 /llm 명령입니다. /llm help 또는 자연어 요청을 사용하세요.";

    private readonly GroqModelCatalog _groqModelCatalog;
    private readonly CopilotCliWrapper _copilotWrapper;
    private readonly LlmRouter _llmRouter;
    private readonly ILlmSettingsApplicationService _settingsService;

    public LlmControlApplicationService(
        GroqModelCatalog groqModelCatalog,
        CopilotCliWrapper copilotWrapper,
        LlmRouter llmRouter,
        ILlmSettingsApplicationService settingsService
    )
    {
        _groqModelCatalog = groqModelCatalog;
        _copilotWrapper = copilotWrapper;
        _llmRouter = llmRouter;
        _settingsService = settingsService;
    }

    public Task<string> SetModelForProviderAsync(string source, string provider, string model, CancellationToken cancellationToken)
    {
        return provider switch
        {
            "groq" => SetGroqModelAsync(source, model, cancellationToken),
            "copilot" => SetCopilotModelAsync(source, model, cancellationToken),
            "codex" => Task.FromResult(SetChannelModelWithProvider(source, "codex", model)),
            "nvidia" => Task.FromResult(SetChannelModelWithProvider(source, "nvidia", model)),
            _ => Task.FromResult(UnknownLlmCommand)
        };
    }

    public async Task<string> SetGroqModelAsync(string source, string model, CancellationToken cancellationToken)
    {
        var models = await _groqModelCatalog.GetModelsAsync(cancellationToken);
        if (!models.Any(x => x.Id.Equals(model, StringComparison.OrdinalIgnoreCase)))
        {
            return $"알 수 없는 Groq 모델: {model}";
        }

        _llmRouter.TrySetSelectedGroqModel(model);
        var providerSet = _settingsService.SetChannelProvider(new LlmChannelProviderRequest(source, "single", "groq"));
        if (providerSet.StartsWith("invalid", StringComparison.OrdinalIgnoreCase))
        {
            return providerSet;
        }

        return _settingsService.SetChannelModel(new LlmChannelModelRequest(source, "single", model));
    }

    public async Task<string> SetCopilotModelAsync(string source, string model, CancellationToken cancellationToken)
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

        var providerSet = _settingsService.SetChannelProvider(new LlmChannelProviderRequest(source, "single", "copilot"));
        if (providerSet.StartsWith("invalid", StringComparison.OrdinalIgnoreCase))
        {
            return providerSet;
        }

        return _settingsService.SetChannelModel(new LlmChannelModelRequest(source, "single", model));
    }

    private string SetChannelModelWithProvider(string source, string provider, string model)
    {
        var providerSet = _settingsService.SetChannelProvider(new LlmChannelProviderRequest(source, "single", provider));
        if (providerSet.StartsWith("지원", StringComparison.OrdinalIgnoreCase)
            || providerSet.StartsWith("invalid", StringComparison.OrdinalIgnoreCase))
        {
            return providerSet;
        }

        return _settingsService.SetChannelModel(new LlmChannelModelRequest(source, "single", model));
    }
}
