import { RefreshCcw, ShieldCheck } from "lucide-react";
import { CardBoundary } from "../../CardBoundary";
import { Badge, Button, Input, Textarea, cn } from "../../components/ui/primitives";
import type { CardErrorHandler, OpsGitState, OpsStoreActions } from "./OperationsPage.shared";
import { OPERATION_OPTIONS, SELECT_CLASS, operationIcon, operationLabel, parseGitOperationName, statusLabel, tone } from "./OperationsPage.shared";

type OperationsGitPanelProps = {
  readonly git: OpsGitState;
  readonly store: OpsStoreActions;
  readonly canRequest: boolean;
  readonly onError: CardErrorHandler;
};

export function OperationsGitPanel({ git, store, canRequest, onError }: OperationsGitPanelProps) {
  const snapshot = git.snapshot;
  const OperationIcon = operationIcon(git.form.operation);
  const isCommitOperation = git.form.operation === "stage_and_commit" || git.form.operation === "snapshot_commit";
  const canPreview = Boolean(
    canRequest &&
    !git.previewing &&
    (git.form.operation !== "stage_and_commit" || (git.form.commitMessage.trim() && git.selectedPaths.length > 0)) &&
    (git.form.operation !== "snapshot_commit" || git.form.commitMessage.trim()) &&
    (git.form.operation !== "create_branch" || git.form.branchName.trim()) &&
    (git.form.operation !== "open_pull_request" || git.form.pullRequestTitle.trim())
  );
  const canApply = Boolean(canRequest && git.preview?.ok && git.preview.previewId && git.preview.approval?.confirmationToken && git.preview.blockers.length === 0);

  return (
    <section>
      <CardBoundary title="Git 승인" card="operations" onError={onError}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Badge tone={snapshot?.isClean ? "success" : "warning"}>{snapshot?.isClean ? "변경 없음" : `변경 ${snapshot?.changedFileCount || 0}`}</Badge>
            <Badge tone="outline" className="font-mono">{snapshot?.branchName || "브랜치 -"}</Badge>
            <Badge tone={tone(snapshot?.readinessStatus || "")}>{snapshot?.readinessStatus ? statusLabel(snapshot.readinessStatus) : "상태 -"}</Badge>
            <Badge tone={tone(snapshot?.publishStatus || "")}>{snapshot?.publishStatus ? statusLabel(snapshot.publishStatus) : "공개 -"}</Badge>
          </div>
          <Button variant="outline" size="sm" onClick={store.loadGitAutomation} disabled={!canRequest || git.loading}>
            <RefreshCcw size={14} aria-hidden="true" /> {git.loading ? "조회 중" : "새로고침"}
          </Button>
        </div>

        {git.lastError ? <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{git.lastError}</p> : null}

        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="rounded-md bg-muted/40 px-2.5 py-2">
            <p className="text-[11px] text-muted-foreground">스테이지</p>
            <p className="font-mono text-lg font-semibold">{snapshot?.stagedFileCount || 0}</p>
          </div>
          <div className="rounded-md bg-muted/40 px-2.5 py-2">
            <p className="text-[11px] text-muted-foreground">수정됨</p>
            <p className="font-mono text-lg font-semibold">{snapshot?.unstagedFileCount || 0}</p>
          </div>
          <div className="rounded-md bg-muted/40 px-2.5 py-2">
            <p className="text-[11px] text-muted-foreground">새 파일</p>
            <p className="font-mono text-lg font-semibold">{snapshot?.untrackedFileCount || 0}</p>
          </div>
          <div className="rounded-md bg-muted/40 px-2.5 py-2">
            <p className="text-[11px] text-muted-foreground">충돌</p>
            <p className="font-mono text-lg font-semibold">{snapshot?.conflictedFileCount || 0}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
          <div className="min-w-0 space-y-2">
            <div className="flex items-center gap-2">
              <OperationIcon size={16} className="shrink-0 text-primary" aria-hidden="true" />
              <select className={SELECT_CLASS} value={git.form.operation} onChange={(event) => store.setGitOperation(parseGitOperationName(event.target.value))}>
                {OPERATION_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </div>
            {git.form.operation === "create_branch" ? (
              <Input value={git.form.branchName} placeholder="codex/new-branch" onChange={(event) => store.setGitField("branchName", event.target.value)} />
            ) : null}
            {isCommitOperation ? (
              <Input value={git.form.commitMessage} placeholder="커밋 메시지" onChange={(event) => store.setGitField("commitMessage", event.target.value)} />
            ) : null}
            {git.form.operation === "push_current_branch" ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Input value={git.form.remoteName} placeholder="원격 저장소 (선택)" onChange={(event) => store.setGitField("remoteName", event.target.value)} />
                <Input value={git.form.remoteBranchName} placeholder="원격 브랜치 (선택)" onChange={(event) => store.setGitField("remoteBranchName", event.target.value)} />
              </div>
            ) : null}
            {git.form.operation === "open_pull_request" ? (
              <div className="space-y-2">
                <Input value={git.form.pullRequestTitle} placeholder="PR 제목" onChange={(event) => store.setGitField("pullRequestTitle", event.target.value)} />
                <Input value={git.form.baseBranchName} placeholder="기준 브랜치" onChange={(event) => store.setGitField("baseBranchName", event.target.value)} />
                <Textarea rows={3} value={git.form.pullRequestBody} placeholder="PR 본문" onChange={(event) => store.setGitField("pullRequestBody", event.target.value)} />
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" checked={git.form.draft} onChange={(event) => store.setGitField("draft", event.target.checked)} />
                  초안 PR
                </label>
              </div>
            ) : null}
            <Button variant="primary" size="sm" onClick={store.previewGitOperation} disabled={!canPreview}>
              <ShieldCheck size={14} aria-hidden="true" /> {git.previewing ? "미리보기 중" : "미리보기"}
            </Button>
          </div>

          <div className="min-w-0 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-muted-foreground">대상 파일</span>
              <Badge tone="outline">선택 {git.selectedPaths.length}</Badge>
            </div>
            <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
              {(snapshot?.files || []).slice(0, 80).map((file) => (
                <label key={file.path} className={cn("flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors", isCommitOperation ? "hover:bg-accent/60" : "opacity-60")}>
                  <input type="checkbox" checked={git.selectedPaths.includes(file.path)} disabled={!isCommitOperation} onChange={() => store.toggleGitPath(file.path)} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono">{file.path}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">{file.category} · +{file.addedLines} / -{file.deletedLines}</span>
                  </span>
                  {file.untracked ? <Badge tone="warning">새 파일</Badge> : file.staged ? <Badge tone="primary">스테이지</Badge> : null}
                </label>
              ))}
              {snapshot && snapshot.files.length === 0 ? <p className="py-4 text-center text-xs text-muted-foreground">변경 파일 없음</p> : null}
              {!snapshot ? <p className="py-4 text-center text-xs text-muted-foreground">새로고침하면 git 상태가 표시됩니다.</p> : null}
            </div>
          </div>
        </div>

        {git.preview ? (
          <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={tone(git.preview.status)}>{statusLabel(git.preview.status || "preview")}</Badge>
                <Badge tone="outline" className="font-mono">{git.preview.previewId || "-"}</Badge>
                <Badge tone={git.preview.ok ? "success" : "destructive"}>{operationLabel(git.preview.operation)}</Badge>
              </div>
              <Button variant="destructive" size="sm" onClick={store.applyGitPreview} disabled={!canApply || git.applying}>
                {git.applying ? "적용 중" : "적용"}
              </Button>
            </div>
            <div className="space-y-1">
              {git.preview.plannedCommands.map((command, index) => (
                <p key={`${command.display}-${index}`} className="truncate rounded bg-background/60 px-2 py-1 font-mono text-[11px] text-muted-foreground">{command.display}</p>
              ))}
            </div>
            <div className="flex flex-wrap gap-1">
              {git.preview.checks.slice(0, 8).map((check) => <Badge key={`${check.code}-${check.status}`} tone={tone(check.status)}>{check.code}</Badge>)}
            </div>
          </div>
        ) : null}

        {git.applyResult ? (
          <div className="rounded-md border border-border bg-muted/30 p-3">
            <div className="flex items-center gap-2">
              <Badge tone={git.applyResult.ok ? "success" : "destructive"}>{statusLabel(git.applyResult.status)}</Badge>
              <span className="truncate text-sm">{git.applyResult.message || operationLabel(git.applyResult.operation)}</span>
            </div>
            <div className="mt-2 space-y-1">
              {git.applyResult.executedCommands.map((command, index) => (
                <p key={`${command.executable}-${index}`} className="truncate rounded bg-background/60 px-2 py-1 font-mono text-[11px] text-muted-foreground">
                  {command.executable} exit={command.exitCode} {command.stdOut || command.stdErr}
                </p>
              ))}
            </div>
          </div>
        ) : null}
      </CardBoundary>
    </section>
  );
}
