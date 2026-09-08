using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class GrokCliClientTests
{
    [Theory]
    [InlineData("You are logged in with auth.x.ai.", true, "oauth")]
    [InlineData("You are using XAI_API_KEY.", true, "api_key")]
    [InlineData("You are not authenticated.", false, "signed_out")]
    [InlineData("Available models:", false, "unknown")]
    public void StatusComesFromTheOfficialCliBanner(string output, bool authenticated, string mode)
    {
        var status = GrokCliClient.ParseStatus(new(0, output, ""));
        Assert.Equal(authenticated, status.Authenticated);
        Assert.Equal(mode, status.Mode);
    }

    [Fact]
    public void FailedCatalogDoesNotClaimTheCachedCredentialIsValid()
    {
        var status = GrokCliClient.ParseStatus(new(1, "You are logged in with auth.x.ai.", "expired"));
        Assert.False(status.Authenticated);
    }

    [Fact]
    public void CatalogReadsOnlyModelRows()
        => Assert.Equal(new[] { "grok-4.6", "grok-4.5" }, GrokCliClient.ParseModelIds("You are logged in with auth.x.ai.\nDefault model: grok-4.6\nAvailable models:\n  * grok-4.6 (default)\n  - grok-4.5\n  - grok-4.6\n"));

    [Theory]
    [InlineData("ABCD-EFGH")]
    [InlineData("123456")]
    [InlineData("abcdef12")]
    public async Task DeviceLoginExposesOnlyChallengeAndCanBeCanceledWithoutCallingAModel(string userCode)
    {
        var completed = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        using var client = new GrokCliClient("test-cli", async (info, onLine, token) => {
            Assert.Contains("login", info.ArgumentList);
            Assert.Contains("--device-auth", info.ArgumentList);
            onLine!("Open https://accounts.x.ai/oauth2/device");
            onLine("Code: " + userCode);
            onLine("access_token: not-a-real-token");
            try { await Task.Delay(Timeout.Infinite, token); }
            finally { completed.SetResult(); }
            return new GrokCliProcessResult(0, "", "");
        });
        client.StartLogin();
        var status = await client.GetStatusAsync(CancellationToken.None);
        Assert.Equal("oauth_pending", status.Mode);
        Assert.False(status.Authenticated);
        Assert.Equal("https://accounts.x.ai/oauth2/device", status.LoginUrl);
        Assert.Equal(userCode, status.UserCode);
        Assert.DoesNotContain("not-a-real-token", status.ToString());
        client.CancelLogin();
        await completed.Task.WaitAsync(TimeSpan.FromSeconds(2));
    }

    [Fact]
    public async Task GenerationUsesIsolatedPromptFileAndDeniesCliToolsWithoutCallingAModel()
    {
        string? temporaryDirectory = null;
        using var client = new GrokCliClient("test-cli", async (info, _, token) => {
            temporaryDirectory = info.WorkingDirectory;
            var args = info.ArgumentList.ToList();
            Assert.False(info.UseShellExecute);
            Assert.Equal("grok-4.6", args[args.IndexOf("--model") + 1]);
            Assert.Equal("*", args[args.IndexOf("--deny") + 1]);
            Assert.Contains("--no-subagents", args);
            Assert.Equal("요청 `문자열` $()", await File.ReadAllTextAsync(args[args.IndexOf("--prompt-file") + 1], token));
            return new GrokCliProcessResult(0, "모의 응답", "");
        });
        Assert.Equal("모의 응답", await client.GenerateTextAsync("요청 `문자열` $()", "grok-4.6", CancellationToken.None));
        Assert.False(Directory.Exists(temporaryDirectory));
    }
}
