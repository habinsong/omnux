namespace Omnux.Middleware;

internal static class McpServerReadinessPolicy
{
    public static McpServerReadiness Evaluate(
        bool enabled,
        string status,
        string transport,
        string command,
        string url,
        string workingDirectory,
        string configPath
    )
    {
        var checks = new List<McpServerReadinessCheck>();
        if (!enabled)
        {
            checks.Add(new McpServerReadinessCheck("enabled", "skipped", "server is disabled"));
            return new McpServerReadiness("disabled", checks);
        }

        if (status == "invalid")
        {
            checks.Add(new McpServerReadinessCheck("launch_target", "failed", "server is missing command or url"));
            return new McpServerReadiness("blocked", checks);
        }

        if (transport == "unknown")
        {
            checks.Add(new McpServerReadinessCheck("transport", "failed", "server transport is not supported"));
            return new McpServerReadiness("blocked", checks);
        }

        if (transport == "stdio")
        {
            AddWorkingDirectoryCheck(checks, workingDirectory, configPath);
            AddCommandCheck(checks, command, workingDirectory, configPath);
            return new McpServerReadiness(
                checks.Any(check => check.Status == "failed") ? "blocked" : "ready_to_launch",
                checks
            );
        }

        AddUrlCheck(checks, url);
        return new McpServerReadiness(
            checks.Any(check => check.Status == "failed") ? "blocked" : "remote_unverified",
            checks
        );
    }

    private static void AddWorkingDirectoryCheck(
        ICollection<McpServerReadinessCheck> checks,
        string workingDirectory,
        string configPath
    )
    {
        if (string.IsNullOrWhiteSpace(workingDirectory))
        {
            checks.Add(new McpServerReadinessCheck("working_directory", "ok", "no working directory override"));
            return;
        }

        var resolved = ResolveConfigRelativePath(workingDirectory, configPath);
        checks.Add(Directory.Exists(resolved)
            ? new McpServerReadinessCheck("working_directory", "ok", "working directory exists")
            : new McpServerReadinessCheck("working_directory", "failed", "working directory does not exist"));
    }

    private static void AddCommandCheck(
        ICollection<McpServerReadinessCheck> checks,
        string command,
        string workingDirectory,
        string configPath
    )
    {
        if (string.IsNullOrWhiteSpace(command))
        {
            checks.Add(new McpServerReadinessCheck("command", "failed", "stdio server is missing command"));
            return;
        }

        if (TryResolveCommandPath(command, workingDirectory, configPath, out _))
        {
            checks.Add(new McpServerReadinessCheck("command", "ok", "command is resolvable"));
            return;
        }

        checks.Add(new McpServerReadinessCheck("command", "failed", "command was not found on filesystem or PATH"));
    }

    private static void AddUrlCheck(ICollection<McpServerReadinessCheck> checks, string url)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri)
            || (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
        {
            checks.Add(new McpServerReadinessCheck("url", "failed", "remote server url must be absolute http/https"));
            return;
        }

        checks.Add(new McpServerReadinessCheck("url", "ok", "remote server url is syntactically valid"));
        checks.Add(new McpServerReadinessCheck("handshake", "skipped", "MCP client handshake is not enabled yet"));
    }

    private static bool TryResolveCommandPath(
        string command,
        string workingDirectory,
        string configPath,
        out string resolvedPath
    )
    {
        resolvedPath = string.Empty;
        var trimmed = command.Trim();
        if (IsPathLikeCommand(trimmed))
        {
            var candidate = Path.IsPathRooted(trimmed)
                ? trimmed
                : Path.Combine(ResolveWorkingDirectoryBase(workingDirectory, configPath), trimmed);
            if (File.Exists(candidate))
            {
                resolvedPath = Path.GetFullPath(candidate);
                return true;
            }

            return false;
        }

        foreach (var directory in EnumeratePathDirectories())
        {
            foreach (var executableName in ExpandExecutableNames(trimmed))
            {
                var candidate = Path.Combine(directory, executableName);
                if (File.Exists(candidate))
                {
                    resolvedPath = candidate;
                    return true;
                }
            }
        }

        return false;
    }

    private static bool IsPathLikeCommand(string command)
    {
        return Path.IsPathRooted(command)
            || command.Contains(Path.DirectorySeparatorChar)
            || command.Contains(Path.AltDirectorySeparatorChar);
    }

    private static string ResolveConfigRelativePath(string path, string configPath)
    {
        return Path.GetFullPath(Path.IsPathRooted(path)
            ? path
            : Path.Combine(Path.GetDirectoryName(configPath) ?? ".", path));
    }

    private static string ResolveWorkingDirectoryBase(string workingDirectory, string configPath)
    {
        return string.IsNullOrWhiteSpace(workingDirectory)
            ? Path.GetDirectoryName(configPath) ?? "."
            : ResolveConfigRelativePath(workingDirectory, configPath);
    }

    private static IEnumerable<string> EnumeratePathDirectories()
    {
        return (Environment.GetEnvironmentVariable("PATH") ?? string.Empty)
            .Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
    }

    private static IEnumerable<string> ExpandExecutableNames(string command)
    {
        yield return command;
        if (!OperatingSystem.IsWindows() || Path.HasExtension(command))
        {
            yield break;
        }

        var extensions = (Environment.GetEnvironmentVariable("PATHEXT") ?? ".EXE;.CMD;.BAT")
            .Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        foreach (var extension in extensions)
        {
            yield return command + extension;
        }
    }
}
