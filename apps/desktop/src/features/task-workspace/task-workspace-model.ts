export type PlanSummary = { id: string; title: string; objective: string; status: string };
export type PlanStep = { id: string; title: string; description: string; required: string[]; excluded: string[]; checks: string[] };
export type PlanView = PlanSummary & {
  constraints: string[];
  steps: PlanStep[];
  review: { summary: string; findings: string[]; risks: string[]; missing: string[]; recommendsApproval: boolean; route: string } | null;
  decisions: string[];
  execution: { status: string; message: string; summary: string; graphId: string } | null;
};
export type RunSummary = { id: string; planId: string; status: string; count: number };
export type RunStep = { id: string; title: string; category: string; prompt: string; dependencies: string[]; skills: string[]; tools: string[]; status: string; summary: string; error: string; artifact: string };
export type EditableRunStep = RunStep & { skillsInput?: string; toolsInput?: string };
export type Attempt = { stepId: string; started: string; status: string; conversationId: string };
export type RunView = RunSummary & { steps: RunStep[]; attempts: Attempt[] };
export type OutputView = { runId: string; stepId: string; status: string; stdout: string; stderr: string; resultOutput: string; resultError: string; files: string[]; conversationId: string; started: string };
export type PlanForm = { title: string; objective: string; constraints: string };
export type Notice = { tone: "error" | "info"; text: string } | null;

export const asObject = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};
export const text = (value: unknown) => typeof value === "string" ? value : "";
export const items = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
export const lines = (value: unknown) => items(value).map(text).filter(Boolean);
export const inputLines = (value: string) => value.split(/\n/).map(line => line.trim()).filter(Boolean);

export function planSummary(value: unknown): PlanSummary {
  const row = asObject(value);
  return { id: text(row.planId), title: text(row.title), objective: text(row.objective), status: text(row.status).toLowerCase() };
}
export function planView(value: unknown): PlanView | null {
  const snapshot = asObject(value), plan = asObject(snapshot.plan);
  if (!text(plan.planId)) return null;
  const review = asObject(snapshot.review), execution = asObject(snapshot.execution);
  return {
    ...planSummary(plan), constraints: lines(plan.constraints), decisions: lines(plan.decisionLog),
    steps: items(plan.steps).map(item => {
      const step = asObject(item);
      return { id: text(step.stepId), title: text(step.title), description: text(step.description), required: lines(step.mustDo), excluded: lines(step.mustNotDo), checks: lines(step.verification) };
    }),
    review: snapshot.review ? { summary: text(review.summary), findings: lines(review.findings), risks: lines(review.risks), missing: lines(review.missingVerification), recommendsApproval: review.approvedRecommendation === true, route: text(review.reviewerRoute) } : null,
    execution: snapshot.execution ? { status: text(execution.status), message: text(execution.message), summary: text(execution.resultSummary), graphId: text(execution.conversationId) } : null
  };
}
export function runSummary(value: unknown): RunSummary {
  const row = asObject(value);
  return { id: text(row.graphId), planId: text(row.sourcePlanId), status: text(row.status).toLowerCase(), count: Number(row.totalNodes) || items(row.nodes).length };
}
export function runStep(value: unknown): RunStep {
  const row = asObject(value);
  return { id: text(row.taskId), title: text(row.title), category: text(row.category), prompt: text(row.prompt), dependencies: lines(row.dependsOn), skills: lines(row.requiredSkills), tools: lines(row.requiredTools), status: text(row.status).toLowerCase(), summary: text(row.outputSummary), error: text(row.error), artifact: text(row.artifactPath) };
}
export function runView(value: unknown): RunView | null {
  const snapshot = asObject(value), graph = asObject(snapshot.graph);
  if (!text(graph.graphId)) return null;
  return {
    ...runSummary(graph), steps: items(graph.nodes).map(runStep),
    attempts: items(snapshot.executions).map(item => {
      const row = asObject(item);
      return { stepId: text(row.taskId), started: text(row.startedAtUtc), status: text(row.status), conversationId: text(row.conversationId) };
    })
  };
}
export function outputView(value: unknown): OutputView {
  const row = asObject(value), execution = asObject(row.execution);
  let result: Record<string, unknown> = {};
  try { result = asObject(JSON.parse(text(row.resultJson))); } catch { }
  const program = asObject(result.execution);
  return { runId: text(row.graphId), stepId: text(row.taskId), status: text(execution.status).toLowerCase(), stdout: text(row.stdOut), stderr: text(row.stdErr) || text(execution.error), resultOutput: text(program.stdout) || text(result.output), resultError: text(program.stderr), files: lines(result.changedFiles), conversationId: text(execution.conversationId), started: text(execution.startedAtUtc) };
}
export function statusText(status: string) {
  const labels: Record<string, string> = { draft: "초안", reviewpending: "검토 필요", approved: "승인됨", rejected: "수정 필요", abandoned: "보류", running: "실행 중", completed: "완료", failed: "실패", canceled: "중단됨", cancelled: "중단됨", pending: "대기", blocked: "선행 단계 대기", ok: "완료", error: "오류" };
  return labels[status.toLowerCase()] || status || "대기";
}
export function stepPayload(step: EditableRunStep) {
  const values = (input: string | undefined, fallback: string[]) => input === undefined ? fallback : input.split(",").map(value => value.trim()).filter(Boolean);
  return { taskId: step.id, title: step.title.trim(), category: step.category, prompt: step.prompt.trim(), dependsOn: step.dependencies, requiredSkills: values(step.skillsInput, step.skills), requiredTools: values(step.toolsInput, step.tools) };
}
export function validateSteps(steps: RunStep[]): string | null {
  if (!steps.length) return "실행 단계가 한 개 이상 필요합니다.";
  if (steps.some(step => !step.title.trim() || !step.prompt.trim())) return "모든 단계의 이름과 실행 내용을 입력해 주세요.";
  const pending = new Map(steps.map(step => [step.id, new Set(step.dependencies)]));
  while (pending.size) {
    const ready = [...pending].filter(([, dependencies]) => dependencies.size === 0).map(([id]) => id);
    if (!ready.length) return "선행 단계가 순환합니다. 서로 기다리지 않도록 연결을 수정해 주세요.";
    for (const id of ready) pending.delete(id);
    for (const dependencies of pending.values()) for (const id of ready) dependencies.delete(id);
  }
  return null;
}
