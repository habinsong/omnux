namespace Omnux.Middleware.Tests;

public sealed class ProviderMaintenanceModelSelectionTests
{
    [Theory]
    [InlineData("local", "assistant_info")]
    [InlineData("local", "copilot_usage")]
    [InlineData("browser", "playwright")]
    [InlineData("system", "-")]
    public void PseudoProviderLabelsNeverLeakAsModelNames(string provider, string model)
    {
        // 의사 프로바이더의 라벨이 그대로 남으면 groq 로 폴백될 때 model=assistant_info 로 호출돼
        // 404 model_not_found 가 난다.
        Assert.Null(ProviderModelSelectionPolicy.SanitizeMaintenanceModel(provider, model));
    }

    [Theory]
    [InlineData("gemini", "-")]
    [InlineData("groq", "")]
    [InlineData("groq", "   ")]
    [InlineData("cerebras", null)]
    public void PlaceholderModelsFallBackToProviderDefault(string provider, string? model)
    {
        Assert.Null(ProviderModelSelectionPolicy.SanitizeMaintenanceModel(provider, model));
    }

    [Theory]
    [InlineData("groq", "openai/gpt-oss-120b")]
    [InlineData("gemini", "gemini-3.8-flash")]
    [InlineData("nim", "moonshotai/kimi-k2.5")]
    public void RealProviderModelHintsSurvive(string provider, string model)
    {
        Assert.Equal(model, ProviderModelSelectionPolicy.SanitizeMaintenanceModel(provider, model));
    }

    [Theory]
    [InlineData("nvidia-nim", "nvidia")]
    [InlineData("nvidia_nim", "nvidia")]
    [InlineData("NIM", "nvidia")]
    [InlineData("  Groq ", "groq")]
    public void ProviderAliasesNormalize(string input, string expected)
    {
        Assert.Equal(expected, ProviderModelSelectionPolicy.NormalizeProviderAliases(input));
    }

    [Theory]
    [InlineData("local")]
    [InlineData("browser")]
    [InlineData("system")]
    [InlineData("")]
    [InlineData(null)]
    public void PseudoProvidersAreNotKnownLlmProviders(string? provider)
    {
        Assert.False(ProviderModelSelectionPolicy.IsKnownLlmProvider(provider));
    }
}
