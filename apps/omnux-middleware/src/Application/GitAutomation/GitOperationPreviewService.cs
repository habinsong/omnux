using System.Security.Cryptography;
using System.Text;

namespace Omnux.Middleware;

internal sealed class GitOperationPreviewService
{
    private const int GitTimeoutSeconds = 10;
    private const int MaxPathCount = 200;
    private const int MaxCommitMessageLength = 300;
    private const int MaxBranchNameLength = 120;

    private readonly string _repositoryRoot;
    private readonly FileGitOperationPreviewStore _previewStore;
    private readonly Func<DateTimeOffset> _utcNow;
    private readonly string _githubCliExecutable;

    public GitOperationPreviewService(
        string repositoryRoot,
        FileGitOperationPreviewStore previewStore,
        Func<DateTimeOffset>? utcNow = null,
        string? githubCliExecutable = null
    )
    {
        _repositoryRoot = Path.GetFullPath(string.IsNullOrWhiteSpace(repositoryRoot) ? "." : repositoryRoot);
        _previewStore = previewStore;
        _utcNow = utcNow ?? (() => DateTimeOffset.UtcNow);
        _githubCliExecutable = string.IsNullOrWhiteSpace(githubCliExecutable) ? "gh" : githubCliExecutable;
    }

    public async Task<GitOperationPreviewResult> PreviewAsync(
        GitOperationPreviewRequest request,
        CancellationToken cancellationToken
    )
    {
        var operation = NormalizeOperation(request.Operation);
        var checks = new List<GitOperationCheck>();
        var blockers = new List<string>();
        var warnings = new List<string>();

        if (!GitOperationNames.IsAllowed(operation))
        {
            AddBlocked(checks, blockers, "unsupported_operation", "지원하지 않는 Git operation입니다.");
            return BuildBlockedPreview(operation, checks, blockers, warnings);
        }

        var repository = await ReadRepositoryStateAsync(cancellationToken).ConfigureAwait(false);
        checks.Add(repository.IsRepository
            ? new GitOperationCheck("repository", "passed", "Git repository 확인 완료")
            : new GitOperationCheck("repository", "blocked", "Git repository가 아닙니다."));
        if (!repository.IsRepository)
        {
            blockers.Add("not_git_repository");
            return BuildBlockedPreview(operation, checks, blockers, warnings);
        }

        var statusFiles = await ReadStatusAsync(cancellationToken).ConfigureAwait(false);
        var normalizedRequest = NormalizeRequest(operation, request, statusFiles, checks, blockers);
        if (operation == GitOperationNames.CreateBranch)
        {
            await ValidateCreateBranchAsync(
                normalizedRequest,
                statusFiles,
                checks,
                blockers,
                warnings,
                cancellationToken
            ).ConfigureAwait(false);
        }
        else if (operation == GitOperationNames.PushCurrentBranch)
        {
            normalizedRequest = await ValidatePushCurrentBranchAsync(
                normalizedRequest,
                repository,
                statusFiles,
                checks,
                blockers,
                warnings,
                cancellationToken
            ).ConfigureAwait(false);
        }
        else if (operation == GitOperationNames.OpenPullRequest)
        {
            normalizedRequest = await ValidateOpenPullRequestAsync(
                normalizedRequest,
                repository,
                statusFiles,
                checks,
                blockers,
                warnings,
                cancellationToken
            ).ConfigureAwait(false);
        }
        else
        {
            ValidateCommitOperation(normalizedRequest, statusFiles, checks, blockers);
        }

        var affectedFiles = SelectAffectedFiles(operation, normalizedRequest.Paths, statusFiles);
        var plannedCommands = blockers.Count == 0
            ? BuildPlannedCommands(normalizedRequest)
            : Array.Empty<GitOperationPlannedCommand>();

        if (blockers.Count > 0)
        {
            return BuildBlockedPreview(operation, checks, blockers, warnings, affectedFiles);
        }

        var previewId = Guid.NewGuid().ToString("N");
        var confirmationToken = GenerateConfirmationToken();
        var expiresAtUtc = _previewStore.BuildExpiry();
        var approval = new GitOperationApprovalPayload(
            previewId,
            operation,
            confirmationToken,
            _repositoryRoot,
            repository.HeadHash,
            repository.BranchName,
            normalizedRequest.BranchName,
            normalizedRequest.CommitMessage,
            normalizedRequest.Paths,
            normalizedRequest.RemoteName,
            normalizedRequest.RemoteBranchName,
            normalizedRequest.SetUpstream,
            normalizedRequest.PullRequestTitle,
            normalizedRequest.PullRequestBody,
            normalizedRequest.BaseBranchName,
            normalizedRequest.Draft
        );
        var record = new GitOperationPreviewRecord(
            previewId,
            operation,
            _repositoryRoot,
            repository.HeadHash,
            repository.BranchName,
            HashString(confirmationToken),
            HashString(GitOperationJson.Serialize(approval)),
            _utcNow(),
            expiresAtUtc,
            normalizedRequest,
            affectedFiles,
            plannedCommands
        );
        _previewStore.Save(record);

        checks.Add(new GitOperationCheck("approval_required", "warning", "apply 실행에는 confirmationToken 또는 동일 approval payload가 필요합니다."));
        return new GitOperationPreviewResult(
            true,
            "ready",
            previewId,
            operation,
            true,
            expiresAtUtc,
            checks,
            plannedCommands,
            affectedFiles,
            blockers,
            warnings,
            approval
        );
    }

    public async Task<GitOperationApplyResult> ApplyAsync(
        GitOperationApplyRequest request,
        GitOperationExecutor executor,
        CancellationToken cancellationToken
    )
    {
        var previewId = (request.PreviewId ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(previewId))
        {
            return BuildApplyFailure(string.Empty, string.Empty, "previewId is required", "missing_preview_id");
        }

        var record = _previewStore.TryLoad(previewId);
        if (record == null)
        {
            return BuildApplyFailure(previewId, string.Empty, "preview가 없거나 만료되었습니다.", "preview_not_found_or_expired");
        }

        if (!IsApprovalValid(request, record))
        {
            return BuildApplyFailure(previewId, record.Operation, "승인 payload가 preview와 일치하지 않습니다.", "approval_mismatch");
        }

        var revalidation = await RevalidateAsync(record, cancellationToken).ConfigureAwait(false);
        if (revalidation.Count > 0)
        {
            return new GitOperationApplyResult(
                false,
                "blocked",
                previewId,
                record.Operation,
                "preview 이후 Git 상태가 변경되어 실행을 차단했습니다.",
                revalidation,
                Array.Empty<GitOperationExecutedCommand>(),
                revalidation.Where(check => check.Status == "blocked").Select(check => check.Code).ToArray(),
                await ReadApplySnapshotAsync(cancellationToken).ConfigureAwait(false)
            );
        }

        var result = await executor.ExecuteAsync(record, cancellationToken).ConfigureAwait(false);
        if (result.Ok)
        {
            _previewStore.Delete(previewId);
        }

        return result;
    }

    private GitOperationPreviewRequest NormalizeRequest(
        string operation,
        GitOperationPreviewRequest request,
        IReadOnlyList<GitOperationAffectedFile> statusFiles,
        List<GitOperationCheck> checks,
        List<string> blockers
    )
    {
        var branchName = (request.BranchName ?? string.Empty).Trim();
        var commitMessage = NormalizeCommitMessage(request.CommitMessage);
        var remoteName = (request.RemoteName ?? string.Empty).Trim();
        var remoteBranchName = (request.RemoteBranchName ?? string.Empty).Trim();
        var pullRequestTitle = NormalizeSingleLine(request.PullRequestTitle);
        var pullRequestBody = NormalizeMultiline(request.PullRequestBody);
        var baseBranchName = (request.BaseBranchName ?? string.Empty).Trim();
        var paths = new List<string>();
        var seen = new HashSet<string>(StringComparer.Ordinal);
        if (operation is GitOperationNames.StageAndCommit or GitOperationNames.SnapshotCommit)
        {
            foreach (var rawPath in request.Paths ?? Array.Empty<string>())
            {
                if (!TryNormalizeRepositoryPath(rawPath, out var normalizedPath, out var pathError))
                {
                    AddBlocked(checks, blockers, pathError, $"허용되지 않는 경로입니다: {rawPath}");
                    continue;
                }

                if (seen.Add(normalizedPath))
                {
                    paths.Add(normalizedPath);
                }
            }
        }

        if (operation == GitOperationNames.SnapshotCommit && paths.Count == 0)
        {
            foreach (var file in statusFiles)
            {
                if (file.Category != "conflicted" && seen.Add(file.Path))
                {
                    paths.Add(file.Path);
                }
            }
        }

        if (paths.Count > MaxPathCount)
        {
            AddBlocked(checks, blockers, "too_many_paths", $"한 번에 처리 가능한 파일은 최대 {MaxPathCount}개입니다.");
        }

        return new GitOperationPreviewRequest(
            operation,
            branchName,
            commitMessage,
            paths,
            remoteName,
            remoteBranchName,
            request.SetUpstream,
            pullRequestTitle,
            pullRequestBody,
            baseBranchName,
            request.Draft
        );
    }

    private async Task ValidateCreateBranchAsync(
        GitOperationPreviewRequest request,
        IReadOnlyList<GitOperationAffectedFile> statusFiles,
        List<GitOperationCheck> checks,
        List<string> blockers,
        List<string> warnings,
        CancellationToken cancellationToken
    )
    {
        if (string.IsNullOrWhiteSpace(request.BranchName))
        {
            AddBlocked(checks, blockers, "branch_name_required", "브랜치 이름이 필요합니다.");
            return;
        }

        var suggestedBranchName = BuildSuggestedBranchName(statusFiles);
        if (!request.BranchName.StartsWith("codex/", StringComparison.Ordinal)
            && !string.Equals(request.BranchName, suggestedBranchName, StringComparison.Ordinal))
        {
            AddBlocked(checks, blockers, "branch_prefix_required", "브랜치는 codex/ prefix 또는 snapshot 추천 브랜치만 허용됩니다.");
        }

        if (!IsSafeBranchNameShape(request.BranchName))
        {
            AddBlocked(checks, blockers, "invalid_branch_name", "브랜치 이름 형식이 안전하지 않습니다.");
        }
        else
        {
            var checkRef = await RunGitAsync(
                new[] { "check-ref-format", "--branch", request.BranchName },
                cancellationToken
            ).ConfigureAwait(false);
            if (checkRef.ExitCode != 0)
            {
                AddBlocked(checks, blockers, "invalid_branch_name", "git check-ref-format 검증에 실패했습니다.");
            }
        }

        var existing = await RunGitAsync(
            new[] { "show-ref", "--verify", "--quiet", $"refs/heads/{request.BranchName}" },
            cancellationToken
        ).ConfigureAwait(false);
        if (existing.ExitCode == 0)
        {
            AddBlocked(checks, blockers, "branch_already_exists", "이미 존재하는 브랜치입니다.");
        }
        else
        {
            checks.Add(new GitOperationCheck("branch_collision", "passed", "동일한 로컬 브랜치가 없습니다."));
        }

        if (statusFiles.Count > 0)
        {
            warnings.Add("dirty_worktree");
            checks.Add(new GitOperationCheck("dirty_worktree", "warning", "변경 중인 파일이 있는 상태에서 브랜치를 생성합니다."));
        }
    }

    private async Task<GitOperationPreviewRequest> ValidatePushCurrentBranchAsync(
        GitOperationPreviewRequest request,
        RepositoryState repository,
        IReadOnlyList<GitOperationAffectedFile> statusFiles,
        List<GitOperationCheck> checks,
        List<string> blockers,
        List<string> warnings,
        CancellationToken cancellationToken
    )
    {
        if (repository.BranchName == "HEAD" || string.IsNullOrWhiteSpace(repository.BranchName))
        {
            AddBlocked(checks, blockers, "detached_head", "detached HEAD 상태에서는 push할 수 없습니다.");
            return request;
        }

        if (IsProtectedBranch(repository.BranchName))
        {
            AddBlocked(checks, blockers, "protected_branch_push", "보호 브랜치 push는 2차 게이트에서 허용하지 않습니다.");
        }
        else
        {
            checks.Add(new GitOperationCheck("protected_branch", "passed", "보호 브랜치가 아닙니다."));
        }

        var remotes = await ReadRemoteNamesAsync(cancellationToken).ConfigureAwait(false);
        if (remotes.Count == 0)
        {
            AddBlocked(checks, blockers, "no_remote", "설정된 git remote가 없습니다.");
            return request;
        }

        var upstream = await ReadUpstreamAsync(remotes, cancellationToken).ConfigureAwait(false);
        var remoteName = ResolvePushRemoteName(request.RemoteName, upstream, remotes, checks, blockers);
        var remoteBranchName = ResolvePushRemoteBranchName(request.RemoteBranchName, upstream, repository.BranchName);
        if (string.IsNullOrWhiteSpace(remoteName))
        {
            return request;
        }

        if (!remotes.Contains(remoteName, StringComparer.Ordinal))
        {
            AddBlocked(checks, blockers, "unknown_remote", "요청한 remote가 현재 저장소에 없습니다.");
        }
        else
        {
            checks.Add(new GitOperationCheck("remote", "passed", $"remote '{remoteName}' 확인 완료"));
        }

        if (!IsSafeRemoteName(remoteName))
        {
            AddBlocked(checks, blockers, "invalid_remote_name", "remote 이름 형식이 안전하지 않습니다.");
        }

        if (!IsSafeBranchNameShape(remoteBranchName))
        {
            AddBlocked(checks, blockers, "invalid_remote_branch_name", "remote branch 이름 형식이 안전하지 않습니다.");
        }
        else
        {
            var checkRef = await RunGitAsync(
                new[] { "check-ref-format", "--branch", remoteBranchName },
                cancellationToken
            ).ConfigureAwait(false);
            if (checkRef.ExitCode != 0)
            {
                AddBlocked(checks, blockers, "invalid_remote_branch_name", "remote branch git ref 검증에 실패했습니다.");
            }
        }

        if (!upstream.HasUpstream && !repository.BranchName.StartsWith("codex/", StringComparison.Ordinal))
        {
            AddBlocked(checks, blockers, "initial_push_requires_codex_branch", "upstream 없는 최초 push는 codex/ 브랜치만 허용합니다.");
        }

        if (upstream.HasUpstream)
        {
            if (!string.Equals(remoteName, upstream.RemoteName, StringComparison.Ordinal)
                || !string.Equals(remoteBranchName, upstream.BranchName, StringComparison.Ordinal))
            {
                AddBlocked(checks, blockers, "push_target_mismatch", "기존 upstream과 다른 push target은 허용하지 않습니다.");
            }

            if (upstream.BehindCount > 0)
            {
                AddBlocked(checks, blockers, "branch_behind_remote", "현재 브랜치가 upstream보다 뒤처져 있습니다.");
            }
            else
            {
                checks.Add(new GitOperationCheck("upstream_behind", "passed", "upstream보다 뒤처지지 않았습니다."));
            }

            if (upstream.AheadCount <= 0)
            {
                AddBlocked(checks, blockers, "nothing_to_push", "upstream에 push할 새 커밋이 없습니다.");
            }
        }
        else
        {
            checks.Add(new GitOperationCheck("initial_push", "warning", "upstream 없는 최초 push로 remote tracking을 설정합니다."));
            warnings.Add("initial_push_sets_upstream");
        }

        if (statusFiles.Count > 0)
        {
            warnings.Add("dirty_worktree");
            checks.Add(new GitOperationCheck("dirty_worktree", "warning", "커밋되지 않은 변경이 있지만 push 대상은 현재 HEAD입니다."));
        }

        return request with
        {
            RemoteName = remoteName,
            RemoteBranchName = remoteBranchName,
            SetUpstream = !upstream.HasUpstream
        };
    }

    private async Task<GitOperationPreviewRequest> ValidateOpenPullRequestAsync(
        GitOperationPreviewRequest request,
        RepositoryState repository,
        IReadOnlyList<GitOperationAffectedFile> statusFiles,
        List<GitOperationCheck> checks,
        List<string> blockers,
        List<string> warnings,
        CancellationToken cancellationToken
    )
    {
        if (repository.BranchName == "HEAD" || string.IsNullOrWhiteSpace(repository.BranchName))
        {
            AddBlocked(checks, blockers, "detached_head", "detached HEAD 상태에서는 PR을 만들 수 없습니다.");
            return request;
        }

        if (IsProtectedBranch(repository.BranchName))
        {
            AddBlocked(checks, blockers, "protected_branch_pull_request", "보호 브랜치에서는 PR 생성 operation을 허용하지 않습니다.");
        }
        else
        {
            checks.Add(new GitOperationCheck("protected_branch", "passed", "보호 브랜치가 아닙니다."));
        }

        if (string.IsNullOrWhiteSpace(request.PullRequestTitle))
        {
            AddBlocked(checks, blockers, "pull_request_title_required", "PR 제목이 필요합니다.");
        }
        else
        {
            checks.Add(new GitOperationCheck("pull_request_title", "passed", "PR 제목 확인 완료"));
        }

        var remotes = await ReadRemoteNamesAsync(cancellationToken).ConfigureAwait(false);
        if (remotes.Count == 0)
        {
            AddBlocked(checks, blockers, "no_remote", "설정된 git remote가 없습니다.");
            return request;
        }

        var upstream = await ReadUpstreamAsync(remotes, cancellationToken).ConfigureAwait(false);
        if (!upstream.HasUpstream)
        {
            AddBlocked(checks, blockers, "branch_not_pushed", "PR 생성 전에 현재 브랜치를 remote에 push해야 합니다.");
            return request;
        }

        if (upstream.BehindCount > 0)
        {
            AddBlocked(checks, blockers, "branch_behind_remote", "현재 브랜치가 upstream보다 뒤처져 있습니다.");
        }

        if (upstream.AheadCount > 0)
        {
            AddBlocked(checks, blockers, "branch_has_unpushed_commits", "PR 생성 전에 push하지 않은 커밋이 있습니다.");
        }

        if (upstream.BehindCount == 0 && upstream.AheadCount == 0)
        {
            checks.Add(new GitOperationCheck("upstream_synced", "passed", "현재 브랜치와 upstream이 동기화되어 있습니다."));
        }

        var baseBranchName = ResolvePullRequestBaseBranch(request.BaseBranchName);
        if (string.IsNullOrWhiteSpace(baseBranchName))
        {
            AddBlocked(checks, blockers, "base_branch_required", "PR base branch가 필요합니다.");
        }
        else if (!IsSafeBranchNameShape(baseBranchName))
        {
            AddBlocked(checks, blockers, "invalid_base_branch_name", "base branch 이름 형식이 안전하지 않습니다.");
        }
        else
        {
            checks.Add(new GitOperationCheck("base_branch", "passed", $"base branch '{baseBranchName}' 확인 완료"));
        }

        await ValidateGitHubCliAsync(checks, blockers, cancellationToken).ConfigureAwait(false);

        if (statusFiles.Count > 0)
        {
            warnings.Add("dirty_worktree");
            checks.Add(new GitOperationCheck("dirty_worktree", "warning", "커밋되지 않은 변경은 PR 대상에 포함되지 않습니다."));
        }

        return request with
        {
            RemoteName = upstream.RemoteName,
            RemoteBranchName = upstream.BranchName,
            BaseBranchName = baseBranchName
        };
    }

    private static void ValidateCommitOperation(
        GitOperationPreviewRequest request,
        IReadOnlyList<GitOperationAffectedFile> statusFiles,
        List<GitOperationCheck> checks,
        List<string> blockers
    )
    {
        if (string.IsNullOrWhiteSpace(request.CommitMessage))
        {
            AddBlocked(checks, blockers, "commit_message_required", "커밋 메시지가 필요합니다.");
        }
        else if (request.CommitMessage.Length > MaxCommitMessageLength)
        {
            AddBlocked(checks, blockers, "commit_message_too_long", $"커밋 메시지는 {MaxCommitMessageLength}자 이하여야 합니다.");
        }
        else
        {
            checks.Add(new GitOperationCheck("commit_message", "passed", "커밋 메시지 확인 완료"));
        }

        if (statusFiles.Count == 0)
        {
            AddBlocked(checks, blockers, "no_changes", "커밋할 변경 파일이 없습니다.");
            return;
        }

        if (request.Paths.Count == 0)
        {
            AddBlocked(checks, blockers, "paths_required", "커밋 대상 파일 경로가 필요합니다.");
            return;
        }

        var statusByPath = statusFiles.ToDictionary(file => file.Path, StringComparer.Ordinal);
        foreach (var path in request.Paths)
        {
            if (!statusByPath.TryGetValue(path, out var file))
            {
                AddBlocked(checks, blockers, "path_not_changed", $"변경 목록에 없는 경로입니다: {path}");
                continue;
            }

            if (file.Category == "conflicted")
            {
                AddBlocked(checks, blockers, "merge_conflicts_present", $"충돌 파일은 커밋할 수 없습니다: {path}");
            }
        }

        if (!blockers.Contains("merge_conflicts_present", StringComparer.Ordinal))
        {
            checks.Add(new GitOperationCheck("merge_conflicts", "passed", "선택 파일에 충돌이 없습니다."));
        }
    }

    private async Task<IReadOnlyList<GitOperationCheck>> RevalidateAsync(
        GitOperationPreviewRecord record,
        CancellationToken cancellationToken
    )
    {
        var checks = new List<GitOperationCheck>();
        var repository = await ReadRepositoryStateAsync(cancellationToken).ConfigureAwait(false);
        if (!repository.IsRepository)
        {
            checks.Add(new GitOperationCheck("not_git_repository", "blocked", "Git repository가 아닙니다."));
            return checks;
        }

        if (!string.Equals(repository.HeadHash, record.HeadHash, StringComparison.Ordinal))
        {
            checks.Add(new GitOperationCheck("head_changed", "blocked", "preview 이후 HEAD가 변경되었습니다."));
        }
        else
        {
            checks.Add(new GitOperationCheck("head_unchanged", "passed", "HEAD가 preview 시점과 같습니다."));
        }

        if (!string.Equals(repository.BranchName, record.BranchName, StringComparison.Ordinal))
        {
            checks.Add(new GitOperationCheck("branch_changed", "blocked", "preview 이후 브랜치가 변경되었습니다."));
        }
        else
        {
            checks.Add(new GitOperationCheck("branch_unchanged", "passed", "브랜치가 preview 시점과 같습니다."));
        }

        if (record.Request.Paths.Count > 0)
        {
            var currentStatus = await ReadStatusAsync(cancellationToken).ConfigureAwait(false);
            var currentByPath = currentStatus.ToDictionary(file => file.Path, StringComparer.Ordinal);
            var selectedByPath = record.AffectedFiles.ToDictionary(file => file.Path, StringComparer.Ordinal);
            foreach (var path in record.Request.Paths)
            {
                if (!selectedByPath.TryGetValue(path, out var previous)
                    || !currentByPath.TryGetValue(path, out var current)
                    || !IsSameStatus(previous, current))
                {
                    checks.Add(new GitOperationCheck("file_status_changed", "blocked", $"preview 이후 파일 상태가 변경되었습니다: {path}"));
                }
            }
        }

        return checks.Where(check => check.Status == "blocked").ToArray();
    }

    private bool IsApprovalValid(GitOperationApplyRequest request, GitOperationPreviewRecord record)
    {
        var token = (request.ConfirmationToken ?? string.Empty).Trim();
        if (!string.IsNullOrWhiteSpace(token)
            && FixedTimeEquals(HashString(token), record.ConfirmationTokenHash))
        {
            return true;
        }

        var approvalPayloadJson = (request.ApprovalPayloadJson ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(approvalPayloadJson))
        {
            return false;
        }

        try
        {
            var payload = GitOperationJson.DeserializeApprovalPayload(approvalPayloadJson);
            if (payload == null || !string.Equals(payload.PreviewId, record.PreviewId, StringComparison.Ordinal))
            {
                return false;
            }

            return FixedTimeEquals(
                HashString(GitOperationJson.Serialize(payload)),
                record.ApprovalPayloadHash
            );
        }
        catch
        {
            return false;
        }
    }

    private async Task<GitOperationApplySnapshot?> ReadApplySnapshotAsync(CancellationToken cancellationToken)
    {
        var repository = await ReadRepositoryStateAsync(cancellationToken).ConfigureAwait(false);
        return repository.IsRepository
            ? new GitOperationApplySnapshot(repository.HeadHash, repository.BranchName)
            : null;
    }

    private static GitOperationPreviewResult BuildBlockedPreview(
        string operation,
        IReadOnlyList<GitOperationCheck> checks,
        IReadOnlyList<string> blockers,
        IReadOnlyList<string> warnings,
        IReadOnlyList<GitOperationAffectedFile>? affectedFiles = null
    )
    {
        return new GitOperationPreviewResult(
            false,
            "blocked",
            string.Empty,
            operation,
            true,
            null,
            checks,
            Array.Empty<GitOperationPlannedCommand>(),
            affectedFiles ?? Array.Empty<GitOperationAffectedFile>(),
            blockers,
            warnings,
            null
        );
    }

    private static GitOperationApplyResult BuildApplyFailure(
        string previewId,
        string operation,
        string message,
        string blocker
    )
    {
        return new GitOperationApplyResult(
            false,
            "blocked",
            previewId,
            operation,
            message,
            new[] { new GitOperationCheck(blocker, "blocked", message) },
            Array.Empty<GitOperationExecutedCommand>(),
            new[] { blocker },
            null
        );
    }

    private IReadOnlyList<GitOperationAffectedFile> SelectAffectedFiles(
        string operation,
        IReadOnlyList<string> paths,
        IReadOnlyList<GitOperationAffectedFile> statusFiles
    )
    {
        if (operation == GitOperationNames.CreateBranch)
        {
            return statusFiles;
        }

        if (operation == GitOperationNames.PushCurrentBranch)
        {
            return statusFiles;
        }

        if (operation == GitOperationNames.OpenPullRequest)
        {
            return statusFiles;
        }

        var selected = new HashSet<string>(paths, StringComparer.Ordinal);
        return statusFiles.Where(file => selected.Contains(file.Path)).ToArray();
    }

    private static IReadOnlyList<GitOperationPlannedCommand> BuildPlannedCommands(GitOperationPreviewRequest request)
    {
        if (request.Operation == GitOperationNames.CreateBranch)
        {
            var args = new[] { "checkout", "-b", request.BranchName };
            return new[] { new GitOperationPlannedCommand("git", args, BuildDisplay(args)) };
        }

        if (request.Operation == GitOperationNames.PushCurrentBranch)
        {
            var args = BuildPushArguments(request);
            return new[] { new GitOperationPlannedCommand("git", args, BuildDisplay(args)) };
        }

        if (request.Operation == GitOperationNames.OpenPullRequest)
        {
            var args = BuildPullRequestArguments(request);
            return new[] { new GitOperationPlannedCommand("gh", args, BuildDisplay("gh", args)) };
        }

        var addArgs = new List<string> { "add", "--" };
        addArgs.AddRange(request.Paths);
        var commitArgs = new[] { "commit", "-m", request.CommitMessage };
        return new[]
        {
            new GitOperationPlannedCommand("git", addArgs, BuildDisplay(addArgs)),
            new GitOperationPlannedCommand("git", commitArgs, BuildDisplay(commitArgs))
        };
    }

    private static IReadOnlyList<string> BuildPushArguments(GitOperationPreviewRequest request)
    {
        var args = new List<string> { "push" };
        if (request.SetUpstream)
        {
            args.Add("-u");
        }

        args.Add(request.RemoteName);
        args.Add($"HEAD:{request.RemoteBranchName}");
        return args;
    }

    private static IReadOnlyList<string> BuildPullRequestArguments(GitOperationPreviewRequest request)
    {
        var args = new List<string>
        {
            "pr",
            "create",
            "--base",
            request.BaseBranchName,
            "--head",
            request.RemoteBranchName,
            "--title",
            request.PullRequestTitle,
            "--body",
            request.PullRequestBody
        };

        if (request.Draft)
        {
            args.Add("--draft");
        }

        return args;
    }

    private async Task<RepositoryState> ReadRepositoryStateAsync(CancellationToken cancellationToken)
    {
        var repoCheck = await RunGitAsync(new[] { "rev-parse", "--is-inside-work-tree" }, cancellationToken)
            .ConfigureAwait(false);
        if (repoCheck.ExitCode != 0 || !repoCheck.StdOut.Trim().Equals("true", StringComparison.OrdinalIgnoreCase))
        {
            return new RepositoryState(false, string.Empty, string.Empty);
        }

        var branch = await ReadGitLineAsync(new[] { "rev-parse", "--abbrev-ref", "HEAD" }, cancellationToken)
            .ConfigureAwait(false);
        var head = await ReadGitLineAsync(new[] { "rev-parse", "HEAD" }, cancellationToken)
            .ConfigureAwait(false);
        return new RepositoryState(true, branch, head);
    }

    private async Task<IReadOnlyList<string>> ReadRemoteNamesAsync(CancellationToken cancellationToken)
    {
        var result = await RunGitAsync(new[] { "remote" }, cancellationToken).ConfigureAwait(false);
        if (result.ExitCode != 0)
        {
            return Array.Empty<string>();
        }

        return result.StdOut
            .Replace("\r\n", "\n", StringComparison.Ordinal)
            .Replace('\r', '\n')
            .Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(remote => !string.IsNullOrWhiteSpace(remote))
            .Distinct(StringComparer.Ordinal)
            .ToArray();
    }

    private async Task<UpstreamState> ReadUpstreamAsync(
        IReadOnlyList<string> remotes,
        CancellationToken cancellationToken
    )
    {
        var upstreamName = await ReadGitLineAsync(
            new[] { "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}" },
            cancellationToken
        ).ConfigureAwait(false);
        if (string.IsNullOrWhiteSpace(upstreamName))
        {
            return UpstreamState.Empty;
        }

        var remoteName = string.Empty;
        var branchName = string.Empty;
        foreach (var remote in remotes.OrderByDescending(remote => remote.Length))
        {
            var prefix = remote + "/";
            if (upstreamName.StartsWith(prefix, StringComparison.Ordinal))
            {
                remoteName = remote;
                branchName = upstreamName[prefix.Length..];
                break;
            }
        }

        if (string.IsNullOrWhiteSpace(remoteName) || string.IsNullOrWhiteSpace(branchName))
        {
            return UpstreamState.Empty;
        }

        var counts = await ReadGitLineAsync(new[] { "rev-list", "--left-right", "--count", "@{upstream}...HEAD" }, cancellationToken)
            .ConfigureAwait(false);
        var parts = counts.Split(new[] { ' ', '\t' }, StringSplitOptions.RemoveEmptyEntries);
        var behind = parts.Length > 0 && int.TryParse(parts[0], out var parsedBehind) ? parsedBehind : 0;
        var ahead = parts.Length > 1 && int.TryParse(parts[1], out var parsedAhead) ? parsedAhead : 0;
        return new UpstreamState(true, remoteName, branchName, behind, ahead);
    }

    private static string ResolvePushRemoteName(
        string requestedRemoteName,
        UpstreamState upstream,
        IReadOnlyList<string> remotes,
        List<GitOperationCheck> checks,
        List<string> blockers
    )
    {
        if (!string.IsNullOrWhiteSpace(requestedRemoteName))
        {
            return requestedRemoteName.Trim();
        }

        if (upstream.HasUpstream)
        {
            return upstream.RemoteName;
        }

        if (remotes.Contains("origin", StringComparer.Ordinal))
        {
            return "origin";
        }

        if (remotes.Count == 1)
        {
            return remotes[0];
        }

        AddBlocked(checks, blockers, "ambiguous_remote", "remote가 여러 개라 push target을 추론할 수 없습니다.");
        return string.Empty;
    }

    private static string ResolvePushRemoteBranchName(
        string requestedRemoteBranchName,
        UpstreamState upstream,
        string currentBranchName
    )
    {
        if (!string.IsNullOrWhiteSpace(requestedRemoteBranchName))
        {
            return requestedRemoteBranchName.Trim();
        }

        return upstream.HasUpstream ? upstream.BranchName : currentBranchName;
    }

    private static string ResolvePullRequestBaseBranch(string requestedBaseBranchName)
    {
        return string.IsNullOrWhiteSpace(requestedBaseBranchName)
            ? string.Empty
            : requestedBaseBranchName.Trim();
    }

    private async Task ValidateGitHubCliAsync(
        List<GitOperationCheck> checks,
        List<string> blockers,
        CancellationToken cancellationToken
    )
    {
        var version = await RunGhAsync(new[] { "--version" }, cancellationToken).ConfigureAwait(false);
        if (version.ExitCode != 0)
        {
            AddBlocked(checks, blockers, "missing_github_cli", "GitHub CLI(gh)를 실행할 수 없습니다.");
            return;
        }

        checks.Add(new GitOperationCheck("github_cli", "passed", "gh --version 확인 완료"));

        var auth = await RunGhAsync(new[] { "auth", "status" }, cancellationToken).ConfigureAwait(false);
        if (auth.ExitCode != 0)
        {
            AddBlocked(checks, blockers, "github_auth_unavailable", "gh auth status가 실패했습니다.");
            return;
        }

        checks.Add(new GitOperationCheck("github_auth", "passed", "gh auth status 확인 완료"));
    }

    private async Task<IReadOnlyList<GitOperationAffectedFile>> ReadStatusAsync(CancellationToken cancellationToken)
    {
        var status = await RunGitAsync(new[] { "status", "--porcelain=v1", "-uall" }, cancellationToken)
            .ConfigureAwait(false);
        if (status.ExitCode != 0)
        {
            return Array.Empty<GitOperationAffectedFile>();
        }

        return ParseStatus(status.StdOut);
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

    private Task<GitAutomationProcessResult> RunGhAsync(
        IReadOnlyList<string> arguments,
        CancellationToken cancellationToken
    )
    {
        return GitAutomationProcessRunner.RunAsync(
            _repositoryRoot,
            _githubCliExecutable,
            arguments,
            GitTimeoutSeconds,
            cancellationToken
        );
    }

    private bool TryNormalizeRepositoryPath(string rawPath, out string normalizedPath, out string errorCode)
    {
        normalizedPath = string.Empty;
        errorCode = "invalid_path";
        var path = (rawPath ?? string.Empty).Trim().Replace('\\', '/');
        if (string.IsNullOrWhiteSpace(path))
        {
            errorCode = "empty_path";
            return false;
        }

        if (Path.IsPathRooted(path) || path.StartsWith("/", StringComparison.Ordinal))
        {
            errorCode = "path_outside_repository";
            return false;
        }

        var segments = new List<string>();
        foreach (var segment in path.Split('/', StringSplitOptions.RemoveEmptyEntries))
        {
            if (segment == ".")
            {
                continue;
            }

            if (segment == "..")
            {
                errorCode = "path_traversal";
                return false;
            }

            if (segment.Equals(".git", StringComparison.OrdinalIgnoreCase))
            {
                errorCode = "git_metadata_path";
                return false;
            }

            segments.Add(segment);
        }

        if (segments.Count == 0)
        {
            errorCode = "empty_path";
            return false;
        }

        normalizedPath = string.Join('/', segments);
        var fullPath = Path.GetFullPath(Path.Combine(_repositoryRoot, normalizedPath));
        if (!IsInsideDirectory(_repositoryRoot, fullPath))
        {
            errorCode = "path_outside_repository";
            normalizedPath = string.Empty;
            return false;
        }

        return true;
    }

    private static IReadOnlyList<GitOperationAffectedFile> ParseStatus(string stdout)
    {
        var files = new List<GitOperationAffectedFile>();
        foreach (var rawLine in (stdout ?? string.Empty)
                     .Replace("\r\n", "\n", StringComparison.Ordinal)
                     .Replace('\r', '\n')
                     .Split('\n', StringSplitOptions.RemoveEmptyEntries))
        {
            if (rawLine.Length < 3)
            {
                continue;
            }

            var indexStatus = rawLine[0].ToString();
            var worktreeStatus = rawLine[1].ToString();
            var path = NormalizeStatusPath(rawLine[3..]);
            var category = ClassifyStatus(rawLine[0], rawLine[1]);
            var untracked = rawLine.StartsWith("?? ", StringComparison.Ordinal);
            var staged = !untracked && rawLine[0] != ' ';
            var unstaged = !untracked && rawLine[1] != ' ';
            files.Add(new GitOperationAffectedFile(
                path,
                indexStatus,
                worktreeStatus,
                category,
                staged,
                unstaged,
                untracked
            ));
        }

        return files;
    }

    private static string NormalizeStatusPath(string rawPath)
    {
        var path = (rawPath ?? string.Empty).Trim();
        var renameArrow = path.LastIndexOf(" -> ", StringComparison.Ordinal);
        if (renameArrow >= 0)
        {
            path = path[(renameArrow + 4)..].Trim();
        }

        return path.Trim('"');
    }

    private static string ClassifyStatus(char indexStatus, char worktreeStatus)
    {
        if ((indexStatus == '?' && worktreeStatus == '?'))
        {
            return "untracked";
        }

        if (indexStatus == 'U'
            || worktreeStatus == 'U'
            || (indexStatus == 'A' && worktreeStatus == 'A')
            || (indexStatus == 'D' && worktreeStatus == 'D'))
        {
            return "conflicted";
        }

        if (indexStatus == 'R' || worktreeStatus == 'R')
        {
            return "renamed";
        }

        if (indexStatus == 'C' || worktreeStatus == 'C')
        {
            return "copied";
        }

        if (indexStatus == 'A' || worktreeStatus == 'A')
        {
            return "added";
        }

        if (indexStatus == 'D' || worktreeStatus == 'D')
        {
            return "deleted";
        }

        if (indexStatus == 'M' || worktreeStatus == 'M')
        {
            return "modified";
        }

        return "changed";
    }

    private static string NormalizeOperation(string operation)
    {
        return (operation ?? string.Empty).Trim().ToLowerInvariant();
    }

    private static string NormalizeCommitMessage(string message)
    {
        return (message ?? string.Empty)
            .Replace("\r\n", "\n", StringComparison.Ordinal)
            .Replace('\r', '\n')
            .Trim();
    }

    private static string NormalizeSingleLine(string value)
    {
        return (value ?? string.Empty)
            .Replace("\r\n", "\n", StringComparison.Ordinal)
            .Replace('\r', '\n')
            .Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .FirstOrDefault() ?? string.Empty;
    }

    private static string NormalizeMultiline(string value)
    {
        return (value ?? string.Empty)
            .Replace("\r\n", "\n", StringComparison.Ordinal)
            .Replace('\r', '\n')
            .Trim();
    }

    private static bool IsSafeBranchNameShape(string branchName)
    {
        if (string.IsNullOrWhiteSpace(branchName) || branchName.Length > MaxBranchNameLength)
        {
            return false;
        }

        if (branchName.StartsWith("-", StringComparison.Ordinal)
            || branchName.EndsWith("/", StringComparison.Ordinal)
            || branchName.EndsWith(".lock", StringComparison.Ordinal)
            || branchName.Contains("..", StringComparison.Ordinal)
            || branchName.Contains("//", StringComparison.Ordinal))
        {
            return false;
        }

        return branchName.All(ch => !char.IsControl(ch) && !char.IsWhiteSpace(ch));
    }

    private static bool IsSafeRemoteName(string remoteName)
    {
        if (string.IsNullOrWhiteSpace(remoteName)
            || remoteName.StartsWith("-", StringComparison.Ordinal)
            || remoteName.Contains("..", StringComparison.Ordinal))
        {
            return false;
        }

        return remoteName.All(ch => !char.IsControl(ch) && !char.IsWhiteSpace(ch) && ch != ':');
    }

    private static bool IsProtectedBranch(string branchName)
    {
        if (branchName is "main" or "master" or "develop" or "dev" or "trunk")
        {
            return true;
        }

        return branchName.StartsWith("release/", StringComparison.Ordinal)
               || branchName.StartsWith("hotfix/", StringComparison.Ordinal);
    }

    private static string BuildSuggestedBranchName(IReadOnlyList<GitOperationAffectedFile> statusFiles)
    {
        if (statusFiles.Count == 0)
        {
            return string.Empty;
        }

        var changedFiles = statusFiles
            .Select(file => new GitAutomationChangedFile(
                file.Path,
                file.IndexStatus,
                file.WorktreeStatus,
                file.Category,
                file.Staged,
                file.Unstaged,
                file.Untracked,
                null,
                null
            ))
            .ToArray();
        return GitAutomationSuggestionPolicy.BuildSuggestedBranchName(changedFiles);
    }

    private static bool IsSameStatus(GitOperationAffectedFile previous, GitOperationAffectedFile current)
    {
        return string.Equals(previous.Path, current.Path, StringComparison.Ordinal)
               && string.Equals(previous.IndexStatus, current.IndexStatus, StringComparison.Ordinal)
               && string.Equals(previous.WorktreeStatus, current.WorktreeStatus, StringComparison.Ordinal)
               && string.Equals(previous.Category, current.Category, StringComparison.Ordinal);
    }

    private static bool FixedTimeEquals(string left, string right)
    {
        var leftBytes = Encoding.UTF8.GetBytes(left ?? string.Empty);
        var rightBytes = Encoding.UTF8.GetBytes(right ?? string.Empty);
        return leftBytes.Length == rightBytes.Length
               && CryptographicOperations.FixedTimeEquals(leftBytes, rightBytes);
    }

    private static string GenerateConfirmationToken()
    {
        return Convert.ToHexString(RandomNumberGenerator.GetBytes(16)).ToLowerInvariant();
    }

    private static string HashString(string value)
    {
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value ?? string.Empty))).ToLowerInvariant();
    }

    private static string BuildDisplay(IReadOnlyList<string> arguments)
    {
        return BuildDisplay("git", arguments);
    }

    private static string BuildDisplay(string executable, IReadOnlyList<string> arguments)
    {
        return executable + " " + string.Join(" ", arguments.Select(QuoteArgument));
    }

    private static string QuoteArgument(string argument)
    {
        if (string.IsNullOrEmpty(argument))
        {
            return "\"\"";
        }

        return argument.All(ch => char.IsLetterOrDigit(ch) || ch is '-' or '_' or '/' or '.' or ':')
            ? argument
            : "\"" + argument.Replace("\"", "\\\"", StringComparison.Ordinal) + "\"";
    }

    private static bool IsInsideDirectory(string root, string candidate)
    {
        var comparison = OperatingSystem.IsWindows()
            ? StringComparison.OrdinalIgnoreCase
            : StringComparison.Ordinal;
        var normalizedRoot = EnsureTrailingSeparator(Path.GetFullPath(root));
        var normalizedCandidate = Path.GetFullPath(candidate);
        return normalizedCandidate.StartsWith(normalizedRoot, comparison);
    }

    private static string EnsureTrailingSeparator(string path)
    {
        return path.EndsWith(Path.DirectorySeparatorChar)
            ? path
            : path + Path.DirectorySeparatorChar;
    }

    private static void AddBlocked(
        List<GitOperationCheck> checks,
        List<string> blockers,
        string code,
        string message
    )
    {
        if (!blockers.Contains(code, StringComparer.Ordinal))
        {
            blockers.Add(code);
        }

        checks.Add(new GitOperationCheck(code, "blocked", message));
    }

    private sealed record RepositoryState(
        bool IsRepository,
        string BranchName,
        string HeadHash
    );

    private sealed record UpstreamState(
        bool HasUpstream,
        string RemoteName,
        string BranchName,
        int BehindCount,
        int AheadCount
    )
    {
        public static readonly UpstreamState Empty = new(false, string.Empty, string.Empty, 0, 0);
    }
}
