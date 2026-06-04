import { GitCommitHorizontal, Sparkles } from "lucide-react";
import { Badge } from "../../components/ui/primitives";
import type { CommitLearningSnapshot, SelfImprovementSnapshot } from "./insights-store";
import { Empty, Row, Stat, statusTone } from "./InsightsPanels";

function shortDate(value: string): string {
  if (!value) return "date -";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" });
}

function formatLines(added: number, deleted: number): string {
  return `+${added.toLocaleString()} / -${deleted.toLocaleString()}`;
}

export function CommitLearningPanel({ commitLearning }: { commitLearning: CommitLearningSnapshot | null }) {
  if (!commitLearning) return <Empty label="새로고침하면 commit intent와 hotspot이 표시됩니다." />;
  const topIntent = commitLearning.intents[0];
  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="커밋" value={commitLearning.totalCommits} sub={`limit ${commitLearning.limit || "-"}`} />
        <Stat label="대표 intent" value={topIntent?.intent || "-"} sub={topIntent ? `${topIntent.commitCount} commits` : "heuristic"} />
        <Stat label="hotspot" value={commitLearning.hotspots.length} sub={commitLearning.scannedAtUtc || "scan time -"} />
      </div>
      <div className="flex min-w-0 flex-wrap gap-1">
        {commitLearning.intents.slice(0, 6).map((intent) => (
          <Badge key={intent.intent} tone={statusTone(intent.intent)} className="max-w-full truncate">
            {intent.intent} {intent.commitCount} · {formatLines(intent.addedLines, intent.deletedLines)}
          </Badge>
        ))}
        {commitLearning.warnings.map((warning) => (
          <Badge key={warning} tone="warning" className="max-w-full truncate">{warning}</Badge>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        <div className="min-w-0 space-y-1">
          {commitLearning.commits.slice(0, 6).map((commit) => (
            <Row
              key={commit.hash || commit.shortHash}
              left={commit.subject}
              sub={`${commit.authorName || "author -"} · ${shortDate(commit.authorDateUtc)} · ${commit.filesChanged} files · ${formatLines(commit.addedLines, commit.deletedLines)}`}
              right={<Badge tone={statusTone(commit.intent)}>{commit.intent}</Badge>}
            />
          ))}
          {commitLearning.commits.length === 0 ? <Empty label="최근 commit 없음" /> : null}
        </div>
        <div className="min-w-0 space-y-1">
          {commitLearning.hotspots.slice(0, 6).map((hotspot) => (
            <Row
              key={hotspot.path}
              left={hotspot.path}
              sub={`${hotspot.changeCount} changes · ${hotspot.lastSubject}`}
              right={<Badge tone="outline"><GitCommitHorizontal size={11} aria-hidden="true" /> {hotspot.lastCommitShortHash}</Badge>}
            />
          ))}
          {commitLearning.hotspots.length === 0 ? <Empty label="최근 commit hotspot 없음" /> : null}
        </div>
      </div>
    </>
  );
}

export function SelfImprovementPanel({ selfImprovement }: { selfImprovement: SelfImprovementSnapshot | null }) {
  if (!selfImprovement) return <Empty label="새로고침하면 workspace hygiene와 hotspot review 제안이 표시됩니다." />;
  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="상태" value={selfImprovement.status || "-"} sub={selfImprovement.scannedAtUtc || "scan time -"} />
        <Stat label="제안" value={selfImprovement.proposalCount} sub={`limit ${selfImprovement.limit || "-"}`} />
        <Stat label="경고" value={selfImprovement.warnings.length} sub="read-only audit" />
      </div>
      <div className="space-y-2">
        {selfImprovement.proposals.slice(0, 6).map((proposal) => (
          <article key={proposal.proposalId} className="rounded-md border border-border bg-card/60 px-2.5 py-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{proposal.title || proposal.proposalId}</p>
                <p className="truncate text-[11px] text-muted-foreground">{proposal.rationale || proposal.suggestedAction || proposal.kind}</p>
              </div>
              <Badge tone={statusTone(proposal.priority)}><Sparkles size={11} aria-hidden="true" /> {proposal.priority || "review"}</Badge>
            </div>
            <div className="mt-1 flex min-w-0 flex-wrap gap-1">
              <Badge tone="outline" className="max-w-full truncate">{proposal.kind || "proposal"}</Badge>
              {proposal.source ? <Badge tone="outline" className="max-w-full truncate">{proposal.source}</Badge> : null}
              {proposal.targetPath ? <Badge tone="outline" className="max-w-full truncate">{proposal.targetPath}</Badge> : null}
              {proposal.requiresApproval ? <Badge tone="warning">승인 필요</Badge> : <Badge tone="success">읽기 전용</Badge>}
            </div>
            {proposal.suggestedAction ? <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{proposal.suggestedAction}</p> : null}
            {proposal.evidence.length > 0 ? (
              <div className="mt-1 flex min-w-0 flex-wrap gap-1">
                {proposal.evidence.slice(0, 3).map((evidence) => (
                  <Badge key={evidence} tone="primary" className="max-w-full truncate">{evidence}</Badge>
                ))}
              </div>
            ) : null}
          </article>
        ))}
        {selfImprovement.proposals.length === 0 ? <Empty label="현재 개선 제안 없음" /> : null}
      </div>
      {selfImprovement.warnings.length > 0 ? (
        <div className="flex min-w-0 flex-wrap gap-1">
          {selfImprovement.warnings.slice(0, 4).map((warning) => <Badge key={warning} tone="warning" className="max-w-full truncate">{warning}</Badge>)}
        </div>
      ) : null}
    </>
  );
}
