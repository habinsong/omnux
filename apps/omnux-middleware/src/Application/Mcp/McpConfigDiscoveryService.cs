using System.Text.Json;

namespace Omnux.Middleware;

internal sealed class McpConfigDiscoveryService
{
    private static readonly (string Source, string RelativePath)[] DefaultCandidates =
    {
        ("workspace", ".mcp.json"),
        ("omni", Path.Combine(".omni", "mcp.json")),
        ("cursor", Path.Combine(".cursor", "mcp.json")),
        ("windsurf", Path.Combine(".codeium", "windsurf", "mcp_config.json"))
    };

    private readonly string _workspaceRoot;
    private readonly IReadOnlyList<(string Source, string Path)> _candidatePaths;

    public McpConfigDiscoveryService(string workspaceRoot)
        : this(workspaceRoot, null)
    {
    }

    internal McpConfigDiscoveryService(
        string workspaceRoot,
        IReadOnlyList<(string Source, string Path)>? candidatePaths
    )
    {
        _workspaceRoot = Path.GetFullPath(string.IsNullOrWhiteSpace(workspaceRoot) ? "." : workspaceRoot);
        _candidatePaths = candidatePaths ?? DefaultCandidates
            .Select(candidate => (candidate.Source, Path.Combine(_workspaceRoot, candidate.RelativePath)))
            .ToArray();
    }

    public McpDiscoverySnapshot Discover()
    {
        var configFiles = new List<McpConfigFileDiscovery>();
        var servers = new List<McpServerDiscovery>();
        var errors = new List<McpDiscoveryError>();

        foreach (var candidate in _candidatePaths)
        {
            var configPath = Path.GetFullPath(candidate.Path);
            if (!File.Exists(configPath))
            {
                configFiles.Add(new McpConfigFileDiscovery(
                    candidate.Source,
                    configPath,
                    Exists: false,
                    "missing",
                    0,
                    null
                ));
                continue;
            }

            var beforeCount = servers.Count;
            try
            {
                using var document = JsonDocument.Parse(
                    File.ReadAllText(configPath),
                    new JsonDocumentOptions
                    {
                        AllowTrailingCommas = true,
                        CommentHandling = JsonCommentHandling.Skip
                    }
                );

                if (!TryGetServerMap(document.RootElement, out var serverMap, out var mapCode))
                {
                    var message = mapCode == "missing_server_map"
                        ? "mcpServers object was not found"
                        : "mcpServers must be an object";
                    errors.Add(new McpDiscoveryError(candidate.Source, configPath, mapCode, message));
                    configFiles.Add(new McpConfigFileDiscovery(
                        candidate.Source,
                        configPath,
                        Exists: true,
                        "invalid",
                        0,
                        message
                    ));
                    continue;
                }

                foreach (var property in serverMap.EnumerateObject())
                {
                    servers.Add(ParseServer(candidate.Source, configPath, property));
                }

                var serverCount = servers.Count - beforeCount;
                configFiles.Add(new McpConfigFileDiscovery(
                    candidate.Source,
                    configPath,
                    Exists: true,
                    serverCount == 0 ? "empty" : "ok",
                    serverCount,
                    null
                ));
            }
            catch (Exception ex) when (ex is JsonException or IOException or UnauthorizedAccessException)
            {
                errors.Add(new McpDiscoveryError(candidate.Source, configPath, "read_failed", ex.Message));
                configFiles.Add(new McpConfigFileDiscovery(
                    candidate.Source,
                    configPath,
                    Exists: true,
                    "error",
                    0,
                    ex.Message
                ));
            }
        }

        var orderedServers = servers
            .OrderBy(server => server.Source, StringComparer.Ordinal)
            .ThenBy(server => server.Name, StringComparer.OrdinalIgnoreCase)
            .ToArray();

        return new McpDiscoverySnapshot(
            configFiles,
            orderedServers,
            errors,
            orderedServers.Length,
            DateTimeOffset.UtcNow
        );
    }

    private static bool TryGetServerMap(JsonElement root, out JsonElement serverMap, out string code)
    {
        serverMap = default;
        code = string.Empty;
        if (root.ValueKind != JsonValueKind.Object)
        {
            code = "root_not_object";
            return false;
        }

        if (!TryGetProperty(root, "mcpServers", out serverMap)
            && !TryGetProperty(root, "servers", out serverMap))
        {
            code = "missing_server_map";
            return false;
        }

        if (serverMap.ValueKind != JsonValueKind.Object)
        {
            code = "server_map_not_object";
            return false;
        }

        return true;
    }

    private static McpServerDiscovery ParseServer(
        string source,
        string configPath,
        JsonProperty property
    )
    {
        var name = NormalizeName(property.Name);
        if (property.Value.ValueKind != JsonValueKind.Object)
        {
            return new McpServerDiscovery(
                BuildServerId(source, name),
                name,
                source,
                configPath,
                "unknown",
                string.Empty,
                Array.Empty<string>(),
                0,
                string.Empty,
                string.Empty,
                Array.Empty<string>(),
                0,
                Enabled: false,
                "invalid",
                "server config must be an object"
            );
        }

        var config = property.Value;
        var disabled = GetBool(config, "disabled") == true;
        var enabled = !disabled && (GetBool(config, "enabled") ?? true);
        var command = Trim(GetString(config, "command"));
        var args = ReadStringArray(config, "args");
        var url = Trim(GetString(config, "url", "endpoint"));
        var transport = NormalizeTransport(GetString(config, "transport", "type"), url);
        var workingDirectory = Trim(GetString(config, "cwd", "workingDirectory"));
        var envKeys = ReadObjectKeys(config, "env");
        var hasLaunchTarget = !string.IsNullOrWhiteSpace(command) || !string.IsNullOrWhiteSpace(url);
        var status = ResolveStatus(enabled, hasLaunchTarget);

        return new McpServerDiscovery(
            BuildServerId(source, name),
            name,
            source,
            configPath,
            transport,
            command,
            McpConfigSecretRedactionPolicy.RedactArgs(args),
            args.Count,
            McpConfigSecretRedactionPolicy.RedactInlineSecrets(url),
            workingDirectory,
            envKeys,
            envKeys.Count,
            enabled,
            status,
            ResolveMessage(status, transport)
        );
    }

    private static string ResolveStatus(bool enabled, bool hasLaunchTarget)
    {
        if (!enabled)
        {
            return "disabled";
        }

        return hasLaunchTarget ? "discovered" : "invalid";
    }

    private static string ResolveMessage(string status, string transport)
    {
        return status switch
        {
            "disabled" => "server is present but disabled in config",
            "invalid" => "server is missing command or url",
            _ => transport == "stdio"
                ? "stdio server config discovered; process launch is not enabled yet"
                : "remote MCP server config discovered; client handshake is not enabled yet"
        };
    }

    private static IReadOnlyList<string> ReadStringArray(JsonElement config, string propertyName)
    {
        if (!TryGetProperty(config, propertyName, out var value) || value.ValueKind != JsonValueKind.Array)
        {
            return Array.Empty<string>();
        }

        return value.EnumerateArray()
            .Select(ReadScalar)
            .Where(item => !string.IsNullOrWhiteSpace(item))
            .Select(item => item.Trim())
            .ToArray();
    }

    private static IReadOnlyList<string> ReadObjectKeys(JsonElement config, string propertyName)
    {
        if (!TryGetProperty(config, propertyName, out var value) || value.ValueKind != JsonValueKind.Object)
        {
            return Array.Empty<string>();
        }

        return value.EnumerateObject()
            .Select(property => property.Name.Trim())
            .Where(name => !string.IsNullOrWhiteSpace(name))
            .OrderBy(name => name, StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    private static bool? GetBool(JsonElement config, string propertyName)
    {
        if (!TryGetProperty(config, propertyName, out var value))
        {
            return null;
        }

        if (value.ValueKind == JsonValueKind.True)
        {
            return true;
        }

        if (value.ValueKind == JsonValueKind.False)
        {
            return false;
        }

        if (value.ValueKind == JsonValueKind.String
            && bool.TryParse(value.GetString(), out var parsed))
        {
            return parsed;
        }

        return null;
    }

    private static string GetString(JsonElement config, params string[] propertyNames)
    {
        foreach (var propertyName in propertyNames)
        {
            if (!TryGetProperty(config, propertyName, out var value))
            {
                continue;
            }

            var scalar = ReadScalar(value);
            if (!string.IsNullOrWhiteSpace(scalar))
            {
                return scalar;
            }
        }

        return string.Empty;
    }

    private static string ReadScalar(JsonElement value)
    {
        return value.ValueKind switch
        {
            JsonValueKind.String => value.GetString() ?? string.Empty,
            JsonValueKind.Number or JsonValueKind.True or JsonValueKind.False => value.ToString(),
            _ => string.Empty
        };
    }

    private static bool TryGetProperty(JsonElement element, string name, out JsonElement value)
    {
        foreach (var property in element.EnumerateObject())
        {
            if (string.Equals(property.Name, name, StringComparison.OrdinalIgnoreCase))
            {
                value = property.Value;
                return true;
            }
        }

        value = default;
        return false;
    }

    private static string NormalizeTransport(string transport, string url)
    {
        var normalized = Trim(transport).ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return string.IsNullOrWhiteSpace(url) ? "stdio" : "http";
        }

        return normalized switch
        {
            "stdio" or "sse" or "http" or "streamable-http" => normalized,
            _ => "unknown"
        };
    }

    private static string BuildServerId(string source, string name)
    {
        return $"{NormalizeName(source)}:{NormalizeName(name)}";
    }

    private static string NormalizeName(string value)
    {
        var normalized = (value ?? string.Empty).Trim();
        return string.IsNullOrWhiteSpace(normalized) ? "unnamed" : normalized;
    }

    private static string Trim(string value)
    {
        return (value ?? string.Empty).Trim();
    }

}
