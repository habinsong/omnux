import { useEffect } from "react";
import { GitBranch, GitCommit, GitPullRequest, RefreshCcw, ShieldCheck, UploadCloud } from "lucide-react";
import { CardBoundary } from "../../CardBoundary";
import { Badge, Button, Input, Textarea, cn } from "../../components/ui/primitives";
import { useDesktopAuthStore } from "../auth/auth-store";
import type { GitOperationName } from "../middleware/git-gateway";
import { AuthReadOnlyCard } from "../shell/ShellStatusCards";
import { useUiLogStore } from "../ui-log/ui-log-store";
import { useDesktopShellStore } from "../../shell-store";
import { OperationsDoctorPanel } from "./OperationsDoctorPanel";
import { useGitAutomationBridge, useOpsPageStore } from "./ops-store";

const OPERATION_LABELS: Array<{ value: GitOperationName; label: string }> = [
  { value: "stage_and_commit", label: "선택 파일 커밋" },
  { value: "snapshot_commit", label: "스냅샷 커밋" },
  { value: "create_branch", label: "브랜치 생성" },
  { value: "push_current_branch", label: "현재 브랜치 push" },
  { value: "open_pull_request", label: "PR 생성" }
];

const SELECT_CLASS =
  "h-9 rounded-md border border-input bg-transparent px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60";

function tone(value: string): "success" | "warning" | "destructive" | "primary" | "default" | "outline" {
  const text = value.toLowerCase();
  if (/(ready|passed|clean|applied|ok)/.test(text)) return "success";
  if (/(warning|missing|initial|dirty|review)/.test(text)) return "warning";
  if (/(blocked|error|failed|conflict)/.test(text)) return "destructive";
  if (/(preview|pending|running)/.test(text)) return "primary";
  return value ? "outline" : "default";
}

function operationIcon(operation: string) {
  if (operation === "open_pull_request") return GitPullRequest;
  if (operation === "push_current_branch") return UploadCloud;
  if (operation === "create_branch") return GitBranch;
  return GitCommit;
}

export function OperationsPage() {
  useGitAutomationBridge();
  const recordCardError = useUiLogStore((state) => state.recordCardError);
  const bridgeStatus = useDesktopShellStore((state) => state.bridge.status);
  const authStatus = useDesktopAuthStore((state) => state.auth.status);
  const git = useOpsPageStore((state) => state.git);
  const doctor = useOpsPageStore((state) => state.doctor);
  const ops = useOpsPageStore((state) => state.ops);
  const store = useOpsPageStore();
  const canRequest = bridgeStatus === "connected" && authStatus === "authenticated";
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
  const canApply = !!(canRequest && git.preview?.ok && git.preview.previewId && git.preview.approval?.confirmationToken && git.preview.blockers.length === 0);

  useEffect(() => {
    if (canRequest) {
      store.loadGitAutomation();
      store.loadDoctorLast();
      store.loadOpsSnapshot();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRequest]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">운영</h1>
        <p className="text-sm text-muted-foreground">인증, 미들웨어 브릿지, Doctor·Plan·Task, Git operation 승인 게이트를 확인합니다.</p>
      </div>
      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
        <div className="space-y-4">
          <CardBoundary title="인증 / Read-only WS" card="operations" onError={recordCardError}>
            <AuthReadOnlyCard />
          </CardBoundary>

          <CardBoundary title="Plan / Task 상태" card="operations" onError={recordCardError}>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">운영 목록</p>
                  <p className="truncate text-xs text-muted-foreground">Plan과 Task Graph 목록을 read-only로 확인합니다.</p>
                </div>
                <Button variant="outline" size="sm" onClick={store.loadOpsSnapshot} disabled={!canRequest || ops.loadingPlans || ops.loadingTaskGraphs}>
                  <RefreshCcw size={14} aria-hidden="true" /> 새로고침
                </Button>
              </div>
              {ops.lastError ? <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{ops.lastError}</p> : null}
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-md border border-border bg-card/60 px-3 py-2">
                  <p className="text-[11px] text-muted-foreground">plans</p>
                  <p className="font-mono text-lg font-semibold tabular-nums">{ops.planCount}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{ops.latestPlanTitle || (ops.loadingPlans ? "조회 중" : "최근 plan 없음")}</p>
                </div>
                <div className="rounded-md border border-border bg-card/60 px-3 py-2">
                  <p className="text-[11px] text-muted-foreground">task graphs</p>
                  <p className="font-mono text-lg font-semibold tabular-nums">{ops.taskGraphCount}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{ops.latestTaskGraphStatus || (ops.loadingTaskGraphs ? "조회 중" : "최근 graph 없음")}</p>
                </div>
              </div>
            </div>
          </CardBoundary>
        </div>

        <CardBoundary title="Doctor / 환경 진단" card="operations" onError={recordCardError}>
          <OperationsDoctorPanel
            doctor={doctor}
            canRequest={canRequest}
            onLoadLast={store.loadDoctorLast}
            onRun={store.runDoctor}
            onPreviewFix={store.previewDoctorFix}
          />
        </CardBoundary>
      </section>

      <section>
        <CardBoundary title="Git automation" card="operations" onError={recordCardError}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Badge tone={snapshot?.isClean ? "success" : "warning"}>{snapshot?.isClean ? "clean" : `${snapshot?.changedFileCount || 0} changed`}</Badge>
              <Badge tone="outline" className="font-mono">{snapshot?.branchName || "branch -"}</Badge>
              <Badge tone={tone(snapshot?.readinessStatus || "")}>{snapshot?.readinessStatus || "snapshot -"}</Badge>
              <Badge tone={tone(snapshot?.publishStatus || "")}>{snapshot?.publishStatus || "publish -"}</Badge>
            </div>
            <Button variant="outline" size="sm" onClick={store.loadGitAutomation} disabled={!canRequest || git.loading}>
              <RefreshCcw size={14} aria-hidden="true" /> {git.loading ? "조회 중" : "새로고침"}
            </Button>
          </div>

          {git.lastError ? <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{git.lastError}</p> : null}

          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <div className="rounded-md bg-muted/40 px-2.5 py-2">
              <p className="text-[11px] text-muted-foreground">staged</p>
              <p className="font-mono text-lg font-semibold">{snapshot?.stagedFileCount || 0}</p>
            </div>
            <div className="rounded-md bg-muted/40 px-2.5 py-2">
              <p className="text-[11px] text-muted-foreground">unstaged</p>
              <p className="font-mono text-lg font-semibold">{snapshot?.unstagedFileCount || 0}</p>
            </div>
            <div className="rounded-md bg-muted/40 px-2.5 py-2">
              <p className="text-[11px] text-muted-foreground">untracked</p>
              <p className="font-mono text-lg font-semibold">{snapshot?.untrackedFileCount || 0}</p>
            </div>
            <div className="rounded-md bg-muted/40 px-2.5 py-2">
              <p className="text-[11px] text-muted-foreground">conflict</p>
              <p className="font-mono text-lg font-semibold">{snapshot?.conflictedFileCount || 0}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
            <div className="min-w-0 space-y-2">
              <div className="flex items-center gap-2">
                <OperationIcon size={16} className="shrink-0 text-primary" aria-hidden="true" />
                <select className={SELECT_CLASS} value={git.form.operation} onChange={(event) => store.setGitOperation(event.target.value as GitOperationName)}>
                  {OPERATION_LABELS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
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
                  <Input value={git.form.remoteName} placeholder="remote (선택)" onChange={(event) => store.setGitField("remoteName", event.target.value)} />
                  <Input value={git.form.remoteBranchName} placeholder="remote branch (선택)" onChange={(event) => store.setGitField("remoteBranchName", event.target.value)} />
                </div>
              ) : null}
              {git.form.operation === "open_pull_request" ? (
                <div className="space-y-2">
                  <Input value={git.form.pullRequestTitle} placeholder="PR 제목" onChange={(event) => store.setGitField("pullRequestTitle", event.target.value)} />
                  <Input value={git.form.baseBranchName} placeholder="base branch" onChange={(event) => store.setGitField("baseBranchName", event.target.value)} />
                  <Textarea rows={3} value={git.form.pullRequestBody} placeholder="PR 본문" onChange={(event) => store.setGitField("pullRequestBody", event.target.value)} />
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input type="checkbox" checked={git.form.draft} onChange={(event) => store.setGitField("draft", event.target.checked)} />
                    draft PR
                  </label>
                </div>
              ) : null}
              <Button variant="primary" size="sm" onClick={store.previewGitOperation} disabled={!canPreview}>
                <ShieldCheck size={14} aria-hidden="true" /> {git.previewing ? "미리보기 중" : "Preview"}
              </Button>
            </div>

            <div className="min-w-0 space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-muted-foreground">대상 파일</span>
                <Badge tone="outline">{git.selectedPaths.length} selected</Badge>
              </div>
              <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
                {(snapshot?.files || []).slice(0, 80).map((file) => (
                  <label key={file.path} className={cn("flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors", isCommitOperation ? "hover:bg-accent/60" : "opacity-60")}>
                    <input type="checkbox" checked={git.selectedPaths.includes(file.path)} disabled={!isCommitOperation} onChange={() => store.toggleGitPath(file.path)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono">{file.path}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">{file.category} · +{file.addedLines} / -{file.deletedLines}</span>
                    </span>
                    {file.untracked ? <Badge tone="warning">new</Badge> : file.staged ? <Badge tone="primary">staged</Badge> : null}
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
                  <Badge tone={tone(git.preview.status)}>{git.preview.status || "preview"}</Badge>
                  <Badge tone="outline" className="font-mono">{git.preview.previewId || "-"}</Badge>
                  <Badge tone={git.preview.ok ? "success" : "destructive"}>{git.preview.operation}</Badge>
                </div>
                <Button variant="destructive" size="sm" onClick={store.applyGitPreview} disabled={!canApply || git.applying}>
                  {git.applying ? "적용 중" : "Apply"}
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
                <Badge tone={git.applyResult.ok ? "success" : "destructive"}>{git.applyResult.status}</Badge>
                <span className="truncate text-sm">{git.applyResult.message || git.applyResult.operation}</span>
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
    </div>
  );
}
