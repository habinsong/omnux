import { useEffect, type ReactNode } from "react";
import { AlarmClock, Bell, CalendarClock, CornerDownRight, FileSearch, FileText, FolderOpen, GitBranch, GitCommit, GitPullRequest, HardDrive, History, Info, ListChecks, Network, Play, Plus, Power, RefreshCcw, Search, Send, ShieldAlert, ShieldCheck, Terminal, Trash2, UploadCloud, Wand2, X } from "lucide-react";
import { CardBoundary } from "../../CardBoundary";
import { Badge, Button, Input, Spinner, Textarea, cn } from "../../components/ui/primitives";
import { useDesktopAuthStore } from "../auth/auth-store";
import type { GitOperationName } from "../middleware/git-gateway";
import { AuthReadOnlyCard } from "../shell/ShellStatusCards";
import { useUiLogStore } from "../ui-log/ui-log-store";
import { useDesktopShellStore } from "../../shell-store";
import { OperationsDoctorPanel } from "./OperationsDoctorPanel";
import { useGitAutomationBridge, useOpsPageStore, type ContextItem, type ContextSource, type CronJobForm, type LogicPathEntry } from "./ops-store";

const OPERATION_LABELS: Array<{ value: GitOperationName; label: string }> = [
  { value: "stage_and_commit", label: "선택 파일 커밋" },
  { value: "snapshot_commit", label: "스냅샷 커밋" },
  { value: "create_branch", label: "브랜치 생성" },
  { value: "push_current_branch", label: "현재 브랜치 push" },
  { value: "open_pull_request", label: "PR 생성" }
];

const COMMAND_EXAMPLES = [
  "/help natural",
  "/llm status",
  "/plan list",
  "/notebook show",
  "/metrics"
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

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size >= 10 || index === 0 ? Math.round(size) : size.toFixed(1)} ${units[index]}`;
}

function formatDateTimeMs(value: number | null): string {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString();
  } catch (_error) {
    return "-";
  }
}

function formatDateTimeUtc(value: string): string {
  if (!value) return "-";
  try {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "-";
    return parsed.toLocaleString();
  } catch (_error) {
    return "-";
  }
}

function formatDurationMs(value: number | null): string {
  if (!value) return "-";
  if (value < 1000) return `${value}ms`;
  return `${Math.round(value / 1000)}s`;
}

type WorkspaceCandidate = {
  key: string;
  path: string;
  name: string;
  description: string;
  source: string;
  isDirectory: boolean;
  browsePath: string;
};

function basename(pathValue: string): string {
  const normalized = pathValue.replace(/\\/g, "/").replace(/\/+$/, "");
  return normalized.split("/").filter(Boolean).pop() || normalized || "/";
}

function compactPath(pathValue: string, maxSegments = 4): string {
  const normalized = pathValue.replace(/\\/g, "/");
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length <= maxSegments) return normalized || "/";
  return `.../${segments.slice(-maxSegments).join("/")}`;
}

function addWorkspaceCandidate(target: WorkspaceCandidate[], seen: Set<string>, candidate: Omit<WorkspaceCandidate, "key">) {
  if (!candidate.path.trim()) return;
  const key = `${candidate.isDirectory ? "dir" : "file"}:${candidate.path}`;
  if (seen.has(key)) return;
  seen.add(key);
  target.push({ ...candidate, key });
}

function buildWorkspaceCandidates(input: {
  items: LogicPathEntry[];
  sources: ContextSource[];
  commands: ContextItem[];
  recentFiles: string[];
  currentPreviewPath: string;
  query: string;
}): WorkspaceCandidate[] {
  const candidates: WorkspaceCandidate[] = [];
  const seen = new Set<string>();
  for (const item of input.items) {
    addWorkspaceCandidate(candidates, seen, {
      path: item.isDirectory ? item.browsePath : item.selectPath,
      name: item.name,
      description: item.description || item.selectPath || item.browsePath,
      source: "현재 폴더",
      isDirectory: item.isDirectory,
      browsePath: item.browsePath
    });
  }
  for (const source of input.sources) {
    addWorkspaceCandidate(candidates, seen, {
      path: source.path,
      name: basename(source.path),
      description: `${source.scope} · instruction source`,
      source: "문맥",
      isDirectory: false,
      browsePath: ""
    });
  }
  for (const command of input.commands) {
    addWorkspaceCandidate(candidates, seen, {
      path: command.path,
      name: command.name || basename(command.path),
      description: command.summary || command.description || command.path,
      source: "명령",
      isDirectory: false,
      browsePath: ""
    });
  }
  for (const path of input.recentFiles) {
    addWorkspaceCandidate(candidates, seen, {
      path,
      name: basename(path),
      description: "최근 preview",
      source: "최근",
      isDirectory: false,
      browsePath: ""
    });
  }
  if (input.currentPreviewPath) {
    addWorkspaceCandidate(candidates, seen, {
      path: input.currentPreviewPath,
      name: basename(input.currentPreviewPath),
      description: "현재 preview",
      source: "현재",
      isDirectory: false,
      browsePath: ""
    });
  }
  const directPath = input.query.trim();
  if (/[/\\.]|^~/.test(directPath)) {
    addWorkspaceCandidate(candidates, seen, {
      path: directPath,
      name: basename(directPath),
      description: "직접 입력 경로",
      source: "직접",
      isDirectory: false,
      browsePath: ""
    });
  }
  return candidates;
}

function filterWorkspaceCandidates(candidates: WorkspaceCandidate[], query: string): WorkspaceCandidate[] {
  const normalized = query.trim().toLowerCase();
  const sorted = [...candidates].sort((a, b) => Number(b.isDirectory) - Number(a.isDirectory) || a.path.localeCompare(b.path));
  if (!normalized) return sorted.slice(0, 60);
  return sorted
    .filter((candidate) => `${candidate.name} ${candidate.path} ${candidate.description} ${candidate.source}`.toLowerCase().includes(normalized))
    .slice(0, 80);
}

function CronFieldLabel({ children }: { children: ReactNode }) {
  return <span className="mb-1 block text-[11px] font-medium text-muted-foreground">{children}</span>;
}

function CronAddForm({
  form,
  mutating,
  canRequest,
  onField,
  onSubmit
}: {
  form: CronJobForm;
  mutating: boolean;
  canRequest: boolean;
  onField: <K extends keyof CronJobForm>(key: K, value: CronJobForm[K]) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="space-y-2.5 rounded-md border border-border bg-background/60 p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold">
        <Plus size={13} className="shrink-0 text-primary" aria-hidden="true" /> 새 Cron job
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="block">
          <CronFieldLabel>이름 *</CronFieldLabel>
          <Input value={form.name} placeholder="아침 브리핑" onChange={(event) => onField("name", event.target.value)} />
        </label>
        <label className="block">
          <CronFieldLabel>설명 (선택)</CronFieldLabel>
          <Input value={form.description || ""} placeholder="매일 아침 요약 전송" onChange={(event) => onField("description", event.target.value)} />
        </label>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="block">
          <CronFieldLabel>스케줄</CronFieldLabel>
          <select className={cn(SELECT_CLASS, "w-full")} value={form.scheduleKind} onChange={(event) => onField("scheduleKind", event.target.value as CronJobForm["scheduleKind"])}>
            <option value="cron">매일 지정 시각</option>
            <option value="every">반복 간격</option>
            <option value="at">특정 일시 (1회)</option>
          </select>
        </label>
        {form.scheduleKind === "cron" ? (
          <div className="grid grid-cols-[1fr_1fr_1.4fr] gap-1.5">
            <label className="block">
              <CronFieldLabel>시</CronFieldLabel>
              <Input type="number" min={0} max={23} value={form.scheduleHour ?? 8} onChange={(event) => onField("scheduleHour", Number(event.target.value))} />
            </label>
            <label className="block">
              <CronFieldLabel>분</CronFieldLabel>
              <Input type="number" min={0} max={59} value={form.scheduleMinute ?? 0} onChange={(event) => onField("scheduleMinute", Number(event.target.value))} />
            </label>
            <label className="block">
              <CronFieldLabel>TZ (선택)</CronFieldLabel>
              <Input value={form.scheduleTz || ""} placeholder="Asia/Seoul" onChange={(event) => onField("scheduleTz", event.target.value)} />
            </label>
          </div>
        ) : null}
        {form.scheduleKind === "every" ? (
          <label className="block">
            <CronFieldLabel>반복 간격 (초)</CronFieldLabel>
            <Input type="number" min={1} value={form.scheduleEverySeconds ?? 3600} onChange={(event) => onField("scheduleEverySeconds", Number(event.target.value))} />
          </label>
        ) : null}
        {form.scheduleKind === "at" ? (
          <label className="block">
            <CronFieldLabel>실행 일시 (UTC 기준)</CronFieldLabel>
            <Input type="datetime-local" value={form.scheduleAt || ""} onChange={(event) => onField("scheduleAt", event.target.value)} />
          </label>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <label className="block">
          <CronFieldLabel>세션</CronFieldLabel>
          <select className={cn(SELECT_CLASS, "w-full")} value={form.sessionTarget || "main"} onChange={(event) => onField("sessionTarget", event.target.value as CronJobForm["sessionTarget"])}>
            <option value="main">main</option>
            <option value="isolated">isolated</option>
          </select>
        </label>
        <label className="block">
          <CronFieldLabel>깨우기</CronFieldLabel>
          <select className={cn(SELECT_CLASS, "w-full")} value={form.wakeMode || "next-heartbeat"} onChange={(event) => onField("wakeMode", event.target.value as CronJobForm["wakeMode"])}>
            <option value="next-heartbeat">next-heartbeat</option>
            <option value="now">now</option>
          </select>
        </label>
        <label className="block">
          <CronFieldLabel>작업 종류</CronFieldLabel>
          <select className={cn(SELECT_CLASS, "w-full")} value={form.payloadKind || "chat"} onChange={(event) => onField("payloadKind", event.target.value)}>
            <option value="chat">chat</option>
            <option value="coding">coding</option>
          </select>
        </label>
      </div>
      <label className="block">
        <CronFieldLabel>요청 내용 (payload.text)</CronFieldLabel>
        <Textarea rows={2} value={form.payloadText || ""} placeholder="오늘의 일정과 할 일을 요약해줘" onChange={(event) => onField("payloadText", event.target.value)} className="text-xs" />
      </label>
      <label className="block">
        <CronFieldLabel>모델 (선택)</CronFieldLabel>
        <Input value={form.payloadModel || ""} placeholder="provider 기본값 사용 시 비워둠" onChange={(event) => onField("payloadModel", event.target.value)} className="font-mono text-xs" />
      </label>
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={form.enabled !== false} onChange={(event) => onField("enabled", event.target.checked)} />
          생성 즉시 활성화
        </label>
        <Button variant="primary" size="sm" onClick={onSubmit} disabled={!canRequest || mutating || !form.name.trim()}>
          {mutating ? <Spinner size={14} /> : <Plus size={14} aria-hidden="true" />} 생성
        </Button>
      </div>
    </div>
  );
}

export function OperationsPage() {
  useGitAutomationBridge();
  const recordCardError = useUiLogStore((state) => state.recordCardError);
  const bridgeStatus = useDesktopShellStore((state) => state.bridge.status);
  const authStatus = useDesktopAuthStore((state) => state.auth.status);
  const git = useOpsPageStore((state) => state.git);
  const doctor = useOpsPageStore((state) => state.doctor);
  const ops = useOpsPageStore((state) => state.ops);
  const tools = useOpsPageStore((state) => state.tools);
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
  const guardSnapshot = tools.guard.snapshot;
  const guardDispatchResult = tools.guard.dispatchResult;
  const guardTotalSamples = guardSnapshot?.channels.reduce((sum, channel) => sum + channel.totalSamples, 0) || 0;
  const guardRetryRequired = guardSnapshot?.channels.reduce((sum, channel) => sum + channel.retryRequiredSamples, 0) || 0;
  const guardConfiguredTargets = guardDispatchResult?.targets.filter((target) => !(target.status === "skipped" && target.error === "target_not_configured")).length ?? null;
  const workspacePath = tools.context.logicPath?.scope === "workspace" ? tools.context.logicPath : null;
  const workspaceCandidates = buildWorkspaceCandidates({
    items: workspacePath?.items || [],
    sources: tools.context.project?.sources || [],
    commands: tools.context.commands?.items || tools.context.project?.commands || [],
    recentFiles: tools.context.recentWorkspaceFiles,
    currentPreviewPath: tools.context.filePreview?.path || "",
    query: tools.context.workspaceSearch
  });
  const filteredWorkspaceCandidates = filterWorkspaceCandidates(workspaceCandidates, tools.context.workspaceSearch);
  const workspaceFileCount = workspacePath?.items.filter((item) => !item.isDirectory).length || 0;
  const workspaceDirectoryCount = workspacePath?.items.filter((item) => item.isDirectory).length || 0;

  useEffect(() => {
    if (canRequest) {
      store.loadGitAutomation();
      store.loadDoctorLast();
      store.loadOpsSnapshot();
      store.loadCronStatus();
      store.loadCronJobs();
      store.loadNodesSnapshot();
      store.loadLogicPath();
      void store.loadGuardRetryTimeline();
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

      <section>
        <CardBoundary title="운영 도구" card="operations" onError={recordCardError}>
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            <div className="min-w-0 space-y-3 rounded-md border border-border bg-muted/20 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <HardDrive size={16} className="shrink-0 text-primary" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">Cleanup</p>
                    <p className="truncate text-xs text-muted-foreground">삭제 후보를 먼저 확인한 뒤 적용합니다.</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={store.previewCleanup} disabled={!canRequest || tools.cleanup.previewing || tools.cleanup.applying}>
                  {tools.cleanup.previewing ? <Spinner size={14} /> : <RefreshCcw size={14} aria-hidden="true" />} Preview
                </Button>
              </div>
              {tools.cleanup.lastError ? <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{tools.cleanup.lastError}</p> : null}
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-md bg-background/60 px-2 py-1.5">
                  <p className="text-[11px] text-muted-foreground">후보</p>
                  <p className="font-mono text-sm font-semibold tabular-nums">{tools.cleanup.preview?.candidates.length || 0}</p>
                </div>
                <div className="rounded-md bg-background/60 px-2 py-1.5">
                  <p className="text-[11px] text-muted-foreground">크기</p>
                  <p className="truncate font-mono text-sm font-semibold">{formatBytes(tools.cleanup.preview?.totalSizeBytes || 0)}</p>
                </div>
                <div className="rounded-md bg-background/60 px-2 py-1.5">
                  <p className="text-[11px] text-muted-foreground">preview</p>
                  <p className="truncate font-mono text-sm font-semibold">{tools.cleanup.preview?.previewId || "-"}</p>
                </div>
              </div>
              <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
                {(tools.cleanup.preview?.candidates || []).slice(0, 40).map((candidate) => (
                  <div key={candidate.path} className="flex min-w-0 items-center gap-2 rounded-md bg-background/50 px-2 py-1.5 text-xs">
                    <Trash2 size={13} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono">{candidate.path}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">{candidate.kind} · {formatBytes(candidate.sizeBytes)} · {candidate.reason}</span>
                    </span>
                  </div>
                ))}
                {tools.cleanup.preview && tools.cleanup.preview.candidates.length === 0 ? <p className="py-4 text-center text-xs text-muted-foreground">삭제 후보 없음</p> : null}
                {!tools.cleanup.preview ? <p className="py-4 text-center text-xs text-muted-foreground">Preview를 실행하면 후보가 표시됩니다.</p> : null}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                {tools.cleanup.applyResult ? (
                  <div className="min-w-0 flex-1">
                    <Badge tone={tools.cleanup.applyResult.ok ? "success" : "destructive"}>{tools.cleanup.applyResult.ok ? "applied" : "failed"}</Badge>
                    <span className="ml-2 truncate text-xs text-muted-foreground">
                      {tools.cleanup.applyResult.removedCount}개 · {formatBytes(tools.cleanup.applyResult.removedSizeBytes)}
                    </span>
                  </div>
                ) : <span className="text-xs text-muted-foreground">적용은 previewId가 있을 때만 가능합니다.</span>}
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={store.applyCleanupPreview}
                  disabled={!canRequest || !tools.cleanup.preview?.ok || !tools.cleanup.preview.previewId || tools.cleanup.applying}
                >
                  {tools.cleanup.applying ? <Spinner size={14} /> : <Trash2 size={14} aria-hidden="true" />} Apply
                </Button>
              </div>
            </div>

            <div className="min-w-0 space-y-3 rounded-md border border-border bg-muted/20 p-3 xl:col-span-2" data-testid="guard-alert-dispatch-panel">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <ShieldAlert size={16} className="shrink-0 text-primary" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">Guard Alert Dispatch</p>
                    <p className="truncate text-xs text-muted-foreground">백엔드 환경변수 target으로 guard alert 이벤트를 수동 테스트합니다.</p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-1">
                  <Badge tone={guardDispatchResult?.ok ? "success" : guardDispatchResult ? tone(guardDispatchResult.status) : "outline"}>
                    {guardDispatchResult?.status || "idle"}
                  </Badge>
                  {guardConfiguredTargets !== null ? <Badge tone={guardConfiguredTargets > 0 ? "success" : "warning"}>{guardConfiguredTargets} targets</Badge> : null}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-1">
                      <Badge tone="outline">schema: guard_alert_event.v1</Badge>
                      <Badge tone="outline">event: omnux.guard_alert.summary</Badge>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button variant="outline" size="sm" onClick={store.resetGuardAlertEventJson} disabled={tools.guard.dispatching}>
                        <RefreshCcw size={14} aria-hidden="true" /> 샘플 재생성
                      </Button>
                      <Button variant="primary" size="sm" onClick={() => void store.dispatchGuardAlert()} disabled={!canRequest || tools.guard.dispatching || !tools.guard.eventJson.trim()}>
                        {tools.guard.dispatching ? <Spinner size={14} /> : <Send size={14} aria-hidden="true" />} Dispatch 테스트
                      </Button>
                    </div>
                  </div>
                  <Textarea
                    rows={12}
                    value={tools.guard.eventJson}
                    onChange={(event) => store.setGuardAlertEventJson(event.target.value)}
                    className="min-h-64 font-mono text-xs"
                    spellCheck={false}
                    placeholder='{"schemaVersion":"guard_alert_event.v1","eventType":"omnux.guard_alert.summary"}'
                  />
                  {tools.guard.dispatchError ? (
                    <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{tools.guard.dispatchError}</p>
                  ) : (
                    <p className="rounded-md bg-background/60 px-3 py-2 text-xs text-muted-foreground">
                      endpoint URL은 앱에서 저장하지 않고 `OMNUX_GUARD_ALERT_WEBHOOK_URL`, `OMNUX_GUARD_ALERT_LOG_COLLECTOR_URL` 환경변수만 사용합니다.
                    </p>
                  )}
                </div>

                <div className="min-w-0 space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-md bg-background/60 px-2 py-1.5">
                      <p className="text-[11px] text-muted-foreground">sent</p>
                      <p className="font-mono text-sm font-semibold tabular-nums">{guardDispatchResult?.sentCount ?? 0}</p>
                    </div>
                    <div className="rounded-md bg-background/60 px-2 py-1.5">
                      <p className="text-[11px] text-muted-foreground">failed</p>
                      <p className="font-mono text-sm font-semibold tabular-nums">{guardDispatchResult?.failedCount ?? 0}</p>
                    </div>
                    <div className="rounded-md bg-background/60 px-2 py-1.5">
                      <p className="text-[11px] text-muted-foreground">skipped</p>
                      <p className="font-mono text-sm font-semibold tabular-nums">{guardDispatchResult?.skippedCount ?? 0}</p>
                    </div>
                  </div>
                  <div className="rounded-md bg-background/60 px-3 py-2 text-xs">
                    <div className="mb-1 flex min-w-0 items-center gap-1.5 font-semibold">
                      <Info size={13} className="shrink-0 text-primary" aria-hidden="true" />
                      <span className="truncate">Dispatch 계약</span>
                    </div>
                    <div className="space-y-1 text-muted-foreground">
                      <p className="truncate font-mono">OMNUX_GUARD_ALERT_WEBHOOK_URL</p>
                      <p className="truncate font-mono">OMNUX_GUARD_ALERT_LOG_COLLECTOR_URL</p>
                      <p className="truncate font-mono">OMNUX_GUARD_ALERT_DISPATCH_TIMEOUT_MS</p>
                      <p className="truncate font-mono">OMNUX_GUARD_ALERT_DISPATCH_MAX_ATTEMPTS</p>
                    </div>
                  </div>
                  {guardDispatchResult ? (
                    <div className="space-y-2">
                      <div className="rounded-md border border-border bg-background/50 px-3 py-2 text-xs">
                        <div className="mb-1 flex min-w-0 items-center justify-between gap-2">
                          <span className="truncate font-semibold">{guardDispatchResult.message || guardDispatchResult.status}</span>
                          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{formatDateTimeUtc(guardDispatchResult.attemptedAtUtc)}</span>
                        </div>
                        <p className="truncate text-muted-foreground">{guardDispatchResult.schemaVersion} · {guardDispatchResult.eventType}</p>
                      </div>
                      <div className="max-h-48 space-y-1 overflow-y-auto pr-1">
                        {guardDispatchResult.targets.map((target) => (
                          <div key={target.name} className="rounded-md bg-background/50 px-2 py-1.5 text-xs">
                            <div className="flex min-w-0 items-center justify-between gap-2">
                              <span className="truncate font-semibold">{target.name}</span>
                              <Badge tone={target.status === "skipped" ? "warning" : tone(target.status)}>{target.status || "-"}</Badge>
                            </div>
                            <div className="mt-1 grid grid-cols-2 gap-1 text-[11px] text-muted-foreground">
                              <span className="truncate">attempts {target.attempts}</span>
                              <span className="truncate">HTTP {target.statusCode ?? "-"}</span>
                            </div>
                            <p className="truncate text-[11px] text-muted-foreground">{target.endpoint || "-"}</p>
                            {target.error && target.error !== "-" ? <p className="truncate text-[11px] text-destructive">{target.error}</p> : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="rounded-md bg-background/60 px-3 py-8 text-center text-xs text-muted-foreground">Dispatch 테스트 결과가 여기에 표시됩니다.</p>
                  )}
                </div>
              </div>
            </div>

            <div className="min-w-0 space-y-3 rounded-md border border-border bg-muted/20 p-3 xl:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Terminal size={16} className="shrink-0 text-primary" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">자연어 명령 콘솔</p>
                    <p className="truncate text-xs text-muted-foreground">백엔드 command 라우터에 자연어 또는 slash 명령을 전송합니다.</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {tools.command.result ? <Badge tone={tools.command.result.status === "success" ? "success" : "destructive"}>{tools.command.result.status}</Badge> : null}
                  <Button variant="primary" size="sm" onClick={() => void store.runCommandConsole()} disabled={!canRequest || !tools.command.text.trim() || tools.command.running}>
                    {tools.command.running ? <Spinner size={14} /> : <Send size={14} aria-hidden="true" />} 실행
                  </Button>
                </div>
              </div>
              {tools.command.lastError ? <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{tools.command.lastError}</p> : null}
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(280px,420px)_minmax(0,1fr)]">
                <div className="min-w-0 space-y-2">
                  <Textarea
                    rows={5}
                    value={tools.command.text}
                    onChange={(event) => store.setCommandText(event.target.value)}
                    onKeyDown={(event) => {
                      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                        event.preventDefault();
                        void store.runCommandConsole();
                      }
                    }}
                    placeholder="최근 plan 목록 보여줘"
                    className="font-mono text-xs"
                  />
                  <div className="flex flex-wrap gap-1">
                    {COMMAND_EXAMPLES.map((example) => (
                      <Button key={example} variant="ghost" size="sm" onClick={() => store.setCommandText(example)} disabled={tools.command.running}>
                        <Wand2 size={13} aria-hidden="true" /> {example}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="min-w-0 rounded-md bg-background/60 p-2">
                  {tools.command.result ? (
                    <div className="space-y-2">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <Badge tone={tools.command.result.status === "success" ? "success" : "destructive"}>{tools.command.result.status}</Badge>
                        <Badge tone="outline" className="font-mono">{formatDateTimeMs(tools.command.result.ranAtMs)}</Badge>
                        {tools.command.result.durationMs !== null ? <Badge tone="outline">{formatDurationMs(tools.command.result.durationMs)}</Badge> : null}
                      </div>
                      <p className="truncate rounded bg-muted/40 px-2 py-1 font-mono text-[11px] text-muted-foreground">{tools.command.result.input}</p>
                      <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words rounded bg-muted/40 p-2 font-mono text-[11px] text-muted-foreground">
                        {tools.command.result.output}
                      </pre>
                    </div>
                  ) : (
                    <p className="py-8 text-center text-xs text-muted-foreground">명령을 실행하면 백엔드 라우터 결과가 표시됩니다.</p>
                  )}
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <History size={13} className="shrink-0" aria-hidden="true" />
                  <span>최근 실행</span>
                </div>
                <div className="grid grid-cols-1 gap-1 md:grid-cols-2">
                  {tools.command.history.slice(0, 4).map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      className="flex min-w-0 items-center gap-2 rounded-md bg-background/50 px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent/60"
                      onClick={() => store.setCommandText(entry.input)}
                    >
                      <Badge tone={entry.status === "success" ? "success" : "destructive"} className="shrink-0">{entry.status}</Badge>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-mono">{entry.input}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">{entry.output}</span>
                      </span>
                    </button>
                  ))}
                  {tools.command.history.length === 0 ? <p className="py-3 text-center text-xs text-muted-foreground md:col-span-2">최근 실행 없음</p> : null}
                </div>
              </div>
            </div>

            <div className="min-w-0 space-y-3 rounded-md border border-border bg-muted/20 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <CalendarClock size={16} className="shrink-0 text-primary" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">Cron</p>
                    <p className="truncate text-xs text-muted-foreground">스케줄러 상태·job 생성·실행 기록을 관리합니다.</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="outline" size="sm" onClick={store.loadCronStatus} disabled={!canRequest || tools.cron.loading}>
                    {tools.cron.loading ? <Spinner size={14} /> : <RefreshCcw size={14} aria-hidden="true" />} 상태
                  </Button>
                  <Button variant="outline" size="sm" onClick={store.loadCronJobs} disabled={!canRequest || tools.cron.loading}>
                    목록
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => void store.wakeCron()} disabled={!canRequest || tools.cron.waking} title="due 상태인 job 즉시 평가">
                    {tools.cron.waking ? <Spinner size={14} /> : <AlarmClock size={14} aria-hidden="true" />} 깨우기
                  </Button>
                  <Button variant={tools.cron.showAddForm ? "secondary" : "primary"} size="sm" onClick={store.toggleCronAddForm} disabled={!canRequest}>
                    {tools.cron.showAddForm ? <X size={14} aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />} {tools.cron.showAddForm ? "닫기" : "추가"}
                  </Button>
                </div>
              </div>
              {tools.cron.lastError ? <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{tools.cron.lastError}</p> : null}
              {tools.cron.lastActionMessage ? (
                <p className="flex items-center gap-1.5 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">
                  <Info size={13} className="shrink-0" aria-hidden="true" /> {tools.cron.lastActionMessage}
                </p>
              ) : null}
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-md bg-background/60 px-2 py-1.5">
                  <p className="text-[11px] text-muted-foreground">enabled</p>
                  <p className="truncate text-sm font-semibold">{tools.cron.status?.enabled ? "on" : "off"}</p>
                </div>
                <div className="rounded-md bg-background/60 px-2 py-1.5">
                  <p className="text-[11px] text-muted-foreground">jobs</p>
                  <p className="font-mono text-sm font-semibold tabular-nums">{tools.cron.status?.jobCount ?? tools.cron.jobs.length}</p>
                </div>
                <div className="rounded-md bg-background/60 px-2 py-1.5">
                  <p className="text-[11px] text-muted-foreground">next wake</p>
                  <p className="truncate text-sm font-semibold">{formatDateTimeMs(tools.cron.status?.nextWakeAtMs || null)}</p>
                </div>
              </div>

              {tools.cron.showAddForm ? (
                <CronAddForm form={tools.cron.form} mutating={tools.cron.mutating} canRequest={canRequest} onField={store.setCronFormField} onSubmit={store.submitCronJob} />
              ) : null}

              <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
                {tools.cron.jobs.map((job) => {
                  const selected = tools.cron.selectedJobId === job.id;
                  return (
                    <div
                      key={job.id}
                      className={cn(
                        "group flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1.5 text-xs transition-colors",
                        selected ? "bg-primary/10 text-foreground" : "bg-background/50 hover:bg-accent/60"
                      )}
                    >
                      <button
                        type="button"
                        title={job.enabled ? "사용 중 · 클릭하면 비활성화" : "비활성 · 클릭하면 활성화"}
                        aria-label={job.enabled ? "cron job 비활성화" : "cron job 활성화"}
                        className={cn(
                          "flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors active:scale-[0.96]",
                          job.enabled ? "text-success hover:bg-success/15" : "text-muted-foreground hover:bg-accent"
                        )}
                        onClick={() => store.toggleCronJobEnabled(job.id, !job.enabled)}
                        disabled={!canRequest || tools.cron.mutating}
                      >
                        <Power size={13} aria-hidden="true" />
                      </button>
                      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => store.setCronSelectedJob(job.id)}>
                        <span className="block truncate font-medium">{job.name || job.id}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">{job.scheduleSummary} · {job.payloadSummary}</span>
                      </button>
                      {job.lastRunStatus ? <Badge tone={tone(job.lastRunStatus)} className="hidden shrink-0 lg:inline-flex">{job.lastRunStatus}</Badge> : null}
                      <button
                        type="button"
                        title="실행 기록"
                        aria-label="cron 실행 기록 보기"
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-[0.96]"
                        onClick={() => store.loadCronRuns(job.id)}
                        disabled={!canRequest || tools.cron.runsLoading}
                      >
                        <History size={13} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        title="삭제"
                        aria-label="cron job 삭제"
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive active:scale-[0.96]"
                        onClick={() => void store.removeCronJob(job.id)}
                        disabled={!canRequest || tools.cron.mutating}
                      >
                        <Trash2 size={13} aria-hidden="true" />
                      </button>
                    </div>
                  );
                })}
                {tools.cron.jobs.length === 0 ? <p className="py-4 text-center text-xs text-muted-foreground">Cron job 없음</p> : null}
              </div>

              {tools.cron.runsJobId ? (
                <div className="space-y-1.5 rounded-md border border-border bg-background/50 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="flex min-w-0 items-center gap-1.5 text-xs font-semibold">
                      <History size={13} className="shrink-0 text-primary" aria-hidden="true" />
                      <span className="truncate">실행 기록 · {tools.cron.jobs.find((job) => job.id === tools.cron.runsJobId)?.name || tools.cron.runsJobId}</span>
                    </p>
                    <button type="button" aria-label="실행 기록 닫기" className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground" onClick={store.closeCronRuns}>
                      <X size={13} aria-hidden="true" />
                    </button>
                  </div>
                  <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
                    {tools.cron.runsLoading ? (
                      <p className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground"><Spinner size={13} /> 기록 조회 중</p>
                    ) : tools.cron.runs.length === 0 ? (
                      <p className="py-3 text-center text-xs text-muted-foreground">실행 기록 없음</p>
                    ) : (
                      tools.cron.runs.map((run, index) => (
                        <div key={`${run.ts}-${index}`} className="rounded bg-muted/40 px-2 py-1 text-[11px]">
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex min-w-0 items-center gap-1.5">
                              <Badge tone={run.error ? "destructive" : tone(run.status || run.action)} className="shrink-0">{run.status || run.action || "run"}</Badge>
                              <span className="truncate text-muted-foreground">{formatDateTimeMs(run.runAtMs ?? run.ts)}</span>
                            </span>
                            <span className="shrink-0 font-mono tabular-nums text-muted-foreground">{formatDurationMs(run.durationMs)}</span>
                          </div>
                          {run.error || run.summary ? <p className="mt-0.5 truncate text-muted-foreground">{run.error || run.summary}</p> : null}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0 flex-1 text-xs text-muted-foreground">
                  <span className="truncate">
                    {tools.cron.lastResult
                      ? `${tools.cron.lastResult.jobId || "-"} · ${tools.cron.lastResult.ran ? "ran" : tools.cron.lastResult.reason || tools.cron.lastResult.error || "not ran"}`
                      : `마지막 실행: ${formatDurationMs(tools.cron.jobs.find((job) => job.id === tools.cron.selectedJobId)?.lastDurationMs || null)}`}
                  </span>
                </div>
                <Button variant="destructive" size="sm" onClick={store.runSelectedCronJob} disabled={!canRequest || !tools.cron.selectedJobId || tools.cron.running}>
                  {tools.cron.running ? <Spinner size={14} /> : <Play size={14} aria-hidden="true" />} Run
                </Button>
              </div>
            </div>

            <div className="min-w-0 space-y-3 rounded-md border border-border bg-muted/20 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Network size={16} className="shrink-0 text-primary" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">Nodes</p>
                    <p className="truncate text-xs text-muted-foreground">연결 node와 pairing 요청을 관리합니다.</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="outline" size="sm" onClick={store.loadNodesSnapshot} disabled={!canRequest || tools.nodes.loading}>
                    {tools.nodes.loading ? <Spinner size={14} /> : <RefreshCcw size={14} aria-hidden="true" />} 상태
                  </Button>
                  <Button variant="outline" size="sm" onClick={store.loadNodesPending} disabled={!canRequest || tools.nodes.loading}>
                    pending
                  </Button>
                  <Button variant="ghost" size="sm" onClick={store.describeSelectedNode} disabled={!canRequest || !tools.nodes.selectedNodeId || tools.nodes.loading} title="선택 node 상세 새로고침">
                    <Info size={14} aria-hidden="true" /> describe
                  </Button>
                </div>
              </div>
              {tools.nodes.lastError ? <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{tools.nodes.lastError}</p> : null}
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-md bg-background/60 px-2 py-1.5">
                  <p className="text-[11px] text-muted-foreground">adapter</p>
                  <p className="truncate text-sm font-semibold">{tools.nodes.snapshot?.adapter || "-"}</p>
                </div>
                <div className="rounded-md bg-background/60 px-2 py-1.5">
                  <p className="text-[11px] text-muted-foreground">nodes</p>
                  <p className="font-mono text-sm font-semibold tabular-nums">{tools.nodes.snapshot?.nodes.length || 0}</p>
                </div>
                <div className="rounded-md bg-background/60 px-2 py-1.5">
                  <p className="text-[11px] text-muted-foreground">pending</p>
                  <p className="font-mono text-sm font-semibold tabular-nums">{tools.nodes.snapshot?.pendingRequests.length || 0}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <select className={cn(SELECT_CLASS, "w-full")} value={tools.nodes.selectedNodeId} onChange={(event) => store.setNodesField("selectedNodeId", event.target.value)}>
                  {(tools.nodes.snapshot?.nodes || []).map((node) => <option key={node.nodeId} value={node.nodeId}>{node.label || node.nodeId}</option>)}
                </select>
                <select className={cn(SELECT_CLASS, "w-full")} value={tools.nodes.invokeCommand} onChange={(event) => store.setNodesField("invokeCommand", event.target.value)}>
                  {((tools.nodes.snapshot?.nodes || []).find((node) => node.nodeId === tools.nodes.selectedNodeId)?.commands || [tools.nodes.invokeCommand].filter(Boolean)).map((command) => (
                    <option key={command} value={command}>{command}</option>
                  ))}
                </select>
              </div>
              <Textarea rows={3} value={tools.nodes.invokeParamsJson} onChange={(event) => store.setNodesField("invokeParamsJson", event.target.value)} placeholder='{"message":"ok"}' className="font-mono text-xs" />
              <div className="max-h-32 space-y-1 overflow-y-auto pr-1">
                {(tools.nodes.snapshot?.pendingRequests || []).map((request) => (
                  <div key={request.requestId} className="flex min-w-0 items-center gap-2 rounded-md bg-background/50 px-2 py-1.5 text-xs">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono">{request.requestId}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">{request.nodeLabel} · {request.status}</span>
                    </span>
                    <Button variant="outline" size="sm" onClick={() => store.approveNodeRequest(request.requestId)} disabled={!canRequest || tools.nodes.loading}>승인</Button>
                    <Button variant="ghost" size="sm" onClick={() => store.rejectNodeRequest(request.requestId)} disabled={!canRequest || tools.nodes.loading}>거절</Button>
                  </div>
                ))}
                {tools.nodes.snapshot && tools.nodes.snapshot.pendingRequests.length === 0 ? <p className="py-3 text-center text-xs text-muted-foreground">pending 요청 없음</p> : null}
              </div>
              <Button variant="destructive" size="sm" onClick={store.invokeSelectedNodeCommand} disabled={!canRequest || !tools.nodes.selectedNodeId || !tools.nodes.invokeCommand || tools.nodes.loading}>
                {tools.nodes.loading ? <Spinner size={14} /> : <Send size={14} aria-hidden="true" />} Invoke
              </Button>

              <div className="space-y-2 rounded-md border border-border bg-background/50 p-2.5">
                <p className="flex items-center gap-1.5 text-xs font-semibold">
                  <Bell size={13} className="shrink-0 text-primary" aria-hidden="true" /> 선택 node에 알림 보내기
                </p>
                <Input value={tools.nodes.notifyTitle} placeholder="알림 제목" onChange={(event) => store.setNodesField("notifyTitle", event.target.value)} />
                <Textarea rows={2} value={tools.nodes.notifyBody} placeholder="알림 본문" onChange={(event) => store.setNodesField("notifyBody", event.target.value)} className="text-xs" />
                <div className="grid grid-cols-2 gap-2">
                  <select className={cn(SELECT_CLASS, "w-full")} value={tools.nodes.notifyPriority} onChange={(event) => store.setNodesField("notifyPriority", event.target.value)}>
                    <option value="passive">passive</option>
                    <option value="active">active</option>
                    <option value="timeSensitive">timeSensitive</option>
                  </select>
                  <select className={cn(SELECT_CLASS, "w-full")} value={tools.nodes.notifyDelivery} onChange={(event) => store.setNodesField("notifyDelivery", event.target.value)}>
                    <option value="auto">auto</option>
                    <option value="system">system</option>
                    <option value="overlay">overlay</option>
                  </select>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => void store.notifySelectedNode()}
                  disabled={!canRequest || !tools.nodes.selectedNodeId || (!tools.nodes.notifyTitle.trim() && !tools.nodes.notifyBody.trim()) || tools.nodes.loading}
                >
                  {tools.nodes.loading ? <Spinner size={14} /> : <Bell size={14} aria-hidden="true" />} 알림 전송
                </Button>
              </div>
            </div>

            <div className="min-w-0 space-y-3 rounded-md border border-border bg-muted/20 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Send size={16} className="shrink-0 text-primary" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">Telegram Stub</p>
                    <p className="truncate text-xs text-muted-foreground">텔레그램 명령 라우팅을 stub 채널로 확인합니다.</p>
                  </div>
                </div>
                <Badge tone={tools.telegram.result?.ok ? "success" : tools.telegram.result ? "destructive" : "outline"}>
                  {tools.telegram.result?.status || "idle"}
                </Badge>
              </div>
              {tools.telegram.lastError ? <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{tools.telegram.lastError}</p> : null}
              <Textarea
                rows={4}
                value={tools.telegram.text}
                onChange={(event) => store.setTelegramStubText(event.target.value)}
                placeholder="/llm status"
                className="font-mono text-xs"
              />
              <Button variant="primary" size="sm" onClick={store.sendTelegramStubCommand} disabled={!canRequest || !tools.telegram.text.trim() || tools.telegram.sending}>
                {tools.telegram.sending ? <Spinner size={14} /> : <Send size={14} aria-hidden="true" />} 전송
              </Button>
              {tools.telegram.result ? (
                <div className="space-y-2 rounded-md bg-background/60 p-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-1">
                    <Badge tone={tools.telegram.result.ok ? "success" : "destructive"}>{tools.telegram.result.status}</Badge>
                    {tools.telegram.result.retryRequired ? <Badge tone="warning">{tools.telegram.result.retryAction || "retry"}</Badge> : null}
                    {tools.telegram.result.guardCategory ? <Badge tone="outline">{tools.telegram.result.guardCategory}</Badge> : null}
                  </div>
                  <p className="line-clamp-5 whitespace-pre-wrap break-words text-xs text-muted-foreground">{tools.telegram.result.response || tools.telegram.result.error || "응답 없음"}</p>
                </div>
              ) : (
                <p className="rounded-md bg-background/60 px-3 py-6 text-center text-xs text-muted-foreground">명령을 전송하면 응답이 여기에 표시됩니다.</p>
              )}
            </div>

            <div className="min-w-0 space-y-3 rounded-md border border-border bg-muted/20 p-3 xl:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <ShieldAlert size={16} className="shrink-0 text-primary" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">Guard Retry Timeline</p>
                    <p className="truncate text-xs text-muted-foreground">chat/coding/telegram 재시도 가드 집계를 읽기 전용으로 확인합니다.</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {guardSnapshot ? <Badge tone="outline">{guardSnapshot.windowMinutes}m</Badge> : null}
                  <Button variant="outline" size="sm" onClick={() => void store.loadGuardRetryTimeline()} disabled={!canRequest || tools.guard.loading}>
                    {tools.guard.loading ? <Spinner size={14} /> : <RefreshCcw size={14} aria-hidden="true" />} 새로고침
                  </Button>
                </div>
              </div>
              {tools.guard.lastError ? <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{tools.guard.lastError}</p> : null}
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-md bg-background/60 px-2 py-1.5">
                  <p className="text-[11px] text-muted-foreground">samples</p>
                  <p className="font-mono text-sm font-semibold tabular-nums">{guardTotalSamples}</p>
                </div>
                <div className="rounded-md bg-background/60 px-2 py-1.5">
                  <p className="text-[11px] text-muted-foreground">retry</p>
                  <p className="font-mono text-sm font-semibold tabular-nums">{guardRetryRequired}</p>
                </div>
                <div className="rounded-md bg-background/60 px-2 py-1.5">
                  <p className="text-[11px] text-muted-foreground">generated</p>
                  <p className="truncate text-sm font-semibold">{formatDateTimeUtc(guardSnapshot?.generatedAtUtc || "")}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
                {(guardSnapshot?.channels || []).map((channel) => (
                  <div key={channel.channel} className="min-w-0 rounded-md border border-border bg-background/50 p-2">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-semibold">{channel.channel}</span>
                      <Badge tone={channel.retryRequiredSamples > 0 ? "warning" : "success"}>
                        {channel.retryRequiredSamples}/{channel.totalSamples}
                      </Badge>
                    </div>
                    <div className="mb-2 flex flex-wrap gap-1">
                      <Badge tone="outline">max {channel.maxRetryAttempt}/{channel.maxRetryMaxAttempts || "-"}</Badge>
                      {channel.lastRetryStopReason && channel.lastRetryStopReason !== "-" ? <Badge tone="outline" className="max-w-full truncate">{channel.lastRetryStopReason}</Badge> : null}
                    </div>
                    <div className="max-h-32 space-y-1 overflow-y-auto pr-1">
                      {channel.buckets.slice(0, 6).map((bucket) => (
                        <div key={`${channel.channel}-${bucket.bucketStartUtc}`} className="rounded bg-muted/40 px-2 py-1 text-[11px]">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate">{formatDateTimeUtc(bucket.bucketStartUtc)}</span>
                            <span className="shrink-0 font-mono tabular-nums">{bucket.retryRequiredCount}/{bucket.samples}</span>
                          </div>
                          {bucket.topRetryStopReason && bucket.topRetryStopReason !== "-" ? (
                            <p className="truncate text-muted-foreground">{bucket.topRetryStopReason}</p>
                          ) : null}
                        </div>
                      ))}
                      {channel.buckets.length === 0 ? <p className="py-3 text-center text-xs text-muted-foreground">최근 bucket 없음</p> : null}
                    </div>
                  </div>
                ))}
                {guardSnapshot && guardSnapshot.channels.length === 0 ? <p className="py-4 text-center text-xs text-muted-foreground lg:col-span-3">timeline 채널 없음</p> : null}
                {!guardSnapshot ? <p className="py-4 text-center text-xs text-muted-foreground lg:col-span-3">새로고침하면 guard retry 집계가 표시됩니다.</p> : null}
              </div>
            </div>

            <div className="min-w-0 space-y-3 rounded-md border border-border bg-muted/20 p-3 xl:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <FileSearch size={16} className="shrink-0 text-primary" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">문맥 · 파일</p>
                    <p className="truncate text-xs text-muted-foreground">프로젝트 지침, 명령 템플릿, setup 상태, workspace 파일 preview를 읽기 전용으로 확인합니다.</p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-1">
                  <Button variant="outline" size="sm" onClick={store.loadProjectContext} disabled={!canRequest || tools.context.loading}>
                    {tools.context.loading ? <Spinner size={14} /> : <RefreshCcw size={14} aria-hidden="true" />} 문맥
                  </Button>
                  <Button variant="outline" size="sm" onClick={store.loadCommandTemplates} disabled={!canRequest || tools.context.commandsLoading}>
                    {tools.context.commandsLoading ? <Spinner size={14} /> : <ListChecks size={14} aria-hidden="true" />} 명령
                  </Button>
                  <Button variant="outline" size="sm" onClick={store.loadSetupState} disabled={!canRequest || tools.context.setupLoading}>
                    {tools.context.setupLoading ? <Spinner size={14} /> : <ShieldCheck size={14} aria-hidden="true" />} setup
                  </Button>
                  <Button variant="outline" size="sm" onClick={store.loadMetrics} disabled={!canRequest || tools.context.setupLoading}>
                    metrics
                  </Button>
                </div>
              </div>
              {tools.context.lastError ? <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{tools.context.lastError}</p> : null}
              <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                <div className="rounded-md bg-background/60 px-2 py-1.5">
                  <p className="text-[11px] text-muted-foreground">instructions</p>
                  <p className="font-mono text-sm font-semibold tabular-nums">{tools.context.project?.sources.length || 0}</p>
                </div>
                <div className="rounded-md bg-background/60 px-2 py-1.5">
                  <p className="text-[11px] text-muted-foreground">skills</p>
                  <p className="font-mono text-sm font-semibold tabular-nums">{tools.context.project?.skills.length || 0}</p>
                </div>
                <div className="rounded-md bg-background/60 px-2 py-1.5">
                  <p className="text-[11px] text-muted-foreground">commands</p>
                  <p className="font-mono text-sm font-semibold tabular-nums">{tools.context.commands?.items.length ?? tools.context.project?.commands.length ?? 0}</p>
                </div>
                <div className="rounded-md bg-background/60 px-2 py-1.5">
                  <p className="text-[11px] text-muted-foreground">providers</p>
                  <p className="truncate text-sm font-semibold">
                    {[tools.context.setup?.groqApiKeySet, tools.context.setup?.geminiApiKeySet, tools.context.setup?.cerebrasApiKeySet, tools.context.setup?.nvidiaApiKeySet, tools.context.setup?.codexApiKeySet].filter(Boolean).length}
                  </p>
                </div>
                <div className="rounded-md bg-background/60 px-2 py-1.5">
                  <p className="text-[11px] text-muted-foreground">external</p>
                  <p className="truncate text-sm font-semibold">{tools.context.setup?.externalDashboardEnabled ? "on" : "off"}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                <div className="min-w-0 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                    <FileSearch size={13} className="shrink-0" aria-hidden="true" />
                    <span className="truncate">instruction sources</span>
                  </div>
                  <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
                    {(tools.context.project?.sources || []).slice(0, 30).map((source) => (
                      <div key={`${source.order}-${source.path}`} className="rounded-md bg-background/50 px-2 py-1.5 text-xs">
                        <p className="truncate font-mono">{source.path}</p>
                        <p className="truncate text-[11px] text-muted-foreground">{source.scope} · order {source.order}</p>
                      </div>
                    ))}
                    {tools.context.project && tools.context.project.sources.length === 0 ? <p className="py-4 text-center text-xs text-muted-foreground">지침 소스 없음</p> : null}
                    {!tools.context.project ? <p className="py-4 text-center text-xs text-muted-foreground">문맥을 조회하면 지침 소스가 표시됩니다.</p> : null}
                  </div>
                </div>
                <div className="min-w-0 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                    <ListChecks size={13} className="shrink-0" aria-hidden="true" />
                    <span className="truncate">command templates</span>
                  </div>
                  <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
                    {(tools.context.commands?.items || tools.context.project?.commands || []).slice(0, 30).map((command) => (
                      <div key={`${command.scope}-${command.name}-${command.path}`} className="rounded-md bg-background/50 px-2 py-1.5 text-xs">
                        <p className="truncate font-medium">{command.name}</p>
                        <p className="truncate text-[11px] text-muted-foreground">{command.summary || command.description || command.path}</p>
                      </div>
                    ))}
                    {(tools.context.commands || tools.context.project) && (tools.context.commands?.items.length ?? tools.context.project?.commands.length ?? 0) === 0 ? (
                      <p className="py-4 text-center text-xs text-muted-foreground">명령 템플릿 없음</p>
                    ) : null}
                    {!tools.context.commands && !tools.context.project ? <p className="py-4 text-center text-xs text-muted-foreground">명령을 조회하면 템플릿이 표시됩니다.</p> : null}
                  </div>
                </div>
                <div className="min-w-0 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                    <ShieldCheck size={13} className="shrink-0" aria-hidden="true" />
                    <span className="truncate">setup state</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    {[
                      ["Telegram", tools.context.setup?.telegramBotTokenSet && tools.context.setup?.telegramChatIdSet],
                      ["Groq", tools.context.setup?.groqApiKeySet],
                      ["Gemini", tools.context.setup?.geminiApiKeySet],
                      ["Cerebras", tools.context.setup?.cerebrasApiKeySet],
                      ["NVIDIA", tools.context.setup?.nvidiaApiKeySet],
                      ["Codex", tools.context.setup?.codexApiKeySet]
                    ].map(([label, enabled]) => (
                      <div key={String(label)} className="flex min-w-0 items-center justify-between gap-2 rounded-md bg-background/50 px-2 py-1.5 text-xs">
                        <span className="truncate">{label}</span>
                        <Badge tone={enabled ? "success" : "outline"}>{enabled ? "set" : "empty"}</Badge>
                      </div>
                    ))}
                  </div>
                  <p className="truncate rounded-md bg-background/50 px-2 py-1.5 text-[11px] text-muted-foreground">
                    {tools.context.setup?.dashboardExternalUrls[0] || "setup 상태를 조회하면 외부 URL이 표시됩니다."}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(320px,440px)_minmax(0,1fr)]">
                <div className="min-w-0 space-y-2 rounded-md border border-border bg-background/50 p-2.5">
                  <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <FolderOpen size={15} className="shrink-0 text-primary" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold">Workspace browser</p>
                        <p className="truncate font-mono text-[11px] text-muted-foreground">{workspacePath?.displayPath || "워크스페이스"}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Badge tone="outline">{workspaceDirectoryCount} dirs</Badge>
                      <Badge tone="outline">{workspaceFileCount} files</Badge>
                    </div>
                  </div>
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                    <Input
                      value={tools.context.logicBrowsePath}
                      placeholder="browse path"
                      onChange={(event) => store.setLogicPathField("logicBrowsePath", event.target.value)}
                      className="font-mono text-xs"
                    />
                    <Button variant="outline" size="sm" onClick={() => store.loadLogicPath(tools.context.logicBrowsePath, "workspace")} disabled={!canRequest || tools.context.loading}>
                      {tools.context.loading ? <Spinner size={14} /> : <FolderOpen size={14} aria-hidden="true" />} 열기
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Button variant="ghost" size="sm" onClick={() => store.loadLogicPath("", "workspace")} disabled={!canRequest || tools.context.loading}>
                      <FolderOpen size={13} aria-hidden="true" /> root
                    </Button>
                    {workspacePath?.parentBrowsePath ? (
                      <Button variant="ghost" size="sm" onClick={() => store.loadLogicPath(workspacePath.parentBrowsePath || "", "workspace")} disabled={!canRequest || tools.context.loading}>
                        <CornerDownRight size={13} aria-hidden="true" /> 상위
                      </Button>
                    ) : null}
                    <Button variant="ghost" size="sm" onClick={store.loadProjectContext} disabled={!canRequest || tools.context.loading}>
                      <RefreshCcw size={13} aria-hidden="true" /> 문맥 갱신
                    </Button>
                  </div>
                  <div className="relative">
                    <Search size={14} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                    <Input
                      value={tools.context.workspaceSearch}
                      placeholder="현재 폴더·문맥·최근 파일 검색"
                      onChange={(event) => store.setWorkspaceSearch(event.target.value)}
                      className="pl-7"
                    />
                  </div>
                  <div className="max-h-80 space-y-1 overflow-y-auto pr-1">
                    {filteredWorkspaceCandidates.map((candidate) => (
                      <button
                        key={candidate.key}
                        type="button"
                        className="flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent/60 active:scale-[0.99]"
                        onClick={() => candidate.isDirectory ? store.loadLogicPath(candidate.browsePath, "workspace") : store.openWorkspaceFile(candidate.path)}
                      >
                        {candidate.isDirectory ? (
                          <FolderOpen size={14} className="shrink-0 text-primary" aria-hidden="true" />
                        ) : (
                          <FileText size={14} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{candidate.name}</span>
                          <span className="block truncate font-mono text-[11px] text-muted-foreground">{compactPath(candidate.path)}</span>
                        </span>
                        <Badge tone={candidate.isDirectory ? "primary" : candidate.source === "직접" ? "warning" : "outline"} className="shrink-0">{candidate.source}</Badge>
                      </button>
                    ))}
                    {filteredWorkspaceCandidates.length === 0 ? (
                      <div className="rounded-md bg-muted/30 px-3 py-6 text-center">
                        <FolderOpen size={18} className="mx-auto mb-2 text-muted-foreground" aria-hidden="true" />
                        <p className="text-xs text-muted-foreground">검색 결과가 없습니다.</p>
                        <Button variant="ghost" size="sm" className="mt-2" onClick={() => store.loadLogicPath("", "workspace")} disabled={!canRequest || tools.context.loading}>
                          workspace root 열기
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="min-w-0 space-y-2 rounded-md border border-border bg-background/50 p-2.5">
                  <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <FileSearch size={15} className="shrink-0 text-primary" aria-hidden="true" />
                      <span className="truncate text-xs font-semibold">Workspace preview</span>
                    </div>
                    <Button variant="outline" size="sm" onClick={store.readWorkspaceFile} disabled={!canRequest || !tools.context.filePath.trim() || tools.context.readingFile}>
                      {tools.context.readingFile ? <Spinner size={14} /> : <FileSearch size={14} aria-hidden="true" />} 읽기
                    </Button>
                  </div>
                  <Input value={tools.context.filePath} placeholder="workspace 상대/절대 파일 경로" onChange={(event) => store.setWorkspaceFilePath(event.target.value)} className="font-mono text-xs" />
                  {tools.context.filePreview ? (
                    <div className="space-y-2">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <Badge tone={tools.context.filePreview.ok ? "success" : "destructive"}>{tools.context.filePreview.ok ? "ok" : "fail"}</Badge>
                        <span className="min-w-0 flex-1 truncate font-mono text-xs">{tools.context.filePreview.path || tools.context.filePreview.message}</span>
                      </div>
                      <pre className="max-h-[26rem] overflow-y-auto whitespace-pre-wrap break-words rounded bg-muted/40 p-2 font-mono text-[11px] text-muted-foreground">
                        {tools.context.filePreview.content || tools.context.filePreview.message || "내용 없음"}
                      </pre>
                    </div>
                  ) : (
                    <div className="rounded-md bg-muted/30 px-3 py-10 text-center">
                      <FileText size={18} className="mx-auto mb-2 text-muted-foreground" aria-hidden="true" />
                      <p className="text-xs text-muted-foreground">파일을 선택하거나 경로를 입력하면 preview가 표시됩니다.</p>
                    </div>
                  )}
                  {tools.context.metrics ? (
                    <div className="rounded-md bg-background/60 p-2">
                      <p className="truncate text-xs font-semibold">metrics</p>
                      <pre className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[11px] text-muted-foreground">{tools.context.metrics.raw}</pre>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </CardBoundary>
      </section>
    </div>
  );
}
