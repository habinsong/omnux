import { useState } from "react";
import { RefreshCcw, Send, Trash2 } from "lucide-react";
import { Button, Input, Spinner, Textarea, cn } from "../../components/ui/primitives";
import { statusLabel, statusTone } from "../../components/ui/status-tone";
import { useOpsPageStore } from "./ops-store";
import { baseName, formatBytes, formatDuration, formatEpoch, formatUtc, shortPath, type OpsPanelId } from "./ops-view";

/* ============================================================================
   상태 화면의 각 칸 본문.
   모든 칸이 같은 모양을 쓴다: 한 줄 요약 → 목록 → 조작.
   숫자 타일을 늘어놓지 않고, 못 누르는 버튼 옆에는 이유를 적는다.
   ============================================================================ */

export function OpsPanelBody({ id }: { id: OpsPanelId }) {
  if (id === "doctor") return <DoctorPanel />;
  if (id === "plans") return <PlansPanel />;
  if (id === "git") return <GitPanel />;
  if (id === "schedule") return <SchedulePanel />;
  if (id === "devices") return <DevicesPanel />;
  if (id === "alerts") return <AlertsPanel />;
  if (id === "context") return <ContextPanel />;
  if (id === "cleanup") return <CleanupPanel />;
  return <CommandPanel />;
}

/* -- 공통 조각 ------------------------------------------------------------ */

function Head({ children }: { children: React.ReactNode }) {
  return <p className="min-w-0 break-words text-sm font-medium">{children}</p>;
}

function Note({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "danger" }) {
  return (
    <p
      className={cn(
        "min-w-0 break-words text-[11px]",
        tone === "danger" ? "rounded-md bg-destructive/10 px-2 py-1.5 text-destructive" : "text-muted-foreground"
      )}
    >
      {children}
    </p>
  );
}

function Rows({ children, empty }: { children: React.ReactNode; empty: string }) {
  const has = Array.isArray(children) ? children.length > 0 : Boolean(children);
  if (!has) return <Note>{empty}</Note>;
  return <ul className="min-w-0 divide-y divide-border rounded-lg border border-border">{children}</ul>;
}

function Row({
  name,
  detail,
  status,
  title,
  right
}: {
  name: string;
  detail?: string;
  status?: string;
  title?: string;
  right?: React.ReactNode;
}) {
  return (
    <li className="flex min-w-0 items-start gap-2 px-2.5 py-1.5" title={title}>
      <span className="min-w-0 flex-1">
        <span className="block min-w-0 break-words text-xs">{name}</span>
        {detail ? <span className="block min-w-0 break-words text-[11px] text-muted-foreground">{detail}</span> : null}
      </span>
      {status ? <Chip status={status} /> : null}
      {right ? <span className="flex shrink-0 items-center gap-1">{right}</span> : null}
    </li>
  );
}

function Chip({ status }: { status: string }) {
  const tone = statusTone(status);
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
        tone === "destructive" && "bg-destructive/15 text-destructive",
        tone === "warning" && "bg-warning/15 text-warning",
        tone === "success" && "bg-success/15 text-success",
        (tone === "default" || tone === "primary") && "bg-muted text-muted-foreground"
      )}
    >
      {statusLabel(status)}
    </span>
  );
}

function Actions({ children, reason }: { children: React.ReactNode; reason?: string }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      {children}
      {reason ? <span className="min-w-0 break-words text-[11px] text-muted-foreground">{reason}</span> : null}
    </div>
  );
}

/* -- 환경 진단 ------------------------------------------------------------ */

function DoctorPanel() {
  const doctor = useOpsPageStore((state) => state.doctor);
  const store = useOpsPageStore;
  const busy = doctor.loading || doctor.running || doctor.fixPreviewing || doctor.fixApplying;
  const report = doctor.report;
  const autoCount = doctor.fixResult?.actions.filter((action) => action.autoApply).length ?? 0;
  const canApply = !busy && doctor.fixResult?.action === "preview" && Boolean(doctor.fixResult?.previewId) && autoCount > 0;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Actions>
        <Button size="sm" variant="outline" onClick={() => store.getState().loadDoctorLast()} disabled={busy}>
          {doctor.loading ? <Spinner size={12} /> : null} 최근 보고서
        </Button>
        <Button size="sm" variant="primary" onClick={() => store.getState().runDoctor()} disabled={busy}>
          {doctor.running ? <Spinner size={12} /> : null} 진단 실행
        </Button>
      </Actions>

      {doctor.lastError ? <Note tone="danger">{doctor.lastError}</Note> : null}

      {report === null ? (
        <Note>{doctor.found === false ? "저장된 보고서가 없습니다. 진단을 실행하세요." : "보고서를 아직 받지 못했습니다."}</Note>
      ) : (
        <>
          <Head>
            정상 {report.okCount} · 주의 {report.warnCount} · 실패 {report.failCount} · 건너뜀 {report.skipCount}
          </Head>
          <Note>{formatUtc(report.createdAtUtc)} 기준</Note>
          <Rows empty="점검 항목이 없습니다.">
            {report.checks.map((check) => (
              <Row key={`${check.id}-${check.status}`} name={check.id || "점검"} detail={check.summary || check.detail} status={check.status} />
            ))}
          </Rows>
        </>
      )}

      <div className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-border bg-muted/20 p-2.5">
        <Head>자동 수정</Head>
        <Note>먼저 미리보기로 무엇을 바꾸는지 확인합니다. 자동 적용 가능한 항목이 있을 때만 적용됩니다.</Note>
        <Actions reason={canApply ? "" : "미리보기를 먼저 만드세요."}>
          <Button size="sm" variant="outline" onClick={() => store.getState().previewDoctorFix()} disabled={busy}>
            {doctor.fixPreviewing ? <Spinner size={12} /> : null} 미리보기
          </Button>
          <Button size="sm" variant="destructive" onClick={() => void store.getState().applyDoctorFix()} disabled={!canApply}>
            {doctor.fixApplying ? <Spinner size={12} /> : null} 적용
          </Button>
        </Actions>
        {doctor.fixResult ? (
          <>
            <Note>{doctor.fixResult.message || doctor.fixResult.error || "결과 없음"}</Note>
            <Rows empty="수정 후보가 없습니다.">
              {doctor.fixResult.actions.map((action) => (
                <Row
                  key={action.actionId}
                  name={action.description || action.actionId}
                  detail={`${action.target || action.kind} · ${action.autoApply ? "자동" : "수동"}`}
                  status={action.status || action.kind}
                />
              ))}
            </Rows>
          </>
        ) : null}
      </div>
    </div>
  );
}

/* -- 계획·작업 ------------------------------------------------------------ */

function PlansPanel() {
  const ops = useOpsPageStore((state) => state.ops);
  const store = useOpsPageStore;
  const busy = ops.loadingPlans || ops.loadingTaskGraphs;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Actions>
        <Button size="sm" variant="outline" onClick={() => store.getState().loadOpsSnapshot()} disabled={busy}>
          {busy ? <Spinner size={12} /> : <RefreshCcw size={12} aria-hidden="true" />} 다시 조회
        </Button>
      </Actions>
      {ops.lastError ? <Note tone="danger">{ops.lastError}</Note> : null}
      <Head>
        계획 {ops.planCount}개 · 작업 흐름 {ops.taskGraphCount}개
      </Head>
      <Note>
        최근 계획: {ops.latestPlanTitle || (busy ? "조회 중" : "없음")}
        {ops.latestTaskGraphStatus ? ` · 최근 흐름 ${statusLabel(ops.latestTaskGraphStatus)}` : ""}
      </Note>
    </div>
  );
}

/* -- Git ------------------------------------------------------------------ */

const OPERATIONS = [
  { value: "stage_and_commit", label: "선택 파일 커밋" },
  { value: "snapshot_commit", label: "스냅샷 커밋" },
  { value: "create_branch", label: "브랜치 만들기" },
  { value: "push_current_branch", label: "현재 브랜치 push" },
  { value: "open_pull_request", label: "PR 만들기" }
] as const;

const SELECT =
  "h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60";

function GitPanel() {
  const git = useOpsPageStore((state) => state.git);
  const store = useOpsPageStore;
  const snapshot = git.snapshot;
  const operation = git.form.operation;
  const isCommit = operation === "stage_and_commit" || operation === "snapshot_commit";

  const previewReason = missingGitInput(git);
  const applyReason = gitApplyReason(git);

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Actions>
        <Button size="sm" variant="outline" onClick={() => store.getState().loadGitAutomation()} disabled={git.loading}>
          {git.loading ? <Spinner size={12} /> : <RefreshCcw size={12} aria-hidden="true" />} 다시 조회
        </Button>
      </Actions>
      {git.lastError ? <Note tone="danger">{git.lastError}</Note> : null}

      {snapshot === null ? (
        <Note>다시 조회하면 git 상태가 나옵니다.</Note>
      ) : (
        <>
          <Head>
            {snapshot.branchName || "브랜치 없음"} · {snapshot.isClean ? "변경 없음" : `변경 ${snapshot.changedFileCount}개`}
          </Head>
          <Note>
            스테이지 {snapshot.stagedFileCount} · 수정 {snapshot.unstagedFileCount} · 새 파일 {snapshot.untrackedFileCount}
            {snapshot.conflictedFileCount > 0 ? ` · 충돌 ${snapshot.conflictedFileCount}` : ""}
          </Note>
        </>
      )}

      <label className="flex min-w-0 flex-col gap-1 text-[11px]">
        작업 종류
        <select
          className={SELECT}
          value={operation}
          onChange={(event) =>
            store.getState().setGitOperation((OPERATIONS.find((entry) => entry.value === event.target.value)?.value ?? "stage_and_commit") as typeof operation)
          }
        >
          {OPERATIONS.map((entry) => (
            <option key={entry.value} value={entry.value}>
              {entry.label}
            </option>
          ))}
        </select>
      </label>

      {isCommit ? (
        <Input
          className="h-8 text-xs"
          value={git.form.commitMessage}
          aria-label="커밋 메시지"
          placeholder="커밋 메시지"
          onChange={(event) => store.getState().setGitField("commitMessage", event.target.value)}
        />
      ) : null}
      {operation === "create_branch" ? (
        <Input
          className="h-8 text-xs"
          value={git.form.branchName}
          aria-label="새 브랜치 이름"
          placeholder="새 브랜치 이름"
          onChange={(event) => store.getState().setGitField("branchName", event.target.value)}
        />
      ) : null}
      {operation === "open_pull_request" ? (
        <>
          <Input
            className="h-8 text-xs"
            value={git.form.pullRequestTitle}
            aria-label="PR 제목"
            placeholder="PR 제목"
            onChange={(event) => store.getState().setGitField("pullRequestTitle", event.target.value)}
          />
          <Input
            className="h-8 text-xs"
            value={git.form.baseBranchName}
            aria-label="기준 브랜치"
            placeholder="기준 브랜치"
            onChange={(event) => store.getState().setGitField("baseBranchName", event.target.value)}
          />
        </>
      ) : null}

      {isCommit && snapshot !== null ? (
        <div className="flex min-w-0 flex-col gap-1">
          <Note>커밋할 파일 · 선택 {git.selectedPaths.length}개</Note>
          <div className="max-h-40 min-w-0 overflow-y-auto rounded-lg border border-border">
            {snapshot.files.map((file) => (
              <label
                key={file.path}
                title={file.path}
                className="flex min-w-0 items-center gap-2 border-b border-border px-2.5 py-1.5 text-[11px] last:border-0 hover:bg-accent/40"
              >
                <input
                  type="checkbox"
                  className="h-3 w-3 shrink-0 accent-primary"
                  checked={git.selectedPaths.includes(file.path)}
                  onChange={() => store.getState().toggleGitPath(file.path)}
                />
                <span className="min-w-0 flex-1 truncate font-mono">{shortPath(file.path, 4)}</span>
                <span className="shrink-0 text-muted-foreground">
                  +{file.addedLines}/-{file.deletedLines}
                </span>
              </label>
            ))}
            {snapshot.files.length === 0 ? <p className="px-2.5 py-3 text-[11px] text-muted-foreground">변경된 파일이 없습니다.</p> : null}
          </div>
        </div>
      ) : null}

      <Actions reason={previewReason}>
        <Button size="sm" variant="primary" onClick={() => store.getState().previewGitOperation()} disabled={git.previewing || previewReason.length > 0}>
          {git.previewing ? <Spinner size={12} /> : null} 미리보기
        </Button>
      </Actions>

      {git.preview ? (
        <div className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-border bg-muted/20 p-2.5">
          <Note>실행될 명령</Note>
          {git.preview.plannedCommands.map((command, index) => (
            <p key={`${command.display}-${index}`} className="min-w-0 break-all rounded bg-background/60 px-2 py-1 font-mono text-[11px] text-muted-foreground">
              {command.display}
            </p>
          ))}
          {git.preview.blockers.length > 0 ? (
            <Note tone="danger">{git.preview.blockers.join(" · ")}</Note>
          ) : null}
          <Actions reason={applyReason || "미리보기가 승인되어 적용할 수 있습니다."}>
            <Button size="sm" variant="destructive" onClick={() => void store.getState().applyGitPreview()} disabled={git.applying || applyReason.length > 0}>
              {git.applying ? <Spinner size={12} /> : null} 적용
            </Button>
          </Actions>
        </div>
      ) : null}

      {git.applyResult ? (
        <Rows empty="실행한 명령이 없습니다.">
          {git.applyResult.executedCommands.map((command, index) => (
            <Row
              key={`${command.executable}-${index}`}
              name={command.executable}
              detail={command.stdOut || command.stdErr || ""}
              status={command.exitCode === 0 ? "ok" : "failed"}
            />
          ))}
        </Rows>
      ) : null}
    </div>
  );
}

function missingGitInput(git: ReturnType<typeof useOpsPageStore.getState>["git"]): string {
  const form = git.form;
  if (form.operation === "stage_and_commit") {
    if (form.commitMessage.trim().length === 0) return "커밋 메시지를 입력하세요.";
    if (git.selectedPaths.length === 0) return "커밋할 파일을 고르세요.";
    return "";
  }
  if (form.operation === "snapshot_commit") return form.commitMessage.trim().length === 0 ? "커밋 메시지를 입력하세요." : "";
  if (form.operation === "create_branch") return form.branchName.trim().length === 0 ? "브랜치 이름을 입력하세요." : "";
  if (form.operation === "open_pull_request") return form.pullRequestTitle.trim().length === 0 ? "PR 제목을 입력하세요." : "";
  return "";
}

function gitApplyReason(git: ReturnType<typeof useOpsPageStore.getState>["git"]): string {
  const preview = git.preview;
  if (preview === null) return "먼저 미리보기를 만드세요.";
  if (!preview.ok) return "미리보기가 실패했습니다.";
  if (preview.blockers.length > 0) return "막는 조건이 남아 있습니다.";
  if (!preview.previewId || !preview.approval?.confirmationToken) return "승인 토큰이 없습니다.";
  return "";
}

/* -- 예약 작업 ------------------------------------------------------------ */

function SchedulePanel() {
  const cron = useOpsPageStore((state) => state.tools.cron);
  const store = useOpsPageStore;
  const busy = cron.loading || cron.mutating || cron.running || cron.waking;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Actions>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            store.getState().loadCronStatus();
            store.getState().loadCronJobs();
          }}
          disabled={busy}
        >
          {cron.loading ? <Spinner size={12} /> : <RefreshCcw size={12} aria-hidden="true" />} 다시 조회
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void store.getState().wakeCron()} disabled={busy}>
          {cron.waking ? <Spinner size={12} /> : null} 지금 평가
        </Button>
      </Actions>
      {cron.lastError ? <Note tone="danger">{cron.lastError}</Note> : null}
      {cron.lastActionMessage ? <Note>{cron.lastActionMessage}</Note> : null}

      <Head>
        {cron.status?.enabled ? "켜짐" : "꺼짐"} · 작업 {cron.status?.jobCount ?? cron.jobs.length}개
      </Head>
      <Note>다음 평가 {formatEpoch(cron.status?.nextWakeAtMs ?? null)}</Note>

      <Rows empty="등록된 예약 작업이 없습니다.">
        {cron.jobs.map((job) => (
          <Row
            key={job.id}
            name={job.name || job.id}
            detail={`${job.scheduleSummary} · 다음 ${formatEpoch(job.nextRunAtMs)}`}
            status={job.lastRunStatus}
            right={
              <Button
                size="sm"
                variant="ghost"
                aria-label="실행 기록"
                title="실행 기록"
                onClick={() => store.getState().loadCronRuns(job.id)}
                disabled={busy}
              >
                기록
              </Button>
            }
          />
        ))}
      </Rows>

      {cron.runsJobId ? (
        <div className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-border bg-muted/20 p-2.5">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <Note>실행 기록 · {cron.runsJobId}</Note>
            <Button size="sm" variant="ghost" onClick={() => store.getState().closeCronRuns()}>
              닫기
            </Button>
          </div>
          <Rows empty="실행 기록이 없습니다.">
            {cron.runs.map((entry, index) => (
              <Row
                key={`${entry.jobId}-${entry.ts}-${index}`}
                name={formatEpoch(entry.runAtMs ?? entry.ts)}
                detail={`${entry.summary || entry.action} · ${formatDuration(entry.durationMs)}`}
                status={entry.status}
              />
            ))}
          </Rows>
        </div>
      ) : null}
    </div>
  );
}

/* -- 장치 ----------------------------------------------------------------- */

function DevicesPanel() {
  const nodes = useOpsPageStore((state) => state.tools.nodes);
  const store = useOpsPageStore;
  const snapshot = nodes.snapshot;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Actions>
        <Button size="sm" variant="outline" onClick={() => store.getState().loadNodesSnapshot()} disabled={nodes.loading}>
          {nodes.loading ? <Spinner size={12} /> : <RefreshCcw size={12} aria-hidden="true" />} 다시 조회
        </Button>
      </Actions>
      {nodes.lastError ? <Note tone="danger">{nodes.lastError}</Note> : null}

      <Head>
        장치 {snapshot?.nodes.length ?? 0}개 · 대기 {snapshot?.pendingRequests.length ?? 0}건
      </Head>

      <Rows empty="대기 중인 페어링 요청이 없습니다.">
        {(snapshot?.pendingRequests ?? []).map((request) => (
          <Row
            key={request.requestId}
            name={request.nodeLabel || request.requestId}
            detail={request.requestId}
            status={request.status}
            right={
              <>
                <Button size="sm" variant="outline" onClick={() => void store.getState().approveNodeRequest(request.requestId)} disabled={nodes.loading}>
                  승인
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void store.getState().rejectNodeRequest(request.requestId)} disabled={nodes.loading}>
                  거절
                </Button>
              </>
            }
          />
        ))}
      </Rows>

      <Rows empty="연결된 장치가 없습니다.">
        {(snapshot?.nodes ?? []).map((node) => (
          <Row key={node.nodeId} name={node.label || node.nodeId} detail={node.nodeId} />
        ))}
      </Rows>
    </div>
  );
}

/* -- 재시도·경보 ---------------------------------------------------------- */

function AlertsPanel() {
  const guard = useOpsPageStore((state) => state.tools.guard);
  const store = useOpsPageStore;
  const snapshot = guard.snapshot;
  const total = snapshot?.channels.reduce((sum, channel) => sum + channel.totalSamples, 0) ?? 0;
  const retry = snapshot?.channels.reduce((sum, channel) => sum + channel.retryRequiredSamples, 0) ?? 0;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Actions>
        <Button size="sm" variant="outline" onClick={() => void store.getState().loadGuardRetryTimeline()} disabled={guard.loading}>
          {guard.loading ? <Spinner size={12} /> : <RefreshCcw size={12} aria-hidden="true" />} 다시 조회
        </Button>
      </Actions>
      {guard.lastError ? <Note tone="danger">{guard.lastError}</Note> : null}

      <Head>
        표본 {total}건 · 재시도 필요 {retry}건
      </Head>
      <Note>{snapshot ? `최근 ${snapshot.windowMinutes}분 · ${formatUtc(snapshot.generatedAtUtc)}` : "아직 조회 전"}</Note>

      <Rows empty="재시도 집계가 없습니다.">
        {(snapshot?.channels ?? []).map((channel) => (
          <Row
            key={channel.channel}
            name={channel.channel}
            detail={`최대 시도 ${channel.maxRetryAttempt}/${channel.maxRetryMaxAttempts || "-"}`}
            status={channel.retryRequiredSamples > 0 ? "warning" : "ok"}
          />
        ))}
      </Rows>

      <div className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-border bg-muted/20 p-2.5">
        <Head>경보 전송 점검</Head>
        <Note>보낼 주소는 앱에 저장하지 않고 환경변수만 씁니다.</Note>
        <Textarea
          rows={4}
          spellCheck={false}
          className="font-mono text-[11px]"
          value={guard.eventJson}
          aria-label="보낼 경보 이벤트"
          onChange={(event) => store.getState().setGuardAlertEventJson(event.target.value)}
        />
        <Actions>
          <Button size="sm" variant="outline" onClick={() => store.getState().resetGuardAlertEventJson()} disabled={guard.dispatching}>
            예시로 되돌리기
          </Button>
          <Button
            size="sm"
            variant="primary"
            onClick={() => void store.getState().dispatchGuardAlert()}
            disabled={guard.dispatching || guard.eventJson.trim().length === 0}
          >
            {guard.dispatching ? <Spinner size={12} /> : <Send size={12} aria-hidden="true" />} 시험 전송
          </Button>
        </Actions>
        {guard.dispatchError ? <Note tone="danger">{guard.dispatchError}</Note> : null}
        {guard.dispatchResult ? (
          <Rows empty="대상이 없습니다.">
            {guard.dispatchResult.targets.map((target) => (
              <Row key={target.name} name={target.name} detail={target.endpoint || "주소 없음"} status={target.status} />
            ))}
          </Rows>
        ) : null}
      </div>
    </div>
  );
}

/* -- 문맥·파일 ------------------------------------------------------------ */

function ContextPanel() {
  const context = useOpsPageStore((state) => state.tools.context);
  const store = useOpsPageStore;
  const path = context.logicPath;
  const [query, setQuery] = useState("");

  const entries = (path?.items ?? []).filter((item) =>
    query.trim().length === 0 ? true : `${item.name} ${item.selectPath}`.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Actions>
        <Button size="sm" variant="outline" onClick={() => store.getState().loadProjectContext()} disabled={context.loading}>
          {context.loading ? <Spinner size={12} /> : <RefreshCcw size={12} aria-hidden="true" />} 지침
        </Button>
        <Button size="sm" variant="ghost" onClick={() => store.getState().loadSetupState()} disabled={context.setupLoading}>
          설정 상태
        </Button>
        <Button size="sm" variant="ghost" onClick={() => store.getState().loadLogicPath()} disabled={context.loading}>
          폴더 읽기
        </Button>
      </Actions>
      {context.lastError ? <Note tone="danger">{context.lastError}</Note> : null}

      <Head>{context.project?.projectRoot || "프로젝트 폴더 미확인"}</Head>
      <Note>
        지침 {context.project?.sources.length ?? 0}개 · 스킬 {context.project?.skills.length ?? 0}개
        {context.metrics?.summary ? ` · ${context.metrics.summary}` : ""}
      </Note>

      <Input
        className="h-8 text-xs"
        value={query}
        aria-label="파일 찾기"
        placeholder="파일 이름으로 찾기"
        onChange={(event) => setQuery(event.target.value)}
      />

      <div className="max-h-44 min-w-0 overflow-y-auto rounded-lg border border-border">
        {entries.map((item) => (
          <button
            key={item.selectPath || item.browsePath}
            type="button"
            title={item.selectPath || item.browsePath}
            onClick={() => (item.isDirectory ? store.getState().loadLogicPath(item.browsePath) : store.getState().openWorkspaceFile(item.selectPath))}
            className="flex w-full min-w-0 items-center gap-2 border-b border-border px-2.5 py-1.5 text-left text-[11px] last:border-0 hover:bg-accent/40"
          >
            <span className="min-w-0 flex-1 truncate font-mono">{item.name}</span>
            <span className="shrink-0 text-muted-foreground">{item.isDirectory ? "폴더" : baseName(item.selectPath)}</span>
          </button>
        ))}
        {entries.length === 0 ? <p className="px-2.5 py-3 text-[11px] text-muted-foreground">폴더를 읽으면 파일이 나옵니다.</p> : null}
      </div>

      {context.filePreview ? (
        <div className="flex min-w-0 flex-col gap-1">
          <Note>{context.filePreview.path}</Note>
          {context.filePreview.ok ? (
            <pre className="max-h-56 min-w-0 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/30 p-2 font-mono text-[11px]">
              {context.filePreview.content}
            </pre>
          ) : (
            <Note tone="danger">{context.filePreview.message || "파일을 읽지 못했습니다."}</Note>
          )}
        </div>
      ) : null}
    </div>
  );
}

/* -- 정리 ----------------------------------------------------------------- */

function CleanupPanel() {
  const cleanup = useOpsPageStore((state) => state.tools.cleanup);
  const store = useOpsPageStore;
  const preview = cleanup.preview;
  const canApply = Boolean(preview?.ok && preview.previewId) && !cleanup.applying && (preview?.candidates.length ?? 0) > 0;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Actions reason={preview === null ? "먼저 삭제 후보를 확인하세요." : ""}>
        <Button size="sm" variant="outline" onClick={() => store.getState().previewCleanup()} disabled={cleanup.previewing || cleanup.applying}>
          {cleanup.previewing ? <Spinner size={12} /> : <RefreshCcw size={12} aria-hidden="true" />} 삭제 후보 확인
        </Button>
        <Button size="sm" variant="destructive" onClick={() => void store.getState().applyCleanupPreview()} disabled={!canApply}>
          {cleanup.applying ? <Spinner size={12} /> : <Trash2 size={12} aria-hidden="true" />} 지우기
        </Button>
      </Actions>
      {cleanup.lastError ? <Note tone="danger">{cleanup.lastError}</Note> : null}

      {preview ? (
        <>
          <Head>
            후보 {preview.candidates.length}개 · {formatBytes(preview.totalSizeBytes)}
          </Head>
          <Rows empty="지울 것이 없습니다.">
            {preview.candidates.map((candidate) => (
              <Row
                key={candidate.path}
                name={shortPath(candidate.path, 4)}
                title={candidate.path}
                detail={`${candidate.kind} · ${formatBytes(candidate.sizeBytes)} · ${candidate.reason}`}
              />
            ))}
          </Rows>
        </>
      ) : null}

      {cleanup.applyResult ? (
        <Note>
          {cleanup.applyResult.ok ? "지움" : "실패"} · {cleanup.applyResult.removedCount}개 ·{" "}
          {formatBytes(cleanup.applyResult.removedSizeBytes)}
        </Note>
      ) : null}
    </div>
  );
}

/* -- 명령 ----------------------------------------------------------------- */

function CommandPanel() {
  const command = useOpsPageStore((state) => state.tools.command);
  const store = useOpsPageStore;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Textarea
        rows={3}
        className="font-mono text-[11px]"
        value={command.text}
        aria-label="보낼 명령"
        placeholder="최근 plan 목록 보여줘"
        onChange={(event) => store.getState().setCommandText(event.target.value)}
      />
      <Actions reason={command.text.trim().length === 0 ? "보낼 명령을 입력하세요." : ""}>
        <Button
          size="sm"
          variant="primary"
          onClick={() => void store.getState().runCommandConsole()}
          disabled={command.running || command.text.trim().length === 0}
        >
          {command.running ? <Spinner size={12} /> : <Send size={12} aria-hidden="true" />} 실행
        </Button>
      </Actions>
      {command.lastError ? <Note tone="danger">{command.lastError}</Note> : null}

      {command.result ? (
        <div className="flex min-w-0 flex-col gap-1">
          <Note>
            {statusLabel(command.result.status)} · {formatDuration(command.result.durationMs)}
          </Note>
          <pre className="max-h-56 min-w-0 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/30 p-2 font-mono text-[11px]">
            {command.result.output}
          </pre>
        </div>
      ) : null}

      {command.history.length > 0 ? (
        <Rows empty="">
          {command.history.slice(0, 5).map((entry) => (
            <Row
              key={entry.id}
              name={entry.input}
              detail={entry.output}
              status={entry.status}
              right={
                <Button size="sm" variant="ghost" onClick={() => store.getState().setCommandText(entry.input)}>
                  다시
                </Button>
              }
            />
          ))}
        </Rows>
      ) : null}
    </div>
  );
}
