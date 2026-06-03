using System.Globalization;

namespace Omnux.Middleware;

internal sealed class SelfImprovementSnapshotService
{
    private const int DefaultLimit = 30;
    private const int MaxLimit = 100;

    private readonly string _repositoryRoot;
    private readonly GitCommitHistoryScanner _commitScanner;
    private readonly GitAutomationSnapshotService _gitAutomation;
    private readonly Func<DateTimeOffset> _utcNow;

    public SelfImprovementSnapshotService(
        string repositoryRoot,
        GitCommitHistoryScanner? commitScanner = null,
        GitAutomationSnapshotService? gitAutomation = null,
        Func<DateTimeOffset>? utcNow = null
    )
    {
        _repositoryRoot = Path.GetFullPath(string.IsNullOrWhiteSpace(repositoryRoot) ? "." : repositoryRoot);
        _commitScanner = commitScanner ?? new GitCommitHistoryScanner(_repositoryRoot);
        _gitAutomation = gitAutomation ?? new GitAutomationSnapshotService(_repositoryRoot);
        _utcNow = utcNow ?? (() => DateTimeOffset.UtcNow);
    }

    public async Task<SelfImprovementSnapshot> GetSnapshotAsync(
        int? requestedLimit,
        CancellationToken cancellationToken
    )
    {
        var limit = Math.Clamp(requestedLimit ?? DefaultLimit, 1, MaxLimit);
        var warnings = new List<string>();
        var proposals = new List<SelfImprovementProposal>();

        var gitAutomation = await _gitAutomation.GetSnapshotAsync(limit, cancellationToken)
            .ConfigureAwait(false);
        warnings.AddRange(PrefixWarnings("git_automation", gitAutomation.Warnings));
        AddGitAutomationProposals(proposals, gitAutomation);

        var learning = await _commitScanner.GetSnapshotAsync(limit, cancellationToken)
            .ConfigureAwait(false);
        warnings.AddRange(PrefixWarnings("commit_learning", learning.Warnings));
        AddCommitLearningProposals(proposals, learning);

        var ordered = proposals
            .OrderBy(proposal => PriorityRank(proposal.Priority))
            .ThenBy(proposal => proposal.Kind, StringComparer.Ordinal)
            .ThenBy(proposal => proposal.TargetPath, StringComparer.Ordinal)
            .Take(limit)
            .ToArray();

        return new SelfImprovementSnapshot(
            _repositoryRoot,
            ordered.Length == 0 ? "no_proposals" : "proposal_ready",
            ordered.Length,
            limit,
            ordered,
            warnings.Distinct(StringComparer.Ordinal).ToArray(),
            _utcNow()
        );
    }

    private static void AddGitAutomationProposals(
        ICollection<SelfImprovementProposal> proposals,
        GitAutomationSnapshot snapshot
    )
    {
        if (snapshot.ConflictedFileCount > 0)
        {
            proposals.Add(new SelfImprovementProposal(
                "git-conflict-review",
                "workspace_hygiene",
                "high",
                "충돌 파일 우선 정리",
                $"현재 워크트리에 충돌 파일 {snapshot.ConflictedFileCount.ToString(CultureInfo.InvariantCulture)}개가 있습니다.",
                "충돌 파일을 먼저 해결한 뒤 커밋/PR 준비 상태를 다시 확인한다.",
                "git_automation",
                string.Empty,
                true,
                new[] { $"conflictedFileCount={snapshot.ConflictedFileCount.ToString(CultureInfo.InvariantCulture)}" }
            ));
            return;
        }

        if (!snapshot.HasChanges)
        {
            return;
        }

        proposals.Add(new SelfImprovementProposal(
            "git-change-review",
            "workspace_hygiene",
            snapshot.ChangedFileCount >= 10 ? "high" : "medium",
            "현재 변경사항 커밋 준비 검토",
            $"현재 워크트리에 변경 파일 {snapshot.ChangedFileCount.ToString(CultureInfo.InvariantCulture)}개가 있습니다.",
            "프론트에서 변경 파일과 커밋 메시지 초안을 검토하게 하고, 실제 커밋/PR 실행은 승인 API가 생긴 뒤 연결한다.",
            "git_automation",
            string.Empty,
            true,
            new[]
            {
                $"suggestedCommitMessage={snapshot.SuggestedCommitMessage}",
                $"staged={snapshot.StagedFileCount.ToString(CultureInfo.InvariantCulture)}",
                $"unstaged={snapshot.UnstagedFileCount.ToString(CultureInfo.InvariantCulture)}",
                $"untracked={snapshot.UntrackedFileCount.ToString(CultureInfo.InvariantCulture)}"
            }
        ));
    }

    private static void AddCommitLearningProposals(
        ICollection<SelfImprovementProposal> proposals,
        GitCommitLearningSnapshot snapshot
    )
    {
        var bugFix = snapshot.Intents.FirstOrDefault(intent => intent.Intent == "bug_fix");
        if (bugFix != null && bugFix.CommitCount >= 2)
        {
            proposals.Add(new SelfImprovementProposal(
                "commit-bugfix-pattern-review",
                "learning_review",
                "medium",
                "반복된 bug_fix 패턴 리뷰",
                $"최근 커밋 중 bug_fix intent가 {bugFix.CommitCount.ToString(CultureInfo.InvariantCulture)}회 감지됐습니다.",
                "최근 bug_fix 커밋 제목과 hotspot 파일을 사람이 검토해 테스트/가드 보강 후보를 정한다.",
                "commit_learning",
                string.Empty,
                true,
                new[]
                {
                    $"bugFixCommits={bugFix.CommitCount.ToString(CultureInfo.InvariantCulture)}",
                    $"addedLines={bugFix.AddedLines.ToString(CultureInfo.InvariantCulture)}",
                    $"deletedLines={bugFix.DeletedLines.ToString(CultureInfo.InvariantCulture)}"
                }
            ));
        }

        foreach (var hotspot in snapshot.Hotspots.Where(item => item.ChangeCount >= 2).Take(5))
        {
            proposals.Add(new SelfImprovementProposal(
                $"hotspot-{StableToken(hotspot.Path)}",
                "hotspot_review",
                hotspot.ChangeCount >= 4 ? "high" : "medium",
                "변경 hotspot 검토",
                $"최근 커밋에서 `{hotspot.Path}` 파일이 {hotspot.ChangeCount.ToString(CultureInfo.InvariantCulture)}회 변경됐습니다.",
                "해당 파일의 테스트 커버리지, 소유권, 리팩터링 필요성을 검토한다.",
                "commit_learning",
                hotspot.Path,
                true,
                new[]
                {
                    $"changeCount={hotspot.ChangeCount.ToString(CultureInfo.InvariantCulture)}",
                    $"lastCommit={hotspot.LastCommitShortHash}",
                    $"lastSubject={hotspot.LastSubject}"
                }
            ));
        }
    }

    private static IReadOnlyList<string> PrefixWarnings(string source, IReadOnlyList<string> warnings)
    {
        return warnings
            .Where(warning => !string.IsNullOrWhiteSpace(warning))
            .Select(warning => $"{source}: {warning.Trim()}")
            .ToArray();
    }

    private static int PriorityRank(string priority)
    {
        return priority switch
        {
            "high" => 0,
            "medium" => 1,
            "low" => 2,
            _ => 3
        };
    }

    private static string StableToken(string value)
    {
        var token = new string((value ?? string.Empty)
            .Where(char.IsLetterOrDigit)
            .Take(32)
            .ToArray());
        return string.IsNullOrWhiteSpace(token) ? "workspace" : token;
    }
}
