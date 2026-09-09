import { useState } from "react";
import { Badge, Button, Input, Textarea, cn } from "../../components/ui/primitives";
import { statusTone } from "../../components/ui/status-tone";
import { useDesktopNavigationStore } from "../shell/navigation-store";
import { statusText, type EditableRunStep, type PlanForm, type PlanView, type RunView } from "./task-workspace-model";
import { useTaskWorkspace } from "./task-workspace-state";

/* ============================================================================
   작업 화면의 칸들: 계획 / 실행 / 단계 편집 / 결과.
   예전 화면은 <details> 를 네 겹까지 겹쳐 무엇이 열려 있는지 알 수 없었다.
   여기서는 화면이 탭으로 갈리고, 칸 안에서는 한 겹만 접는다.
   ============================================================================ */

const SELECT =
  "h-8 w-full min-w-0 rounded-md border border-border bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/60";

export function Panel({ children, footer }: { children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">{children}</div>
      {footer ? <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-2 border-t border-border p-2">{footer}</div> : null}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="block text-[11px] font-medium text-muted-foreground">{children}</span>;
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="min-w-0 break-words text-[11px] text-muted-foreground">{children}</p>;
}

function Fold({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-w-0 overflow-hidden rounded-md border border-border">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex w-full min-w-0 items-center justify-between gap-2 px-2.5 py-1.5 text-left text-[11px] font-medium outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60"
      >
        <span className="min-w-0 truncate">{title}</span>
        <span aria-hidden="true" className="shrink-0 text-muted-foreground">{open ? "−" : "+"}</span>
      </button>
      {open ? <div className="min-w-0 space-y-2 border-t border-border p-2.5">{children}</div> : null}
    </div>
  );
}

function Checklist({ title, values }: { title: string; values: string[] }) {
  if (values.length === 0) return null;
  return (
    <div className="min-w-0 space-y-0.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <ul className="min-w-0 list-inside list-disc space-y-0.5">
        {values.map((value, index) => (
          <li key={index} className="min-w-0 break-words text-[11px]">
            {value}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- 목록 ---------- */

export function TaskListPanel({ connected }: { connected: boolean }) {
  const state = useTaskWorkspace();
  const busy = Boolean(state.pending.mutation);

  return (
    <Panel
      footer={
        <Button variant="outline" size="sm" disabled={!connected || busy || Boolean(state.pending.plans)} onClick={state.refresh}>
          다시 조회
        </Button>
      }
    >
      {state.pending.plans && state.plans.length === 0 ? (
        <p className="px-3 py-8 text-center text-xs text-muted-foreground">작업 목록을 읽고 있습니다.</p>
      ) : state.plans.length === 0 ? (
        <p className="px-3 py-8 text-center text-xs text-muted-foreground">저장된 작업이 없습니다. 「새 작업」으로 계획을 만드세요.</p>
      ) : (
        <ul className="min-w-0 divide-y divide-border">
          {state.plans.map((plan) => (
            <li key={plan.id} className="min-w-0">
              <button
                type="button"
                disabled={!connected || busy}
                onClick={() => state.openPlan(plan.id)}
                className={cn(
                  "flex w-full min-w-0 items-center gap-2 px-3 py-2.5 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60",
                  plan.id === state.planId && "bg-accent"
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium">{plan.title}</span>
                  <span className="block truncate text-[10px] text-muted-foreground">{plan.objective}</span>
                </span>
                <Badge tone={statusTone(plan.status)}>{statusText(plan.status)}</Badge>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ---------- 새 계획 작성 ---------- */

export function TaskComposerPanel({ connected }: { connected: boolean }) {
  const state = useTaskWorkspace();
  const busy = Boolean(state.pending.mutation);
  const draft = state.draft;
  const patch = (patchValue: Partial<typeof draft>) => useTaskWorkspace.setState((current) => ({ draft: { ...current.draft, ...patchValue } }));

  return (
    <Panel
      footer={
        <>
          <Button variant="primary" size="sm" disabled={!connected || busy || draft.objective.trim().length < 5} onClick={state.create}>
            계획 만들기
          </Button>
          <Button variant="ghost" size="sm" onClick={() => useTaskWorkspace.setState({ composer: false })}>
            그만두기
          </Button>
        </>
      }
    >
      <div className="min-w-0 space-y-3 p-3">
        <label className="block min-w-0 space-y-1">
          <Label>만들고 싶은 결과</Label>
          <Textarea
            rows={5}
            className="text-xs"
            autoFocus
            disabled={busy}
            value={draft.objective}
            placeholder="무엇을 만들거나 고칠지 적어 주세요."
            onChange={(event) => patch({ objective: event.target.value })}
          />
        </label>
        <label className="block min-w-0 space-y-1">
          <Label>지켜야 할 조건</Label>
          <Textarea
            rows={3}
            className="text-xs"
            disabled={busy}
            value={draft.constraints}
            placeholder="한 줄에 한 가지씩 적어 주세요."
            onChange={(event) => patch({ constraints: event.target.value })}
          />
        </label>
        <label className="block min-w-0 space-y-1">
          <Label>계획 방식</Label>
          <select className={SELECT} disabled={busy} value={draft.mode} onChange={(event) => patch({ mode: event.target.value as "fast" | "interview" })}>
            <option value="fast">바로 계획 작성</option>
            <option value="interview">요구사항을 더 자세히 정리</option>
          </select>
        </label>
      </div>
    </Panel>
  );
}

/* ---------- 계획 ---------- */

export function TaskPlanPanel({ plan, connected }: { plan: PlanView; connected: boolean }) {
  const state = useTaskWorkspace();
  const busy = Boolean(state.pending.mutation);
  const editing = state.editingPlan;
  const editable = !["approved", "running", "completed"].includes(plan.status);
  const [openStep, setOpenStep] = useState("");
  const update = (field: keyof PlanForm, value: string) =>
    useTaskWorkspace.setState((current) => ({ editingPlan: current.editingPlan ? { ...current.editingPlan, [field]: value } : null }));

  if (editing) {
    return (
      <Panel
        footer={
          <>
            <Button variant="primary" size="sm" disabled={!connected || busy} onClick={state.savePlan}>
              변경 저장
            </Button>
            <Button variant="ghost" size="sm" onClick={() => useTaskWorkspace.setState({ editingPlan: null })}>
              편집 취소
            </Button>
          </>
        }
      >
        <div className="min-w-0 space-y-3 p-3">
          <label className="block min-w-0 space-y-1">
            <Label>계획 이름</Label>
            <Input className="h-8 text-xs" disabled={busy} value={editing.title} onChange={(event) => update("title", event.target.value)} />
          </label>
          <label className="block min-w-0 space-y-1">
            <Label>목표</Label>
            <Textarea rows={4} className="text-xs" disabled={busy} value={editing.objective} onChange={(event) => update("objective", event.target.value)} />
          </label>
          <label className="block min-w-0 space-y-1">
            <Label>조건</Label>
            <Textarea
              rows={3}
              className="text-xs"
              disabled={busy}
              value={editing.constraints}
              placeholder="한 줄에 한 가지씩 적어 주세요."
              onChange={(event) => update("constraints", event.target.value)}
            />
          </label>
        </div>
      </Panel>
    );
  }

  return (
    <Panel
      footer={
        <>
          {plan.status !== "running" ? (
            <Button variant="primary" size="sm" disabled={!connected || busy} onClick={state.startPlan}>
              이 계획으로 실행
            </Button>
          ) : null}
          {editable ? (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() =>
                useTaskWorkspace.setState({ editingPlan: { title: plan.title, objective: plan.objective, constraints: plan.constraints.join("\n") } })
              }
            >
              계획 편집
            </Button>
          ) : null}
        </>
      }
    >
      <div className="min-w-0 space-y-3 p-3">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <h2 className="min-w-0 flex-1 break-words text-xs font-semibold">{plan.title}</h2>
          <Badge tone={statusTone(plan.status)}>{statusText(plan.status)}</Badge>
        </div>

        <p className="min-w-0 whitespace-pre-wrap break-words rounded-md bg-muted/40 p-2 text-[11px]">{plan.objective}</p>
        <Checklist title="지켜야 할 조건" values={plan.constraints} />

        <div className="min-w-0 space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">단계 {plan.steps.length}개</p>
          <ol className="min-w-0 divide-y divide-border rounded-md border border-border">
            {plan.steps.map((step, index) => {
              const id = step.id || String(index);
              const open = openStep === id;
              return (
                <li key={id} className="min-w-0">
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setOpenStep(open ? "" : id)}
                    className="flex w-full min-w-0 items-center gap-2 px-2.5 py-2 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60"
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">{index + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-[11px]">{step.title || step.description}</span>
                  </button>
                  {open ? (
                    <div className="min-w-0 space-y-2 px-2.5 pb-2.5">
                      <p className="min-w-0 whitespace-pre-wrap break-words text-[11px]">{step.description}</p>
                      <Checklist title="할 일" values={step.required} />
                      <Checklist title="피할 일" values={step.excluded} />
                      <Checklist title="확인할 것" values={step.checks} />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </div>

        {editable ? <Note>내용을 확인한 뒤 실행하면 이 계획을 승인하고 작업을 시작합니다.</Note> : null}

        {plan.review ? (
          <div className="min-w-0 space-y-2 rounded-md border border-border p-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">검토 결과</p>
            <p className="min-w-0 whitespace-pre-wrap break-words text-[11px]">{plan.review.summary}</p>
            <Checklist title="발견한 내용" values={plan.review.findings} />
            <Checklist title="주의할 점" values={plan.review.risks} />
            <Checklist title="남은 확인" values={plan.review.missing} />
            {!plan.review.recommendsApproval ? <p className="text-[11px] text-warning">검토 결과를 반영한 뒤 승인하세요.</p> : null}
            <Note>{plan.review.route}</Note>
          </div>
        ) : null}

        <Fold title="검토와 실행 설정">
          <div className="flex min-w-0 flex-wrap gap-1.5">
            {!["running", "completed"].includes(plan.status) ? (
              <Button variant="outline" size="sm" disabled={!connected || busy} onClick={() => state.request("mutation", "plan_review", { planId: plan.id })}>
                검토 요청
              </Button>
            ) : null}
            {editable ? (
              <Button variant="outline" size="sm" disabled={!connected || busy} onClick={() => state.request("mutation", "plan_approve", { planId: plan.id })}>
                승인만 하기
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              disabled={!connected || busy || plan.status === "running"}
              onClick={() => state.request("mutation", "task_graph_create", { planId: plan.id })}
            >
              실행 단계 먼저 편집
            </Button>
          </div>
        </Fold>

        {plan.execution || plan.decisions.length > 0 ? (
          <Fold title="계획 기록">
            {plan.execution ? (
              <p className="min-w-0 whitespace-pre-wrap break-words text-[11px]">
                {plan.execution.message}
                {plan.execution.summary ? `\n${plan.execution.summary}` : ""}
              </p>
            ) : null}
            {plan.decisions.length > 0 ? (
              <ul className="min-w-0 list-inside list-disc space-y-0.5">
                {plan.decisions.map((entry, index) => (
                  <li key={index} className="min-w-0 break-words text-[11px]">
                    {entry}
                  </li>
                ))}
              </ul>
            ) : null}
          </Fold>
        ) : null}
      </div>
    </Panel>
  );
}

/* ---------- 실행 ---------- */

export function TaskRunPanel({ run, connected }: { run: RunView; connected: boolean }) {
  const state = useTaskWorkspace();
  const busy = Boolean(state.pending.mutation);
  const running = run.status === "running";
  const [openStep, setOpenStep] = useState("");
  const done = run.steps.filter((step) => step.status === "completed").length;

  const start = () => {
    if (!run.attempts.length) state.request("mutation", "task_graph_run", { graphId: run.id });
    else
      state.confirm({
        title: "처음부터 실행",
        message: "새 작업 폴더에서 모든 단계를 다시 실행합니다. 이전 실행 기록은 남습니다.",
        label: "전체 실행",
        type: "task_graph_run",
        fields: { graphId: run.id }
      });
  };

  if (state.editingSteps) return <TaskStepEditor connected={connected} />;

  return (
    <Panel
      footer={
        running ? (
          <Button variant="outline" size="sm" disabled={!connected || busy || state.cancelingRun === run.id} onClick={state.stopRun}>
            {state.cancelingRun === run.id ? "중단 요청 중…" : "작업 중단"}
          </Button>
        ) : (
          <>
            {run.status !== "completed" ? (
              <Button
                variant="primary"
                size="sm"
                disabled={!connected || busy}
                onClick={() => (run.attempts.length ? state.request("mutation", "task_resume", { graphId: run.id }) : start())}
              >
                {run.attempts.length ? "남은 작업 이어가기" : "실행 시작"}
              </Button>
            ) : null}
            <Button variant="outline" size="sm" disabled={!connected || busy} onClick={start}>
              처음부터 실행
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() =>
                useTaskWorkspace.setState({
                  editingSteps: run.steps.map((step) => ({
                    ...step,
                    dependencies: [...step.dependencies],
                    skills: [...step.skills],
                    tools: [...step.tools]
                  }))
                })
              }
            >
              단계 편집
            </Button>
          </>
        )
      }
    >
      <div className="min-w-0 space-y-3 p-3">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <p className="min-w-0 truncate text-xs font-semibold">
            {done} / {run.steps.length}단계 완료
          </p>
          <Badge tone={statusTone(run.status)}>{statusText(run.status)}</Badge>
        </div>

        {/* 진행 막대. 숫자만 있으면 얼마나 남았는지 한눈에 안 들어온다. */}
        <div className="h-1.5 w-full min-w-0 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300"
            style={{ width: `${run.steps.length ? Math.round((done / run.steps.length) * 100) : 0}%` }}
          />
        </div>

        {running ? <Note>{run.steps.find((step) => step.status === "running")?.title || "다음 단계를 준비하고 있습니다."}</Note> : null}

        <ol className="min-w-0 divide-y divide-border rounded-md border border-border">
          {run.steps.map((step, index) => {
            const open = openStep === step.id;
            return (
              <li key={step.id} className="min-w-0">
                <div className="flex min-w-0 items-center gap-2 px-2.5 py-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">{index + 1}</span>
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setOpenStep(open ? "" : step.id)}
                    className="min-w-0 flex-1 truncate text-left text-[11px] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/60"
                  >
                    {step.title}
                  </button>
                  <Badge tone={statusTone(step.status)}>{statusText(step.status)}</Badge>
                </div>
                {open ? (
                  <div className="min-w-0 space-y-2 px-2.5 pb-2.5">
                    <p className="min-w-0 whitespace-pre-wrap break-words text-[11px]">{step.prompt}</p>
                    {step.dependencies.length > 0 ? (
                      <Note>선행 단계: {step.dependencies.map((id) => run.steps.find((entry) => entry.id === id)?.title || id).join(", ")}</Note>
                    ) : null}
                    {step.artifact ? <p className="min-w-0 break-all font-mono text-[10px] text-muted-foreground">{step.artifact}</p> : null}
                    {step.summary || step.error ? (
                      <pre className="max-h-40 min-w-0 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 p-2 font-mono text-[10px]">
                        {step.error || step.summary}
                      </pre>
                    ) : null}
                    <div className="flex min-w-0 flex-wrap gap-1.5">
                      <Button variant="outline" size="sm" disabled={!connected} onClick={() => state.readOutput(step.id)}>
                        {step.error ? "오류 확인" : "결과 보기"}
                      </Button>
                      {["failed", "canceled"].includes(step.status) ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={!connected || busy}
                          onClick={() => state.request("mutation", "task_retry", { graphId: run.id, taskId: step.id })}
                        >
                          이 단계만 다시
                        </Button>
                      ) : null}
                      {["running", "pending", "blocked"].includes(step.status) ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={!connected || busy}
                          onClick={() => state.request("mutation", "task_cancel", { graphId: run.id, taskId: step.id })}
                        >
                          이 단계만 중단
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      </div>
    </Panel>
  );
}

/* ---------- 결과 ---------- */

export function TaskOutputPanel({ run }: { run: RunView | null }) {
  const state = useTaskWorkspace();
  const output = state.output;
  const attempts = run?.attempts.filter((attempt) => attempt.stepId === state.outputStep) || [];
  const selected = run?.steps.find((step) => step.id === state.outputStep);

  if (!state.outputStep) {
    return (
      <Panel>
        <p className="px-3 py-8 text-center text-xs text-muted-foreground">「실행」에서 단계의 결과 보기를 누르면 여기에 나옵니다.</p>
      </Panel>
    );
  }

  return (
    <Panel
      footer={
        output?.conversationId ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              useDesktopNavigationStore.getState().setActivePage("build", { conversationId: output.conversationId, mode: "orchestration" })
            }
          >
            이 작업 파일 열기
          </Button>
        ) : null
      }
    >
      <div className="min-w-0 space-y-3 p-3">
        <h3 className="min-w-0 truncate text-xs font-semibold">{selected?.title || state.outputStep}</h3>

        {attempts.length > 1 ? (
          <label className="block min-w-0 space-y-1">
            <Label>실행 기록</Label>
            <select
              className={SELECT}
              value={state.outputTime ?? ""}
              onChange={(event) => state.readOutput(state.outputStep, event.target.value ? Number(event.target.value) : undefined)}
            >
              <option value="">최신 실행</option>
              {attempts.map((attempt, index) => (
                <option key={attempt.started} value={Date.parse(attempt.started)}>
                  {index + 1}회 · {statusText(attempt.status)} · {new Date(attempt.started).toLocaleString("ko-KR")}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {state.pending.output ? (
          <Note>출력을 읽고 있습니다.</Note>
        ) : output?.stepId === state.outputStep ? (
          <>
            {state.outputTime !== null || !["completed", "ok"].includes(output.status) ? (
              <Badge tone={statusTone(output.status)}>{statusText(output.status)}</Badge>
            ) : null}
            {output.files.length > 0 ? (
              <ul className="min-w-0 space-y-0.5" aria-label="결과 파일">
                {output.files.map((file) => (
                  <li key={file} title={file} className="min-w-0 truncate font-mono text-[10px] text-muted-foreground">
                    {file.split(/[\\/]/).pop()}
                  </li>
                ))}
              </ul>
            ) : null}
            {output.resultOutput ? (
              <pre aria-label="프로그램 출력" className="max-h-60 min-w-0 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 p-2 font-mono text-[10px]">
                {output.resultOutput}
              </pre>
            ) : null}
            {output.resultError ? (
              <pre aria-label="프로그램 오류" className="max-h-60 min-w-0 overflow-auto whitespace-pre-wrap break-words rounded-md bg-destructive/10 p-2 font-mono text-[10px] text-destructive">
                {output.resultError}
              </pre>
            ) : null}
            <Fold title="자세한 실행 기록">
              <pre aria-label="실행 로그" className="max-h-60 min-w-0 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 p-2 font-mono text-[10px]">
                {output.stdout || "기록된 출력이 없습니다."}
              </pre>
              {output.stderr ? (
                <pre aria-label="상세 오류" className="max-h-60 min-w-0 overflow-auto whitespace-pre-wrap break-words rounded-md bg-destructive/10 p-2 font-mono text-[10px] text-destructive">
                  {output.stderr}
                </pre>
              ) : null}
            </Fold>
          </>
        ) : null}
      </div>
    </Panel>
  );
}

/* ---------- 단계 편집 ---------- */

const CATEGORIES: Record<string, string> = {
  coding: "코딩",
  refactor: "코드 수정",
  documentation: "문서 작성",
  verification: "검증",
  research: "조사",
  review: "검토",
  writing: "글쓰기",
  ops: "운영"
};

function TaskStepEditor({ connected }: { connected: boolean }) {
  const state = useTaskWorkspace();
  const steps = state.editingSteps || [];
  const busy = Boolean(state.pending.mutation);
  const [openId, setOpenId] = useState(steps[0]?.id || "");

  const update = (id: string, patch: Partial<EditableRunStep>) =>
    useTaskWorkspace.setState((current) => ({ editingSteps: current.editingSteps?.map((step) => (step.id === id ? { ...step, ...patch } : step)) || null }));
  const add = () =>
    useTaskWorkspace.setState((current) => ({
      editingSteps: [
        ...(current.editingSteps || []),
        {
          id: `step_${globalThis.crypto?.randomUUID?.() || Date.now()}`,
          title: "",
          category: "coding",
          prompt: "",
          dependencies: [],
          skills: [],
          tools: [],
          status: "pending",
          summary: "",
          error: "",
          artifact: ""
        }
      ]
    }));
  const remove = (id: string) =>
    useTaskWorkspace.setState((current) => ({
      editingSteps:
        current.editingSteps
          ?.filter((step) => step.id !== id)
          .map((step) => ({ ...step, dependencies: step.dependencies.filter((dependency) => dependency !== id) })) || null
    }));

  return (
    <Panel
      footer={
        <>
          <Button variant="primary" size="sm" disabled={!connected || busy} onClick={state.saveSteps}>
            단계 저장
          </Button>
          <Button variant="outline" size="sm" disabled={busy} onClick={add}>
            단계 추가
          </Button>
          <Button variant="ghost" size="sm" onClick={() => useTaskWorkspace.setState({ editingSteps: null })}>
            편집 취소
          </Button>
        </>
      }
    >
      <ul className="min-w-0 divide-y divide-border">
        {steps.map((step, index) => {
          const open = openId === step.id;
          return (
            <li key={step.id} className="min-w-0">
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpenId(open ? "" : step.id)}
                className="flex w-full min-w-0 items-center gap-2 px-3 py-2 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60"
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">{index + 1}</span>
                <span className="min-w-0 flex-1 truncate text-[11px]">{step.title || "이름 없는 단계"}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">{CATEGORIES[step.category] || step.category}</span>
              </button>
              {open ? (
                <div className="min-w-0 space-y-2 px-3 pb-3">
                  <label className="block min-w-0 space-y-1">
                    <Label>단계 이름</Label>
                    <Input className="h-8 text-xs" disabled={busy} value={step.title} onChange={(event) => update(step.id, { title: event.target.value })} />
                  </label>
                  <label className="block min-w-0 space-y-1">
                    <Label>작업 종류</Label>
                    <select className={SELECT} disabled={busy} value={step.category} onChange={(event) => update(step.id, { category: event.target.value })}>
                      {Object.entries(CATEGORIES).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                      {!CATEGORIES[step.category] ? <option value={step.category}>{step.category}</option> : null}
                    </select>
                  </label>
                  <label className="block min-w-0 space-y-1">
                    <Label>실행 내용</Label>
                    <Textarea rows={3} className="text-xs" disabled={busy} value={step.prompt} onChange={(event) => update(step.id, { prompt: event.target.value })} />
                  </label>

                  <div className="min-w-0 space-y-1">
                    <Label>먼저 끝나야 하는 단계</Label>
                    {steps.length < 2 ? (
                      <Note>다른 단계를 추가하면 연결할 수 있습니다.</Note>
                    ) : (
                      <div className="flex min-w-0 flex-wrap gap-1.5">
                        {steps
                          .filter((candidate) => candidate.id !== step.id)
                          .map((candidate) => {
                            const on = step.dependencies.includes(candidate.id);
                            return (
                              <button
                                key={candidate.id}
                                type="button"
                                aria-pressed={on}
                                disabled={busy}
                                onClick={() =>
                                  update(step.id, {
                                    dependencies: on
                                      ? step.dependencies.filter((id) => id !== candidate.id)
                                      : [...step.dependencies, candidate.id]
                                  })
                                }
                                className={cn(
                                  "max-w-full truncate rounded-full px-2.5 py-1 text-[11px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60",
                                  on ? "bg-primary/12 text-primary" : "text-muted-foreground hover:bg-accent"
                                )}
                              >
                                {candidate.title || "이름 없는 단계"}
                              </button>
                            );
                          })}
                      </div>
                    )}
                  </div>

                  <div className="grid min-w-0 gap-2 sm:grid-cols-2">
                    <label className="block min-w-0 space-y-1">
                      <Label>스킬</Label>
                      <Input
                        className="h-8 text-xs"
                        disabled={busy}
                        value={step.skillsInput ?? step.skills.join(", ")}
                        onChange={(event) => update(step.id, { skillsInput: event.target.value })}
                      />
                    </label>
                    <label className="block min-w-0 space-y-1">
                      <Label>도구</Label>
                      <Input
                        className="h-8 text-xs"
                        disabled={busy}
                        value={step.toolsInput ?? step.tools.join(", ")}
                        onChange={(event) => update(step.id, { toolsInput: event.target.value })}
                      />
                    </label>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    disabled={busy}
                    onClick={() => remove(step.id)}
                  >
                    이 단계 삭제
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
        {steps.length === 0 ? <li className="px-3 py-8 text-center text-xs text-muted-foreground">단계가 없습니다. 「단계 추가」를 누르세요.</li> : null}
      </ul>
    </Panel>
  );
}
