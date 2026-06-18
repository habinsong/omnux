import { useEffect, useMemo } from "react";
import { AlertTriangle, CheckCircle2, ClipboardList, FileText, HelpCircle, ListChecks, ListTree, Pencil, Play, Plus, RefreshCcw, Save, Search, Trash2, X, XCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { CardBoundary } from "../../CardBoundary";
import { useDesktopShellStore } from "../../shell-store";
import { useDesktopAuthStore } from "../auth/auth-store";
import { useUiLogStore } from "../ui-log/ui-log-store";
import { usePlanningPageBridge, usePlanningStore, type EditableTaskNode, type PlanDetail } from "./planning-store";
import { Badge, Button, Input, Textarea, cn } from "../../components/ui/primitives";

const DETAIL_LABEL = "text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground";
const CATEGORY_SUGGESTIONS = ["coding", "research", "review", "verification", "writing", "ops"];

function DetailList({ label, items, tone }: { label: string; items: string[]; tone?: "default" | "warning" | "destructive" }) {
  if (items.length === 0) return null;
  const dot = tone === "destructive" ? "text-destructive" : tone === "warning" ? "text-warning" : "text-muted-foreground";
  return (
    <div className="space-y-1">
      <p className={DETAIL_LABEL}>{label}</p>
      <ul className="space-y-0.5">
        {items.map((item, index) => (
          <li key={index} className="flex gap-1.5 text-[11px] text-muted-foreground">
            <span className={cn("shrink-0", dot)} aria-hidden="true">·</span>
            <span className="min-w-0 break-words">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PlanDetailView({ detail }: { detail: PlanDetail | null }) {
  if (!detail) return null;
  const { steps, review, decisionLog, execution } = detail;
  if (steps.length === 0 && !review && decisionLog.length === 0 && !execution) return null;
  return (
    <div className="space-y-3 border-t border-border pt-3">
      {review ? (
        <div className="space-y-2 rounded-md border border-border bg-muted/30 p-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold">
              <Search size={13} className="shrink-0 text-primary" aria-hidden="true" /> 리뷰 상세
            </p>
            <Badge tone={review.approvedRecommendation ? "success" : "warning"}>
              {review.approvedRecommendation ? "승인 권장" : "보완 필요"}
            </Badge>
            {review.reviewerRoute ? <Badge tone="outline" className="font-mono">{review.reviewerRoute}</Badge> : null}
          </div>
          {review.summary ? <p className="text-[11px] text-muted-foreground">{review.summary}</p> : null}
          <DetailList label="발견 사항" items={review.findings} />
          <DetailList label="위험" items={review.risks} tone="warning" />
          <DetailList label="빠진 검증" items={review.missingVerification} tone="destructive" />
        </div>
      ) : null}

      {steps.length > 0 ? (
        <div className="space-y-1.5">
          <p className={DETAIL_LABEL}>단계 {steps.length}</p>
          <div className="space-y-1.5">
            {steps.map((step, index) => (
              <div key={step.stepId || index} className="rounded-md border border-border bg-card/50 p-2">
                <p className="truncate text-xs font-medium">{index + 1}. {step.title || step.stepId}</p>
                {step.description ? <p className="mt-0.5 text-[11px] text-muted-foreground">{step.description}</p> : null}
                <div className="mt-1 space-y-1">
                  <DetailList label="해야 할 일" items={step.mustDo} />
                  <DetailList label="하지 말 것" items={step.mustNotDo} tone="warning" />
                  <DetailList label="검증" items={step.verification} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {execution ? (
        <div className="space-y-1 rounded-md border border-border bg-muted/30 p-2.5">
          <div className="flex items-center gap-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold">
              <Play size={13} className="shrink-0 text-primary" aria-hidden="true" /> 실행
            </p>
            <Badge tone={/(completed|done|ok)/i.test(execution.status) ? "success" : /(failed|error)/i.test(execution.status) ? "destructive" : "primary"}>
              {execution.status || "-"}
            </Badge>
          </div>
          {execution.message ? <p className="text-[11px] text-muted-foreground">{execution.message}</p> : null}
          {execution.resultSummary ? <p className="rounded bg-background/60 px-2 py-1 text-[11px] text-muted-foreground">{execution.resultSummary}</p> : null}
        </div>
      ) : null}

      <DetailList label="결정 로그" items={decisionLog} />
    </div>
  );
}

function TaskGraphEditor({ nodes }: { nodes: EditableTaskNode[] }) {
  const store = usePlanningStore();
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 rounded-md border border-warning/30 bg-warning/10 px-2.5 py-1.5 text-[11px] text-warning">
        <AlertTriangle size={13} className="shrink-0" aria-hidden="true" /> 구조를 저장하면 실행 기록·진행 상태가 초기화되고 Draft로 돌아갑니다.
      </p>
      {nodes.map((node) => (
        <div key={node.taskId} className="space-y-2 rounded-md border border-border bg-card/60 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[11px] text-muted-foreground">{node.taskId}</span>
            <button
              type="button"
              aria-label="작업 삭제"
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              onClick={() => store.removeTask(node.taskId)}
            >
              <Trash2 size={13} aria-hidden="true" />
            </button>
          </div>
          <Input value={node.title} placeholder="작업 제목" onChange={(event) => store.setTaskField(node.taskId, "title", event.target.value)} />
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-[11px] text-muted-foreground">분류</span>
            <Input
              value={node.category}
              list="task-category-suggestions"
              placeholder="coding"
              onChange={(event) => store.setTaskField(node.taskId, "category", event.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <Textarea rows={2} value={node.prompt} placeholder="작업 지시" onChange={(event) => store.setTaskField(node.taskId, "prompt", event.target.value)} className="text-xs" />
          {nodes.length > 1 ? (
            <div className="space-y-1">
              <p className={DETAIL_LABEL}>선행 작업</p>
              <div className="flex flex-wrap gap-1">
                {nodes.filter((other) => other.taskId !== node.taskId).map((other) => {
                  const on = node.dependsOn.includes(other.taskId);
                  return (
                    <button
                      key={other.taskId}
                      type="button"
                      onClick={() => store.toggleTaskDependency(node.taskId, other.taskId)}
                      className={cn(
                        "rounded px-1.5 py-0.5 font-mono text-[10px] transition-colors",
                        on ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
                      )}
                      title={other.title}
                    >
                      {other.taskId}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            <Input value={node.requiredSkills.join(", ")} placeholder="필요 스킬 (쉼표)" onChange={(event) => store.setTaskList(node.taskId, "requiredSkills", event.target.value)} className="h-8 text-xs" />
            <Input value={node.requiredTools.join(", ")} placeholder="필요 도구 (쉼표)" onChange={(event) => store.setTaskList(node.taskId, "requiredTools", event.target.value)} className="h-8 text-xs" />
          </div>
        </div>
      ))}
      <datalist id="task-category-suggestions">
        {CATEGORY_SUGGESTIONS.map((category) => <option key={category} value={category} />)}
      </datalist>
      <Button variant="outline" size="sm" className="w-full" onClick={store.addTask}>
        <Plus size={13} aria-hidden="true" /> 작업 추가
      </Button>
    </div>
  );
}

function CompactEmptyState({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-muted/25 px-2.5 py-2">
      <Icon size={14} className="shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0">
        <span className="block text-xs font-medium">{title}</span>
        <span className="block text-[11px] text-muted-foreground">{description}</span>
      </span>
    </div>
  );
}

function statusTone(status: string): "success" | "warning" | "destructive" | "primary" | "default" {
  const v = status.toLowerCase();
  if (/(completed|approved|done|ready)/.test(v)) return "success";
  if (/(running|review|pending)/.test(v)) return "primary";
  if (/(failed|canceled|error|rejected)/.test(v)) return "destructive";
  if (/(draft|waiting)/.test(v)) return "warning";
  return "default";
}

const PLAN_MODES = [
  { key: "fast", label: "빠른 초안", helper: "바로 계획 생성" },
  { key: "interview", label: "질문 먼저", helper: "빈 조건부터 확인" }
] as const;

const PLAN_TEMPLATES = [
  { key: "feature", label: "기능 개선", icon: FileText },
  { key: "bugfix", label: "버그 수정", icon: XCircle },
  { key: "requirements", label: "요구사항 점검", icon: HelpCircle }
] as const;

export function PlanningPage() {
  usePlanningPageBridge();
  const bridgeStatus = useDesktopShellStore((state) => state.bridge.status);
  const authStatus = useDesktopAuthStore((state) => state.auth.status);
  const recordCardError = useUiLogStore((state) => state.recordCardError);
  const store = usePlanningStore();
  const canRequest = bridgeStatus === "connected" && authStatus === "authenticated";
  const plan = store.selectedPlan;
  const graph = store.selectedGraph;
  const canEditPlan = Boolean(plan) && !/(approved|running|completed)/.test((plan?.status || "").toLowerCase());
  const createConstraints = useMemo(() => store.createConstraintsText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean), [store.createConstraintsText]);
  const checklist = useMemo(() => {
    const items: Array<{ key: string; title: string; description: string; action: "draft" | "review" | "approve" | "run" | "graph" | "browse" }> = [];
    if (store.plans.length === 0) {
      items.push({ key: "draft", title: "먼저 목표를 계획으로 만드세요.", description: "목표와 제약을 쓰면 리뷰 가능한 초안이 만들어집니다.", action: "draft" });
      return items;
    }
    if (!plan) {
      items.push({ key: "browse", title: "저장된 계획을 하나 선택하세요.", description: "상태와 리뷰 요약을 확인한 뒤 다음 단계로 넘어갑니다.", action: "browse" });
      return items;
    }
    const status = (plan.status || "").toLowerCase();
    if (!plan.reviewerSummary) items.push({ key: "review", title: "시작 전 리뷰가 필요합니다.", description: "빠진 일, 위험, 검증 포인트를 먼저 확인하세요.", action: "review" });
    if (plan.reviewerSummary && status !== "approved" && status !== "running" && status !== "completed") items.push({ key: "approve", title: "진행 여부를 확정하세요.", description: "실행해도 되는 계획인지 승인 상태로 전환합니다.", action: "approve" });
    if (status === "approved") items.push({ key: "run", title: "계획을 실행할 수 있습니다.", description: "실행 후 작업 그래프로 나눠 병렬 진행할 수 있습니다.", action: "run" });
    if (status === "approved" || status === "completed") items.push({ key: "graph", title: "작업 그래프로 나눠보세요.", description: "단계별 상태와 재시도 흐름을 관리합니다.", action: "graph" });
    if (items.length === 0) items.push({ key: "fresh", title: "현재 계획 흐름은 정리되어 있습니다.", description: "새 제약이 생기면 승인 전 계획을 수정하세요.", action: "browse" });
    return items;
  }, [plan, store.plans.length]);

  useEffect(() => {
    if (canRequest) store.load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRequest]);

  return (
    <div className="dashboard-tab space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">작업</h1>
          <p className="text-sm text-muted-foreground">목표를 계획으로 만들고, 검토한 뒤 작업 단위로 실행합니다.</p>
        </div>
        <Button variant="outline" size="sm" className="shrink-0" onClick={store.load} disabled={!canRequest || store.loading}>
          <RefreshCcw size={15} aria-hidden="true" /> {store.loading ? "조회 중" : "새로고침"}
        </Button>
      </div>
      {store.lastError ? <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{store.lastError}</p> : null}
      {store.lastMessage ? <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">{store.lastMessage}</p> : null}

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Plans */}
        <CardBoundary title="계획" card="operations" onError={recordCardError}>
          <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
            <Textarea rows={3} value={store.objectiveDraft} placeholder="목표를 적으면 계획을 생성합니다." onChange={(event) => store.setObjective(event.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              {PLAN_MODES.map((mode) => {
                const on = store.createMode === mode.key;
                return (
                  <button
                    key={mode.key}
                    type="button"
                    onClick={() => store.setCreateMode(mode.key)}
                    className={cn("rounded-md border px-3 py-2 text-left transition-colors duration-200", on ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-card/40 text-muted-foreground hover:bg-accent hover:text-foreground")}
                  >
                    <span className="block truncate text-xs font-semibold">{mode.label}</span>
                    <span className="block truncate text-[11px]">{mode.helper}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">템플릿</span>
              {PLAN_TEMPLATES.map((template) => {
                const Icon = template.icon;
                return (
                  <Button key={template.key} variant="outline" size="sm" className="h-7 px-2" onClick={() => store.applyCreateTemplate(template.key)}>
                    <Icon size={13} aria-hidden="true" /> {template.label}
                  </Button>
                );
              })}
            </div>
            <Textarea rows={3} value={store.createConstraintsText} placeholder="지켜야 할 기준을 줄 단위로 입력합니다." onChange={(event) => store.setCreateConstraintsText(event.target.value)} />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 flex-wrap gap-1">
                <Badge tone="outline">방식 {store.createMode === "interview" ? "질문 먼저" : "빠른 초안"}</Badge>
                <Badge tone="outline">기준 {createConstraints.length}</Badge>
              </div>
              <Button variant="primary" size="sm" onClick={store.createPlan} disabled={!canRequest || store.pending || store.objectiveDraft.trim().length < 5}>
                <ClipboardList size={14} aria-hidden="true" /> 계획 생성
              </Button>
            </div>
          </div>
          <div className="space-y-2 rounded-md border border-border bg-card/50 p-3">
            <div className="flex items-center gap-2">
              <ListChecks size={15} className="shrink-0 text-muted-foreground" aria-hidden="true" />
              <b className="text-sm">다음 액션</b>
            </div>
            <div className="space-y-1">
              {checklist.map((item) => (
                <article key={item.key} className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-2">
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium">{item.title}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">{item.description}</span>
                  </span>
                  {item.action === "review" ? <Button variant="ghost" size="sm" className="h-7 px-2" onClick={store.reviewPlan} disabled={!canRequest || store.pending}>리뷰</Button> : null}
                  {item.action === "approve" ? <Button variant="ghost" size="sm" className="h-7 px-2" onClick={store.approvePlan} disabled={!canRequest || store.pending}>승인</Button> : null}
                  {item.action === "run" ? <Button variant="ghost" size="sm" className="h-7 px-2" onClick={store.runPlan} disabled={!canRequest || store.pending}>실행</Button> : null}
                  {item.action === "graph" ? <Button variant="ghost" size="sm" className="h-7 px-2" onClick={store.createGraph} disabled={!canRequest || store.pending}>그래프</Button> : null}
                </article>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            {store.plans.map((item) => (
              <button key={item.planId} type="button" onClick={() => store.openPlan(item.planId)} disabled={!canRequest} className={cn("flex w-full items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-left transition-colors", item.planId === plan?.planId ? "border-primary/50 bg-accent" : "border-transparent hover:bg-accent/60")}>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{item.title || item.objective || item.planId}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{item.reviewerSummary || item.objective}</span>
                </span>
                <Badge tone={statusTone(item.status)}>{item.status || "draft"}</Badge>
              </button>
            ))}
            {store.plans.length === 0 ? <CompactEmptyState icon={ClipboardList} title="계획 없음" description="목표를 입력해 첫 계획을 만드세요." /> : null}
          </div>
          {plan ? (
            <div className="space-y-2 rounded-md border border-border bg-card/60 p-3">
              <div className="flex items-center justify-between">
                <b className="truncate text-sm">{plan.title || plan.planId}</b>
                <Badge tone={statusTone(plan.status)}>{plan.status}</Badge>
              </div>
              {plan.objective ? <p className="text-xs text-muted-foreground">{plan.objective}</p> : null}
              {plan.reviewerSummary ? <p className="rounded bg-muted/50 px-2 py-1 text-[11px] text-muted-foreground">{plan.reviewerSummary}</p> : null}
              <div className="grid grid-cols-1 gap-2 border-t border-border pt-2">
                <Input
                  value={store.planDraft.title}
                  placeholder="계획 제목"
                  onChange={(event) => store.setPlanDraft("title", event.target.value)}
                  disabled={!canEditPlan}
                />
                <Textarea
                  rows={2}
                  value={store.planDraft.objective}
                  placeholder="계획 목표"
                  onChange={(event) => store.setPlanDraft("objective", event.target.value)}
                  disabled={!canEditPlan}
                />
                <Textarea
                  rows={2}
                  value={store.planDraft.constraintsText}
                  placeholder="기준을 줄 단위로 입력"
                  onChange={(event) => store.setPlanDraft("constraintsText", event.target.value)}
                  disabled={!canEditPlan}
                />
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[11px] text-muted-foreground">수정하면 리뷰와 실행 기록이 무효화됩니다.</span>
                  <Button variant="outline" size="sm" onClick={store.savePlanDraft} disabled={!canRequest || store.pending || !canEditPlan || store.planDraft.objective.trim().length < 5}>
                    저장
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 border-t border-border pt-2">
                <Button variant="outline" size="sm" onClick={store.reviewPlan} disabled={!canRequest || store.pending}><Search size={13} aria-hidden="true" /> 리뷰</Button>
                <Button variant="outline" size="sm" onClick={store.approvePlan} disabled={!canRequest || store.pending}><CheckCircle2 size={13} aria-hidden="true" /> 승인</Button>
                <Button variant="primary" size="sm" onClick={store.runPlan} disabled={!canRequest || store.pending}><Play size={13} aria-hidden="true" /> 실행</Button>
                <Button variant="ghost" size="sm" onClick={store.createGraph} disabled={!canRequest || store.pending}><ListTree size={13} aria-hidden="true" /> 작업 그래프</Button>
              </div>
              <PlanDetailView detail={store.planDetail} />
            </div>
          ) : null}
        </CardBoundary>

        {/* Task graphs */}
        <CardBoundary title="작업 그래프" card="logs" onError={recordCardError}>
          <div className="space-y-1">
            {store.graphs.map((g) => (
              <button key={g.graphId} type="button" onClick={() => store.openGraph(g.graphId)} disabled={!canRequest} className={cn("flex w-full items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-left transition-colors", g.graphId === graph?.graphId ? "border-primary/50 bg-accent" : "border-transparent hover:bg-accent/60")}>
                <span className="min-w-0">
                  <span className="block truncate font-mono text-xs">{g.graphId}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">작업 {g.nodeCount}</span>
                </span>
                <Badge tone={statusTone(g.status)}>{g.status || "-"}</Badge>
              </button>
            ))}
            {store.graphs.length === 0 ? <CompactEmptyState icon={ListTree} title="작업 그래프 없음" description="계획을 승인한 뒤 작업 그래프로 나눠보세요." /> : null}
          </div>
          {graph ? (
            <div className="space-y-2 rounded-md border border-border bg-card/60 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <b className="truncate font-mono text-xs">{graph.graphId}</b>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone={statusTone(graph.status)}>{graph.status}</Badge>
                  {store.graphEditNodes ? (
                    <>
                      <Button variant="primary" size="sm" onClick={store.saveGraphStructure} disabled={!canRequest || store.pending}>
                        <Save size={13} aria-hidden="true" /> 구조 저장
                      </Button>
                      <Button variant="ghost" size="sm" onClick={store.cancelGraphEdit} disabled={store.pending}>
                        <X size={13} aria-hidden="true" /> 취소
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button variant="primary" size="sm" onClick={store.runGraph} disabled={!canRequest || store.pending}><Play size={13} aria-hidden="true" /> 실행</Button>
                      <Button variant="outline" size="sm" onClick={store.resumeGraph} disabled={!canRequest || store.pending}>재개</Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={store.startGraphEdit}
                        disabled={!canRequest || store.pending || (graph.status || "").toLowerCase() === "running"}
                        title={(graph.status || "").toLowerCase() === "running" ? "실행 중에는 구조를 수정할 수 없습니다" : "노드 구조 편집"}
                      >
                        <Pencil size={13} aria-hidden="true" /> 구조 편집
                      </Button>
                    </>
                  )}
                </div>
              </div>
              {store.graphEditNodes ? (
                <TaskGraphEditor nodes={store.graphEditNodes} />
              ) : (
                <div className="space-y-1">
                  {graph.nodes.map((task) => (
                    <div key={task.taskId} className="rounded border border-border bg-background/40 px-2 py-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => store.loadOutput(task.taskId)}>
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-xs font-medium">{task.title || task.taskId}</span>
                            {task.category ? <Badge tone="outline" className="shrink-0">{task.category}</Badge> : null}
                          </span>
                          {task.error ? <span className="block truncate text-[11px] text-destructive">{task.error}</span> : task.outputSummary ? <span className="block truncate text-[11px] text-muted-foreground">{task.outputSummary}</span> : null}
                        </button>
                        <Badge tone={statusTone(task.status)}>{task.status}</Badge>
                        <button type="button" className="text-[11px] text-muted-foreground hover:text-foreground" onClick={() => store.retryTask(task.taskId)} disabled={!canRequest || store.pending}>
                          재시도
                        </button>
                        <button type="button" aria-label="취소" className="text-muted-foreground hover:text-destructive" onClick={() => store.cancelTask(task.taskId)}>
                          <XCircle size={14} aria-hidden="true" />
                        </button>
                      </div>
                      {task.dependsOn.length > 0 ? (
                        <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">선행: {task.dependsOn.join(", ")}</p>
                      ) : null}
                    </div>
                  ))}
                  {graph.nodes.length === 0 ? <p className="py-3 text-center text-xs text-muted-foreground">작업 노드 없음</p> : null}
                </div>
              )}
            </div>
          ) : null}
          {store.output ? (
            <div className="space-y-1 rounded-md border border-border bg-muted/30 p-2.5">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-mono">{store.output.taskId}</span>
                <Badge tone={statusTone(store.output.status)}>{store.output.status}</Badge>
              </div>
              {store.output.stdout ? <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-background/60 p-2 font-mono text-[11px]">{store.output.stdout}</pre> : null}
              {store.output.stderr ? <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded bg-destructive/10 p-2 font-mono text-[11px] text-destructive">{store.output.stderr}</pre> : null}
            </div>
          ) : null}
        </CardBoundary>
      </section>
    </div>
  );
}
