namespace Omnux.Middleware;

internal sealed class GitAutomationToolchainProbe
{
    private const int ToolTimeoutSeconds = 3;

    private readonly string _repositoryRoot;

    public GitAutomationToolchainProbe(string repositoryRoot)
    {
        _repositoryRoot = repositoryRoot;
    }

    public async Task<GitAutomationToolchainSnapshot> GetSnapshotAsync(CancellationToken cancellationToken)
    {
        var gh = await GitAutomationProcessRunner.RunAsync(
                _repositoryRoot,
                "gh",
                new[] { "--version" },
                ToolTimeoutSeconds,
                cancellationToken
            )
            .ConfigureAwait(false);
        if (gh.ExitCode == 0)
        {
            return new GitAutomationToolchainSnapshot(
                new GitAutomationToolSnapshot(
                    "GitHub CLI",
                    "gh",
                    "available",
                    GitAutomationSnapshotText.ExtractFirstLine(gh.StdOut),
                    "gh --version succeeded; auth and network checks are skipped"
                )
            );
        }

        return new GitAutomationToolchainSnapshot(
            new GitAutomationToolSnapshot(
                "GitHub CLI",
                "gh",
                "missing",
                string.Empty,
                GitAutomationSnapshotText.TrimWarning(
                    string.IsNullOrWhiteSpace(gh.StdErr) ? gh.StdOut : gh.StdErr,
                    "gh CLI is not available"
                )
            )
        );
    }
}
