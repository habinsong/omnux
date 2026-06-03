namespace Omnux.Middleware;

internal sealed record SelfImprovementSnapshot(
    string RepositoryRoot,
    string Status,
    int ProposalCount,
    int Limit,
    IReadOnlyList<SelfImprovementProposal> Proposals,
    IReadOnlyList<string> Warnings,
    DateTimeOffset ScannedAtUtc
);

internal sealed record SelfImprovementProposal(
    string ProposalId,
    string Kind,
    string Priority,
    string Title,
    string Rationale,
    string SuggestedAction,
    string Source,
    string TargetPath,
    bool RequiresApproval,
    IReadOnlyList<string> Evidence
);
