namespace Omnux.Middleware;

internal sealed class TerminalCapabilitySnapshotService
{
    private static readonly string[] ShellCandidates =
    {
        "zsh",
        "bash",
        "sh",
        "pwsh",
        "powershell",
        "cmd"
    };

    private static readonly string[] ToolchainCandidates =
    {
        "git",
        "dotnet",
        "npm",
        "node",
        "python3",
        "python",
        "make"
    };

    private readonly Func<string, string?> _envGet;
    private readonly Func<string, bool> _fileExists;
    private readonly Func<DateTimeOffset> _utcNow;
    private readonly bool _isWindows;

    public TerminalCapabilitySnapshotService(
        Func<string, string?>? envGet = null,
        Func<string, bool>? fileExists = null,
        Func<DateTimeOffset>? utcNow = null,
        bool? isWindows = null
    )
    {
        _envGet = envGet ?? Env.Get;
        _fileExists = fileExists ?? File.Exists;
        _utcNow = utcNow ?? (() => DateTimeOffset.UtcNow);
        _isWindows = isWindows ?? OperatingSystem.IsWindows();
    }

    public TerminalCapabilitySnapshot GetSnapshot()
    {
        var shells = DiscoverShells();
        var toolchains = ToolchainCandidates
            .Select(command => BuildItem(command, "toolchain", command))
            .ToArray();
        var hasShell = shells.Any(item => item.Status == "available");
        var checks = new[]
        {
            hasShell
                ? new TerminalCapabilityCheck("shell", "ok", "at least one shell is resolvable")
                : new TerminalCapabilityCheck("shell", "failed", "no shell was resolved from SHELL or PATH"),
            new TerminalCapabilityCheck("pty_session", "skipped", "PTY session lifecycle is not enabled yet"),
            new TerminalCapabilityCheck("command_streaming", "skipped", "terminal output streaming is not enabled yet"),
            new TerminalCapabilityCheck("auto_repair_loop", "skipped", "autonomous build repair is not enabled yet"),
            new TerminalCapabilityCheck("safety_policy", "ok", "terminal commands are snapshot-only and not executed")
        };

        return new TerminalCapabilitySnapshot(
            hasShell ? "snapshot_only" : "blocked",
            PtySessionEnabled: false,
            shells,
            toolchains,
            checks,
            _utcNow()
        );
    }

    private IReadOnlyList<TerminalCapabilityItem> DiscoverShells()
    {
        var items = new List<TerminalCapabilityItem>();
        var currentShell = (_envGet("SHELL") ?? string.Empty).Trim();
        if (!string.IsNullOrWhiteSpace(currentShell))
        {
            items.Add(BuildItem("current-shell", "shell", currentShell));
        }

        items.AddRange(ShellCandidates.Select(command => BuildItem(command, "shell", command)));
        return items
            .GroupBy(item => item.Command, StringComparer.OrdinalIgnoreCase)
            .Select(group => group.First())
            .ToArray();
    }

    private TerminalCapabilityItem BuildItem(string name, string kind, string command)
    {
        if (TryResolveCommand(command, out var resolvedPath))
        {
            return new TerminalCapabilityItem(
                name,
                kind,
                command,
                "available",
                resolvedPath,
                "command is resolvable"
            );
        }

        return new TerminalCapabilityItem(
            name,
            kind,
            command,
            "missing",
            string.Empty,
            "command was not found on filesystem or PATH"
        );
    }

    private bool TryResolveCommand(string command, out string resolvedPath)
    {
        resolvedPath = string.Empty;
        var trimmed = command.Trim();
        if (string.IsNullOrWhiteSpace(trimmed))
        {
            return false;
        }

        if (IsPathLikeCommand(trimmed))
        {
            if (_fileExists(trimmed))
            {
                resolvedPath = Path.GetFullPath(trimmed);
                return true;
            }

            return false;
        }

        foreach (var directory in EnumeratePathDirectories())
        {
            foreach (var executableName in ExpandExecutableNames(trimmed))
            {
                var candidate = Path.Combine(directory, executableName);
                if (_fileExists(candidate))
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

    private IEnumerable<string> EnumeratePathDirectories()
    {
        return (_envGet("PATH") ?? string.Empty)
            .Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
    }

    private IEnumerable<string> ExpandExecutableNames(string command)
    {
        yield return command;
        if (!_isWindows || Path.HasExtension(command))
        {
            yield break;
        }

        var extensions = (_envGet("PATHEXT") ?? ".EXE;.CMD;.BAT")
            .Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        foreach (var extension in extensions)
        {
            yield return command + extension;
        }
    }
}
