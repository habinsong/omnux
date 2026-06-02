using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class UnifiedSlashCommandPolicyTests
{
    [Theory]
    [InlineData("")]
    [InlineData("hello")]
    [InlineData("  모델 목록 보여줘")]
    public void ParseRejectsNonSlashInputs(string text)
    {
        Assert.Null(UnifiedSlashCommandPolicy.Parse(text));
    }

    [Theory]
    [InlineData("/talk high", "talk", "high")]
    [InlineData("/code low", "code", "low")]
    [InlineData("/profile talk", "talk", "auto")]
    [InlineData("/profile code high", "code", "high")]
    public void ParseProfileCommandsNormalizeThinking(string text, string expectedProfile, string expectedThinking)
    {
        var command = UnifiedSlashCommandPolicy.Parse(text);

        Assert.NotNull(command);
        Assert.Equal(UnifiedSlashCommandKind.ApplyProfile, command.Kind);
        Assert.Equal(expectedProfile, command.Primary);
        Assert.Equal(expectedThinking, command.Secondary);
    }

    [Theory]
    [InlineData("/profile", "usage: /profile <talk|code> [low|high]")]
    [InlineData("/profile bad", "invalid profile. use talk|code")]
    [InlineData("/mode", "usage: /mode <single|orchestration|multi>")]
    [InlineData("/provider single", "사용법: /provider <single|orchestration|summary> <groq|gemini|copilot|cerebras|nvidia|codex|auto>")]
    [InlineData("/status", "usage: /status model")]
    public void ParseTopLevelUsageErrorsReturnStaticMessages(string text, string expectedMessage)
    {
        var command = UnifiedSlashCommandPolicy.Parse(text);

        Assert.NotNull(command);
        Assert.Equal(UnifiedSlashCommandKind.StaticMessage, command.Kind);
        Assert.Equal(expectedMessage, command.Message);
    }

    [Theory]
    [InlineData("/model groq", "SetProvider", "single", "groq")]
    [InlineData("/model nim", "SetProvider", "single", "nvidia")]
    [InlineData("/model multi.gemini gemini-3-flash-preview", "SetModel", "multi.gemini", "gemini-3-flash-preview")]
    [InlineData("/llm mode multi", "SetMode", "multi", "")]
    [InlineData("/llm single provider cerebras", "SetProvider", "single", "cerebras")]
    [InlineData("/llm single model model-x", "SetModel", "single", "model-x")]
    [InlineData("/llm orchestration provider auto", "SetProvider", "orchestration", "auto")]
    [InlineData("/llm multi nvidia llama/test", "SetModel", "multi.nvidia", "llama/test")]
    [InlineData("/llm multi summary gemini", "SetProvider", "summary", "gemini")]
    [InlineData("/llm set codex gpt-5.4", "LlmSetProviderThenModel", "codex", "gpt-5.4")]
    [InlineData("/llm set nim llama/test", "LlmSetProviderThenModel", "nvidia", "llama/test")]
    public void ParseModelAndLlmCommandsResolveRouteArguments(
        string text,
        string expectedKind,
        string expectedPrimary,
        string expectedSecondary
    )
    {
        var command = UnifiedSlashCommandPolicy.Parse(text);

        Assert.NotNull(command);
        Assert.Equal(expectedKind, command.Kind.ToString());
        Assert.Equal(expectedPrimary, command.Primary);
        Assert.Equal(expectedSecondary, command.Secondary);
    }

    [Theory]
    [InlineData("/llm", "LlmHelp", "")]
    [InlineData("/llm help", "LlmHelp", "")]
    [InlineData("/llm status", "BuildStatus", "")]
    [InlineData("/llm usage", "LlmUsage", "")]
    [InlineData("/llm limits", "LlmUsage", "")]
    [InlineData("/llm quota", "LlmUsage", "")]
    [InlineData("/llm models", "LlmModels", "all")]
    [InlineData("/llm models GROQ", "LlmModels", "groq")]
    [InlineData("/llm set groq meta-llama/Llama-4-Scout", "LlmSetGroqModel", "meta-llama/Llama-4-Scout")]
    [InlineData("/llm set copilot GPT-5-mini", "LlmSetCopilotModel", "GPT-5-mini")]
    public void ParseLlmCommandsResolveSpecialRoutes(
        string text,
        string expectedKind,
        string expectedPrimary
    )
    {
        var command = UnifiedSlashCommandPolicy.Parse(text);

        Assert.NotNull(command);
        Assert.Equal(expectedKind, command.Kind.ToString());
        Assert.Equal(expectedPrimary, command.Primary);
    }

    [Theory]
    [InlineData("/llm mode", "사용법: /llm mode <single|orchestration|multi>")]
    [InlineData("/llm single", "사용법: /llm single provider <groq|gemini|copilot|cerebras|nvidia|codex> | /llm single model <model-id>")]
    [InlineData("/llm orchestration", "사용법: /llm orchestration provider <auto|groq|gemini|copilot|cerebras|nvidia|codex> | /llm orchestration model <model-id>")]
    [InlineData("/llm multi bogus value", "사용법: /llm multi <groq|gemini|copilot|cerebras|nvidia|codex> <model-id> | /llm multi summary <auto|groq|gemini|copilot|cerebras|nvidia|codex>")]
    [InlineData("/llm set gemini model-x", "사용법: /llm set <groq|copilot|nvidia|codex> <model-id>")]
    [InlineData("/llm bogus", "알 수 없는 /llm 명령입니다. /llm help 또는 자연어 요청을 사용하세요.")]
    public void ParseLlmUsageErrorsReturnExistingMessages(string text, string expectedMessage)
    {
        var command = UnifiedSlashCommandPolicy.Parse(text);

        Assert.NotNull(command);
        Assert.Equal(UnifiedSlashCommandKind.StaticMessage, command.Kind);
        Assert.Equal(expectedMessage, command.Message);
    }

    [Fact]
    public void ParseMemoryCreateKeepsCompactFlag()
    {
        var command = UnifiedSlashCommandPolicy.Parse("/memory create compact");

        Assert.NotNull(command);
        Assert.Equal(UnifiedSlashCommandKind.MemoryCreate, command.Kind);
        Assert.True(command.CompactConversation);
    }

    [Fact]
    public void ParseDoctorKeepsFlags()
    {
        var command = UnifiedSlashCommandPolicy.Parse("/doctor json last");

        Assert.NotNull(command);
        Assert.Equal(UnifiedSlashCommandKind.Doctor, command.Kind);
        Assert.True(command.Json);
        Assert.True(command.LatestOnly);
    }

    [Theory]
    [InlineData("/plan list", "Plan")]
    [InlineData("/task list", "Task")]
    [InlineData("/notebook show", "Notebook")]
    [InlineData("/handoff", "Handoff")]
    public void ParseDomainCommandsPreservesTokens(string text, string expectedKind)
    {
        var command = UnifiedSlashCommandPolicy.Parse(text);

        Assert.NotNull(command);
        Assert.Equal(expectedKind, command.Kind.ToString());
        Assert.Equal(text.Split(' ', StringSplitOptions.RemoveEmptyEntries).Length, command.Tokens.Count);
    }
}
