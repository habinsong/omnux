using System.Text.Json;
using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class UsageStatePersistenceTests
{
    [Fact]
    public void LoadLlmUsageStateRestoresValidBackupWhenPrimaryIsCorrupt()
    {
        var dir = CreateTempDirectory();
        var path = Path.Combine(dir, "llm_usage.json");
        var backupState = new LlmUsageState
        {
            GroqUsageByModel = new Dictionary<string, GroqUsage>(StringComparer.OrdinalIgnoreCase)
            {
                ["llama-3.3"] = new GroqUsage
                {
                    Requests = 2,
                    PromptTokens = 10,
                    CompletionTokens = 20,
                    TotalTokens = 30
                },
                ["groq/compound"] = new GroqUsage
                {
                    Requests = 1,
                    PromptTokens = 4,
                    CompletionTokens = 6,
                    TotalTokens = 10
                }
            },
            GroqRateByModel = new Dictionary<string, GroqRateLimit>(StringComparer.OrdinalIgnoreCase)
            {
                ["groq/compound"] = new GroqRateLimit
                {
                    LimitRequests = 100,
                    RemainingRequests = 0,
                    LimitTokens = 1000,
                    RemainingTokens = 0,
                    ResetRequests = "12s",
                    ResetTokens = "24s",
                    CooldownUntilUtc = new DateTimeOffset(2026, 5, 18, 12, 30, 0, TimeSpan.Zero),
                    LastUpdatedUtc = new DateTimeOffset(2026, 5, 18, 12, 0, 0, TimeSpan.Zero)
                }
            },
            GeminiUsage = new GeminiUsage
            {
                Requests = 1,
                PromptTokens = 3,
                CompletionTokens = 5,
                TotalTokens = 8
            }
        };

        var backupJson = JsonSerializer.Serialize(backupState, OmniJsonContext.Default.LlmUsageState);
        File.WriteAllText(path, "{broken");
        File.WriteAllText(path + ".bak", backupJson);

        var restored = UsageStatePersistence.LoadLlmUsageState(path);

        Assert.NotNull(restored);
        Assert.Equal(2, restored.GroqUsageByModel["llama-3.3"].Requests);
        Assert.Equal(30, restored.GroqUsageByModel["llama-3.3"].TotalTokens);
        Assert.Equal(new DateTimeOffset(2026, 5, 18, 12, 30, 0, TimeSpan.Zero), restored.GroqRateByModel["groq/compound"].CooldownUntilUtc);
        Assert.Equal(1, restored.GeminiUsage.Requests);
        Assert.Equal(backupJson, File.ReadAllText(path));
    }

    [Fact]
    public void LoadCopilotStateRestoresValidBackupWhenPrimaryIsCorrupt()
    {
        var dir = CreateTempDirectory();
        var path = Path.Combine(dir, "copilot_usage.json");
        var backupState = new CopilotState
        {
            SelectedModel = "gpt-5-mini",
            UsageByModel = new Dictionary<string, CopilotUsage>(StringComparer.OrdinalIgnoreCase)
            {
                ["gpt-5-mini"] = new CopilotUsage
                {
                    Requests = 7
                }
            }
        };

        var backupJson = JsonSerializer.Serialize(backupState, OmniJsonContext.Default.CopilotState);
        File.WriteAllText(path, "{broken");
        File.WriteAllText(path + ".bak", backupJson);

        var restored = UsageStatePersistence.LoadCopilotState(path);

        Assert.NotNull(restored);
        Assert.Equal("gpt-5-mini", restored.SelectedModel);
        Assert.Equal(7, restored.UsageByModel["gpt-5-mini"].Requests);
        Assert.Equal(backupJson, File.ReadAllText(path));
    }

    private static string CreateTempDirectory()
    {
        var path = Path.Combine(Path.GetTempPath(), "omnux-tests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(path);
        return path;
    }
}
