namespace Omnux.Middleware;

internal static class GitTimeMachineReadinessPolicy
{
    public static GitTimeMachineReadiness Evaluate(
        bool isRepository,
        bool worktreeStatusAvailable,
        bool hasChanges,
        int conflictedFileCount,
        int checkpointCount
    )
    {
        if (!isRepository)
        {
            return new GitTimeMachineReadiness(
                "blocked",
                false,
                false,
                true,
                new[] { "not_git_repository" }
            );
        }

        if (!worktreeStatusAvailable)
        {
            return new GitTimeMachineReadiness(
                "blocked",
                false,
                false,
                true,
                new[] { "git_status_failed" }
            );
        }

        if (conflictedFileCount > 0)
        {
            return new GitTimeMachineReadiness(
                "blocked",
                false,
                false,
                true,
                new[] { "merge_conflicts_present" }
            );
        }

        if (checkpointCount == 0)
        {
            return new GitTimeMachineReadiness(
                "blocked",
                hasChanges,
                false,
                true,
                new[] { "no_commits" }
            );
        }

        if (hasChanges)
        {
            return new GitTimeMachineReadiness(
                "manual_review_required",
                true,
                false,
                true,
                new[] { "uncommitted_changes_present", "rollback_would_discard_worktree_changes" }
            );
        }

        if (checkpointCount < 2)
        {
            return new GitTimeMachineReadiness(
                "clean",
                false,
                false,
                true,
                new[] { "not_enough_history" }
            );
        }

        return new GitTimeMachineReadiness(
            "ready_for_rollback_review",
            false,
            true,
            true,
            Array.Empty<string>()
        );
    }
}
