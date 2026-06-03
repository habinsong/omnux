using System.Globalization;
using System.Text.RegularExpressions;

namespace Omnux.Middleware;

internal sealed class GitAutomationRemoteSnapshotProbe
{
    private const int GitTimeoutSeconds = 5;

    private readonly string _repositoryRoot;

    public GitAutomationRemoteSnapshotProbe(string repositoryRoot)
    {
        _repositoryRoot = repositoryRoot;
    }

    public async Task<GitAutomationRemoteSnapshot> GetSnapshotAsync(
        string branchName,
        CancellationToken cancellationToken
    )
    {
        var warnings = new List<string>();
        var remotes = await RunGitAsync(new[] { "remote" }, cancellationToken).ConfigureAwait(false);
        if (remotes.ExitCode != 0)
        {
            warnings.Add(GitAutomationSnapshotText.TrimWarning(remotes.StdErr, "git remote failed"));
            return Empty(warnings);
        }

        var remoteNames = (remotes.StdOut ?? string.Empty)
            .Replace("\r\n", "\n", StringComparison.Ordinal)
            .Replace('\r', '\n')
            .Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Distinct(StringComparer.Ordinal)
            .ToArray();
        if (remoteNames.Length == 0)
        {
            return Empty();
        }

        var primaryRemote = remoteNames.Contains("origin", StringComparer.Ordinal)
            ? "origin"
            : remoteNames[0];
        var primaryUrl = await ReadGitLineAsync(new[] { "remote", "get-url", primaryRemote }, cancellationToken)
            .ConfigureAwait(false);
        var pushUrl = await ReadGitLineAsync(new[] { "remote", "get-url", "--push", primaryRemote }, cancellationToken)
            .ConfigureAwait(false);
        var upstreamName = await ReadUpstreamNameAsync(cancellationToken).ConfigureAwait(false);
        var divergence = string.IsNullOrWhiteSpace(upstreamName)
            ? (Ahead: (int?)null, Behind: (int?)null)
            : await ReadUpstreamDivergenceAsync(warnings, cancellationToken).ConfigureAwait(false);
        var suggestedPushTarget = !string.IsNullOrWhiteSpace(primaryRemote)
                                  && !string.IsNullOrWhiteSpace(branchName)
                                  && !branchName.Equals("HEAD", StringComparison.Ordinal)
            ? $"{primaryRemote}/{branchName}"
            : string.Empty;

        return new GitAutomationRemoteSnapshot(
            true,
            remoteNames,
            primaryRemote,
            RedactRemoteUrl(primaryUrl),
            RedactRemoteUrl(pushUrl),
            !string.IsNullOrWhiteSpace(upstreamName),
            upstreamName,
            divergence.Ahead,
            divergence.Behind,
            suggestedPushTarget,
            warnings
        );
    }

    public static GitAutomationRemoteSnapshot Empty(IReadOnlyList<string>? warnings = null)
    {
        return new GitAutomationRemoteSnapshot(
            false,
            Array.Empty<string>(),
            string.Empty,
            string.Empty,
            string.Empty,
            false,
            string.Empty,
            null,
            null,
            string.Empty,
            warnings ?? Array.Empty<string>()
        );
    }

    private async Task<string> ReadUpstreamNameAsync(CancellationToken cancellationToken)
    {
        var upstream = await RunGitAsync(
                new[] { "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}" },
                cancellationToken
            )
            .ConfigureAwait(false);
        return upstream.ExitCode == 0 ? upstream.StdOut.Trim() : string.Empty;
    }

    private async Task<(int? Ahead, int? Behind)> ReadUpstreamDivergenceAsync(
        List<string> warnings,
        CancellationToken cancellationToken
    )
    {
        var divergence = await RunGitAsync(
                new[] { "rev-list", "--left-right", "--count", "HEAD...@{u}" },
                cancellationToken
            )
            .ConfigureAwait(false);
        if (divergence.ExitCode != 0)
        {
            warnings.Add(
                GitAutomationSnapshotText.TrimWarning(
                    divergence.StdErr,
                    "git rev-list upstream divergence failed"
                )
            );
            return (null, null);
        }

        var parts = divergence.StdOut.Trim().Split(
            new[] { '\t', ' ' },
            StringSplitOptions.RemoveEmptyEntries
        );
        if (parts.Length < 2)
        {
            return (null, null);
        }

        return (
            int.TryParse(parts[0], NumberStyles.Integer, CultureInfo.InvariantCulture, out var ahead) ? ahead : null,
            int.TryParse(parts[1], NumberStyles.Integer, CultureInfo.InvariantCulture, out var behind) ? behind : null
        );
    }

    private async Task<string> ReadGitLineAsync(
        IReadOnlyList<string> arguments,
        CancellationToken cancellationToken
    )
    {
        var result = await RunGitAsync(arguments, cancellationToken).ConfigureAwait(false);
        return result.ExitCode == 0 ? result.StdOut.Trim() : string.Empty;
    }

    private Task<GitAutomationProcessResult> RunGitAsync(
        IReadOnlyList<string> arguments,
        CancellationToken cancellationToken
    )
    {
        return GitAutomationProcessRunner.RunGitAsync(
            _repositoryRoot,
            arguments,
            GitTimeoutSeconds,
            cancellationToken
        );
    }

    private static string RedactRemoteUrl(string value)
    {
        var trimmed = (value ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(trimmed))
        {
            return string.Empty;
        }

        var withoutCredentials = Regex.Replace(
            trimmed,
            @"(https?://)([^/@\s]+@)",
            "$1***@",
            RegexOptions.IgnoreCase,
            TimeSpan.FromMilliseconds(100)
        );
        var queryIndex = withoutCredentials.IndexOf('?', StringComparison.Ordinal);
        return queryIndex >= 0 ? withoutCredentials[..queryIndex] + "?***" : withoutCredentials;
    }
}
