namespace Omnux.Middleware;

internal static class GitAutomationPublishReadinessPolicy
{
    private static readonly string[] SkippedActions =
    {
        "git_add",
        "git_commit",
        "git_branch_create",
        "git_push",
        "gh_auth_status",
        "gh_pr_create"
    };

    public static GitAutomationPublishReadiness Build(
        bool hasChanges,
        int conflictedFileCount,
        string branchName,
        GitAutomationRemoteSnapshot remote,
        GitAutomationToolchainSnapshot toolchain
    )
    {
        if (!hasChanges)
        {
            return new GitAutomationPublishReadiness(
                "clean",
                false,
                false,
                true,
                new[] { "no_changes" },
                SkippedActions
            );
        }

        var blockers = BuildBlockers(conflictedFileCount, branchName, remote, toolchain);
        var detachedHead = IsDetachedHead(branchName);
        var ghAvailable = toolchain.GitHubCli.Status == "available";
        var pushReady = conflictedFileCount == 0 && !detachedHead && remote.HasRemote;
        var pullRequestReady = pushReady && remote.HasUpstream && ghAvailable;
        return new GitAutomationPublishReadiness(
            ResolveStatus(conflictedFileCount, detachedHead, remote, ghAvailable, pullRequestReady),
            pushReady,
            pullRequestReady,
            true,
            blockers,
            SkippedActions
        );
    }

    private static IReadOnlyList<string> BuildBlockers(
        int conflictedFileCount,
        string branchName,
        GitAutomationRemoteSnapshot remote,
        GitAutomationToolchainSnapshot toolchain
    )
    {
        var blockers = new List<string>();
        if (conflictedFileCount > 0)
        {
            blockers.Add("merge_conflicts_present");
        }

        if (IsDetachedHead(branchName))
        {
            blockers.Add("detached_head");
        }

        if (!remote.HasRemote)
        {
            blockers.Add("no_remote");
        }

        if (remote.HasRemote && !remote.HasUpstream)
        {
            blockers.Add("no_upstream");
        }

        if (toolchain.GitHubCli.Status != "available")
        {
            blockers.Add("gh_cli_unavailable");
        }

        return blockers;
    }

    private static string ResolveStatus(
        int conflictedFileCount,
        bool detachedHead,
        GitAutomationRemoteSnapshot remote,
        bool ghAvailable,
        bool pullRequestReady
    )
    {
        if (conflictedFileCount > 0 || detachedHead)
        {
            return "blocked";
        }

        if (!remote.HasRemote)
        {
            return "missing_remote";
        }

        if (!remote.HasUpstream)
        {
            return "needs_initial_push";
        }

        if (!ghAvailable)
        {
            return "missing_github_cli";
        }

        return pullRequestReady ? "ready_for_pull_request" : "blocked";
    }

    private static bool IsDetachedHead(string branchName)
    {
        return string.IsNullOrWhiteSpace(branchName)
               || branchName.Equals("HEAD", StringComparison.OrdinalIgnoreCase);
    }
}
