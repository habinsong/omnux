using System.Text.Json;
using Omnux.Middleware;

namespace Omnux.Middleware.Tests;

public sealed class McpConfigDiscoveryServiceTests
{
    [Fact]
    public async Task DiscoverReadsMcpServersAndRedactsSensitiveValues()
    {
        var root = Path.Combine(Path.GetTempPath(), $"omnux-mcp-test-{Guid.NewGuid():N}");
        Directory.CreateDirectory(root);
        var configPath = Path.Combine(root, ".mcp.json");
        await File.WriteAllTextAsync(configPath, """
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "--token",
        "secret-value",
        "--api-key=abc123"
      ],
      "env": {
        "GITHUB_TOKEN": "do-not-return",
        "PLAIN": "value"
      }
    },
    "remote": {
      "url": "https://example.com/mcp?token=abc123",
      "transport": "sse",
      "disabled": true
    }
  }
}
""");

        try
        {
            var service = new McpConfigDiscoveryService(root);
            var snapshot = service.Discover();

            Assert.Equal(2, snapshot.TotalServers);
            Assert.Empty(snapshot.Errors);

            var filesystem = Assert.Single(snapshot.Servers, server => server.Name == "filesystem");
            Assert.Equal("stdio", filesystem.Transport);
            Assert.Equal("npx", filesystem.Command);
            Assert.Equal("discovered", filesystem.Status);
            Assert.Equal(5, filesystem.ArgumentCount);
            Assert.Contains("<redacted>", filesystem.ArgsPreview);
            Assert.DoesNotContain("secret-value", string.Join(" ", filesystem.ArgsPreview));
            Assert.DoesNotContain("abc123", string.Join(" ", filesystem.ArgsPreview));
            Assert.Equal(new[] { "GITHUB_TOKEN", "PLAIN" }, filesystem.EnvKeys);
            Assert.NotEmpty(filesystem.Readiness.Checks);

            var remote = Assert.Single(snapshot.Servers, server => server.Name == "remote");
            Assert.False(remote.Enabled);
            Assert.Equal("disabled", remote.Status);
            Assert.Equal("sse", remote.Transport);
            Assert.DoesNotContain("abc123", remote.Url);
            Assert.Equal("disabled", remote.Readiness.Status);
        }
        finally
        {
            TryDeleteDirectory(root);
        }
    }

    [Fact]
    public async Task DiscoverReportsInvalidJson()
    {
        var root = Path.Combine(Path.GetTempPath(), $"omnux-mcp-test-{Guid.NewGuid():N}");
        Directory.CreateDirectory(root);
        await File.WriteAllTextAsync(Path.Combine(root, ".mcp.json"), "{ invalid");

        try
        {
            var snapshot = new McpConfigDiscoveryService(root).Discover();

            Assert.Empty(snapshot.Servers);
            var error = Assert.Single(snapshot.Errors);
            Assert.Equal("read_failed", error.Code);
            Assert.Contains(".mcp.json", error.Path);
            Assert.Contains(snapshot.ConfigFiles, file => file.Status == "error");
        }
        finally
        {
            TryDeleteDirectory(root);
        }
    }

    [Fact]
    public async Task DiscoverMarksServerWithoutLaunchTargetInvalid()
    {
        var root = Path.Combine(Path.GetTempPath(), $"omnux-mcp-test-{Guid.NewGuid():N}");
        Directory.CreateDirectory(root);
        await File.WriteAllTextAsync(Path.Combine(root, ".mcp.json"), """
{
  "mcpServers": {
    "empty": {
      "args": ["--verbose"]
    }
  }
}
""");

        try
        {
            var snapshot = new McpConfigDiscoveryService(root).Discover();

            var server = Assert.Single(snapshot.Servers);
            Assert.Equal("empty", server.Name);
            Assert.Equal("invalid", server.Status);
            Assert.Contains("missing command or url", server.Message);
            Assert.Equal("blocked", server.Readiness.Status);
        }
        finally
        {
            TryDeleteDirectory(root);
        }
    }

    [Fact]
    public async Task DiscoverReportsReadinessForResolvableStdioServer()
    {
        var root = Path.Combine(Path.GetTempPath(), $"omnux-mcp-test-{Guid.NewGuid():N}");
        Directory.CreateDirectory(root);
        Directory.CreateDirectory(Path.Combine(root, "tools"));
        Directory.CreateDirectory(Path.Combine(root, "bin"));
        var commandPath = Path.Combine(root, "bin", OperatingSystem.IsWindows() ? "fake-mcp.cmd" : "fake-mcp");
        await File.WriteAllTextAsync(commandPath, string.Empty);
        await File.WriteAllTextAsync(Path.Combine(root, ".mcp.json"), $$"""
{
  "mcpServers": {
    "local": {
      "command": {{JsonSerializer.Serialize(commandPath)}},
      "cwd": "tools"
    }
  }
}
""");

        try
        {
            var snapshot = new McpConfigDiscoveryService(root).Discover();

            var server = Assert.Single(snapshot.Servers);
            Assert.Equal("local", server.Name);
            Assert.Equal("discovered", server.Status);
            Assert.Equal("ready_to_launch", server.Readiness.Status);
            Assert.Contains(server.Readiness.Checks, check =>
                check.Name == "working_directory" && check.Status == "ok");
            Assert.Contains(server.Readiness.Checks, check =>
                check.Name == "command" && check.Status == "ok");
        }
        finally
        {
            TryDeleteDirectory(root);
        }
    }

    [Fact]
    public async Task DiscoverBlocksMissingStdioCommand()
    {
        var root = Path.Combine(Path.GetTempPath(), $"omnux-mcp-test-{Guid.NewGuid():N}");
        Directory.CreateDirectory(root);
        var missingCommandPath = Path.Combine(root, "missing-mcp");
        await File.WriteAllTextAsync(Path.Combine(root, ".mcp.json"), $$"""
{
  "mcpServers": {
    "local": {
      "command": {{JsonSerializer.Serialize(missingCommandPath)}}
    }
  }
}
""");

        try
        {
            var snapshot = new McpConfigDiscoveryService(root).Discover();

            var server = Assert.Single(snapshot.Servers);
            Assert.Equal("discovered", server.Status);
            Assert.Equal("blocked", server.Readiness.Status);
            Assert.Contains(server.Readiness.Checks, check =>
                check.Name == "command" && check.Status == "failed");
        }
        finally
        {
            TryDeleteDirectory(root);
        }
    }

    [Fact]
    public async Task DiscoverReportsRemoteReadinessWithoutHandshake()
    {
        var root = Path.Combine(Path.GetTempPath(), $"omnux-mcp-test-{Guid.NewGuid():N}");
        Directory.CreateDirectory(root);
        await File.WriteAllTextAsync(Path.Combine(root, ".mcp.json"), """
{
  "mcpServers": {
    "remote": {
      "url": "https://example.com/mcp",
      "transport": "sse"
    }
  }
}
""");

        try
        {
            var snapshot = new McpConfigDiscoveryService(root).Discover();

            var server = Assert.Single(snapshot.Servers);
            Assert.Equal("discovered", server.Status);
            Assert.Equal("remote_unverified", server.Readiness.Status);
            Assert.Contains(server.Readiness.Checks, check =>
                check.Name == "url" && check.Status == "ok");
            Assert.Contains(server.Readiness.Checks, check =>
                check.Name == "handshake" && check.Status == "skipped");
        }
        finally
        {
            TryDeleteDirectory(root);
        }
    }

    [Fact]
    public async Task DiscoverBlocksInvalidRemoteUrl()
    {
        var root = Path.Combine(Path.GetTempPath(), $"omnux-mcp-test-{Guid.NewGuid():N}");
        Directory.CreateDirectory(root);
        await File.WriteAllTextAsync(Path.Combine(root, ".mcp.json"), """
{
  "mcpServers": {
    "remote": {
      "url": "not-a-url",
      "transport": "http"
    }
  }
}
""");

        try
        {
            var snapshot = new McpConfigDiscoveryService(root).Discover();

            var server = Assert.Single(snapshot.Servers);
            Assert.Equal("discovered", server.Status);
            Assert.Equal("blocked", server.Readiness.Status);
            Assert.Contains(server.Readiness.Checks, check =>
                check.Name == "url" && check.Status == "failed");
        }
        finally
        {
            TryDeleteDirectory(root);
        }
    }

    [Fact]
    public async Task DiscoverBlocksUnsupportedTransport()
    {
        var root = Path.Combine(Path.GetTempPath(), $"omnux-mcp-test-{Guid.NewGuid():N}");
        Directory.CreateDirectory(root);
        await File.WriteAllTextAsync(Path.Combine(root, ".mcp.json"), """
{
  "mcpServers": {
    "remote": {
      "url": "https://example.com/mcp",
      "transport": "custom"
    }
  }
}
""");

        try
        {
            var snapshot = new McpConfigDiscoveryService(root).Discover();

            var server = Assert.Single(snapshot.Servers);
            Assert.Equal("unknown", server.Transport);
            Assert.Equal("blocked", server.Readiness.Status);
            Assert.Contains(server.Readiness.Checks, check =>
                check.Name == "transport" && check.Status == "failed");
        }
        finally
        {
            TryDeleteDirectory(root);
        }
    }

    private static void TryDeleteDirectory(string path)
    {
        try
        {
            if (Directory.Exists(path))
            {
                Directory.Delete(path, recursive: true);
            }
        }
        catch
        {
        }
    }
}
