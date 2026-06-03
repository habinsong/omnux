namespace Omnux.Middleware;

internal sealed class GitOperationExecutor
{
    private const int GitTimeoutSeconds = 20;

    private readonly string _repositoryRoot;

    public GitOperationExecutor(string repositoryRoot)
    {
        _repositoryRoot = Path.GetFullPath(string.IsNullOrWhiteSpace(repositoryRoot) ? "." : repositoryRoot);
    }

    public async Task<GitOperationApplyResult> ExecuteAsync(
        GitOperationPreviewRecord record,
        CancellationToken cancellationToken
    )
    {
        var executed = new List<GitOperationExecutedCommand>();
        IReadOnlyList<IReadOnlyList<string>> commandSets = record.Operation switch
        {
            GitOperationNames.CreateBranch => new[]
            {
                new[] { "checkout", "-b", record.Request.BranchName }
            },
            GitOperationNames.StageAndCommit or GitOperationNames.SnapshotCommit => BuildCommitCommandSets(record),
            GitOperationNames.PushCurrentBranch => new[]
            {
                BuildPushCommandSet(record)
            },
            _ => Array.Empty<IReadOnlyList<string>>()
        };

        if (commandSets.Count == 0)
        {
            return BuildFailure(
                record,
                "unsupported_operation",
                "지원하지 않는 Git operation입니다.",
                executed,
                await ReadApplySnapshotAsync(cancellationToken).ConfigureAwait(false)
            );
        }

        foreach (var arguments in commandSets)
        {
            var result = await RunGitAsync(arguments, cancellationToken).ConfigureAwait(false);
            executed.Add(new GitOperationExecutedCommand(
                "git",
                arguments,
                result.ExitCode,
                result.StdOut.Trim(),
                result.StdErr.Trim()
            ));

            if (result.ExitCode != 0)
            {
                return BuildFailure(
                    record,
                    "git_command_failed",
                    "Git command 실행에 실패했습니다.",
                    executed,
                    await ReadApplySnapshotAsync(cancellationToken).ConfigureAwait(false)
                );
            }
        }

        return new GitOperationApplyResult(
            true,
            "applied",
            record.PreviewId,
            record.Operation,
            "Git operation이 적용되었습니다.",
            new[] { new GitOperationCheck("git_operation_applied", "passed", "Git operation 실행 완료") },
            executed,
            Array.Empty<string>(),
            await ReadApplySnapshotAsync(cancellationToken).ConfigureAwait(false)
        );
    }

    private static IReadOnlyList<IReadOnlyList<string>> BuildCommitCommandSets(GitOperationPreviewRecord record)
    {
        var addArgs = new List<string> { "add", "--" };
        addArgs.AddRange(record.Request.Paths);
        return new IReadOnlyList<string>[]
        {
            addArgs,
            new[] { "commit", "-m", record.Request.CommitMessage }
        };
    }

    private static IReadOnlyList<string> BuildPushCommandSet(GitOperationPreviewRecord record)
    {
        var args = new List<string> { "push" };
        if (record.Request.SetUpstream)
        {
            args.Add("-u");
        }

        args.Add(record.Request.RemoteName);
        args.Add($"HEAD:{record.Request.RemoteBranchName}");
        return args;
    }

    private static GitOperationApplyResult BuildFailure(
        GitOperationPreviewRecord record,
        string blocker,
        string message,
        IReadOnlyList<GitOperationExecutedCommand> executed,
        GitOperationApplySnapshot? snapshot
    )
    {
        return new GitOperationApplyResult(
            false,
            "failed",
            record.PreviewId,
            record.Operation,
            message,
            new[] { new GitOperationCheck(blocker, "blocked", message) },
            executed,
            new[] { blocker },
            snapshot
        );
    }

    private async Task<GitOperationApplySnapshot?> ReadApplySnapshotAsync(CancellationToken cancellationToken)
    {
        var branch = await ReadGitLineAsync(new[] { "rev-parse", "--abbrev-ref", "HEAD" }, cancellationToken)
            .ConfigureAwait(false);
        var head = await ReadGitLineAsync(new[] { "rev-parse", "HEAD" }, cancellationToken)
            .ConfigureAwait(false);
        return string.IsNullOrWhiteSpace(head)
            ? null
            : new GitOperationApplySnapshot(head, branch);
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
}
