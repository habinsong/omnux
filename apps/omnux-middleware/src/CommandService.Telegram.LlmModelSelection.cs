using Omnux.Middleware.Infrastructure.Telegram;

namespace Omnux.Middleware;

public sealed partial class CommandService
{
    private Task<string?> TryHandleTelegramQuickModelCommandAsync(string text, CancellationToken cancellationToken)
    {
        _ = cancellationToken;
        if (!text.StartsWith("/model", StringComparison.OrdinalIgnoreCase))
        {
            return Task.FromResult<string?>(null);
        }

        var tokens = text.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (tokens.Length < 2)
        {
            return Task.FromResult<string?>("사용법: /model <groq|gemini|copilot|cerebras|nvidia|codex>");
        }

        var key = tokens[1].Trim().ToLowerInvariant();
        var selection = TelegramLlmPreferencePolicy.ResolveQuickModelSelection(
            key,
            _providers.GroqModel,
            DefaultGroqPrimaryModel,
            _providers.GeminiModel,
            DefaultCopilotModel,
            _providers.CerebrasModel,
            _providers.NvidiaModel,
            _providers.CodexModel
        );
        if (selection != null)
        {
            var message = ApplyTelegramQuickModelSelectionMutation(new TelegramQuickModelSelectionMutationRequest(selection));
            return Task.FromResult<string?>(message);
        }

        return Task.FromResult<string?>("사용법: /model <groq|gemini|copilot|cerebras|nvidia|codex>");
    }

    private async Task<string> SetGroqModelForTelegramAsync(string modelId, CancellationToken cancellationToken)
    {
        var requested = (modelId ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(requested))
        {
            return "model-id를 입력하세요. 예: /llm set groq meta-llama/llama-4-scout-17b-16e-instruct";
        }

        var models = await _groqModelCatalog.GetModelsAsync(cancellationToken);
        if (!models.Any(x => x.Id.Equals(requested, StringComparison.OrdinalIgnoreCase)))
        {
            return $"알 수 없는 Groq 모델: {requested}";
        }

        ApplyTelegramGroqModelSelectionMutation(new TelegramGroqModelSelectionMutationRequest(requested));
        return $"Groq 모델을 {requested}로 바꿨습니다.";
    }

    private Task<string> SetCopilotModelForTelegramAsync(string modelId, CancellationToken cancellationToken)
    {
        _ = cancellationToken;
        var requested = (modelId ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(requested))
        {
            return Task.FromResult("model-id를 입력하세요. 예: /llm set copilot gpt-5-mini");
        }

        if (!TryApplyTelegramCopilotModelSelectionMutation(new TelegramCopilotModelSelectionMutationRequest(DefaultCopilotModel)))
        {
            return Task.FromResult($"Copilot 모델 설정 실패: {DefaultCopilotModel}");
        }

        if (!requested.Equals(DefaultCopilotModel, StringComparison.OrdinalIgnoreCase))
        {
            return Task.FromResult($"Copilot 모델은 {DefaultCopilotModel}로 고정됩니다. 요청한 `{requested}` 대신 {DefaultCopilotModel}를 사용합니다.");
        }

        return Task.FromResult($"Copilot 모델을 {DefaultCopilotModel}로 설정했습니다.");
    }

    private async Task<string> SetTelegramProviderModelForNaturalControlAsync(
        string provider,
        string modelId,
        CancellationToken cancellationToken
    )
    {
        if (provider == "groq")
        {
            return await SetGroqModelForTelegramAsync(modelId, cancellationToken);
        }

        if (provider == "copilot")
        {
            return await SetCopilotModelForTelegramAsync(modelId, cancellationToken);
        }

        return SetTelegramSingleProviderThenModelForNaturalControl(provider, modelId);
    }
}
