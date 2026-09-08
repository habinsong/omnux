using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class CopilotModelSelectionTests
{
    [Fact]
    public void CliChoicesAreReadInsideTheCurrentModelOption()
    {
        var choices = CopilotCliWrapper.ParseModelChoices("""
            --model <model> Set the AI model (choices:
              "gpt-6-astra", "claude-fable-5.1", "gpt-6-astra")
            --theme <theme> Theme (choices: "dark", "light")
            """);
        Assert.Equal(new[] { "claude-fable-5.1", "gpt-6-astra" }, choices);
    }

    [Fact]
    public void ChosenModelSurvivesReloadWithoutCallingTheCli()
    {
        var root = Path.Combine(Path.GetTempPath(), $"omnux-copilot-selection-{Guid.NewGuid():N}");
        var state = Path.Combine(root, "usage.json");
        try
        {
            var wrapper = new CopilotCliWrapper("unused-gh", "unused-copilot", "gpt-5.4", state);
            Assert.Equal("gpt-5.4", wrapper.GetSelectedModel());
            Assert.True(wrapper.TrySetSelectedModel(" gpt-6-astra "));
            Assert.Equal("gpt-6-astra", wrapper.GetSelectedModel());
            Assert.False(wrapper.TrySetSelectedModel("invalid;command"));
            Assert.Equal("gpt-6-astra", wrapper.GetSelectedModel());
            var reloaded = new CopilotCliWrapper("unused-gh", "unused-copilot", "gpt-5-mini", state);
            Assert.Equal("gpt-6-astra", reloaded.GetSelectedModel());
        }
        finally
        {
            if (Directory.Exists(root)) Directory.Delete(root, recursive: true);
        }
    }
}
