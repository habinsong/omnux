import { useEffect, useMemo } from "react";
import { BookOpen, CheckCircle2, ClipboardList, FileText, GitPullRequestArrow, Lightbulb, RefreshCcw, Search, ScrollText, Send, ShieldCheck, Wrench, X } from "lucide-react";
import { CardBoundary } from "../../CardBoundary";
import { useDesktopShellStore } from "../../shell-store";
import { useDesktopAuthStore } from "../auth/auth-store";
import { useUiLogStore } from "../ui-log/ui-log-store";
import { NOTEBOOK_TEMPLATES, useNotebookPageBridge, useNotebookStore } from "./notebook-store";
import type { NotebookKind } from "../middleware/notebook-gateway";
import { Badge, Button, Input, SectionLabel, Textarea, cn } from "../../components/ui/primitives";
import { usePlanningStore } from "../planning/planning-store";
import { useOpsPageStore } from "../ops/ops-store";
import { useRefactorStore } from "../refactor/refactor-store";

const KINDS: Array<{ key: NotebookKind; label: string; icon: typeof Lightbulb; tint: string }> = [
  { key: "learning", label: "학습", icon: Lightbulb, tint: "bg-blue-500/12 text-blue-500" },
  { key: "decision", label: "결정", icon: ScrollText, tint: "bg-violet-500/12 text-violet-500" },
  { key: "verification", label: "검증", icon: CheckCircle2, tint: "bg-emerald-500/12 text-emerald-500" }
];

const DOCS: Array<{ field: "learnings" | "decisions" | "verification" | "handoff"; label: string; icon: typeof Lightbulb; tint: string }> = [
  { field: "learnings", label: "학습", icon: Lightbulb, tint: "bg-blue-500/12 text-blue-500" },
  { field: "decisions", label: "결정", icon: ScrollText, tint: "bg-violet-500/12 text-violet-500" },
  { field: "verification", label: "검증", icon: CheckCircle2, tint: "bg-emerald-500/12 text-emerald-500" },
  { field: "handoff", label: "이어보기", icon: GitPullRequestArrow, tint: "bg-amber-500/12 text-amber-500" }
];

function countWords(value: string) {
  const text = String(value || "").trim();
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

function docMatches(document: { content: string; path: string }, label: string, query: string) {
  if (!query) return true;
  return [label, document.path, document.content].join("\n").toLowerCase().includes(query);
}

function isNotebookKind(value: NotebookKind | "handoff"): value is NotebookKind {
  return value === "learning" || value === "decision" || value === "verification";
}

function notebookKindLabel(kind: NotebookKind): string {
  return KINDS.find((item) => item.key === kind)?.label || kind;
}

function NotebookMetric({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <article className="rounded-md border border-border bg-card/60 px-3 py-2">
      <span className="block truncate text-[11px] font-medium text-muted-foreground">{label}</span>
      <strong className="mt-1 block truncate text-lg font-semibold tabular-nums">{value}</strong>
      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{helper}</p>
    </article>
  );
}

type QuickImportSource = {
  key: string;
  label: string;
  description: string;
  kind: NotebookKind;
  icon: typeof ClipboardList;
  text: string;
};

function shortLines(values: string[], max = 5) {
  const lines = values.map((value) => value.trim()).filter(Boolean);
  return lines.slice(0, max).map((line) => `- ${line}`).join("\n") || "-";
}

function buildPlanDecisionDraft(): string {
  const planning = usePlanningStore.getState();
  const plan = planning.selectedPlan;
  if (!plan) return "";
  const detail = planning.planDetail;
  return [
    "계획에서 가져온 결정 메모",
    "",
    `계획: ${plan.title || plan.planId}`,
    `상태: ${plan.status || "-"}`,
    "",
    "목표:",
    plan.objective || "-",
    "",
    "제약:",
    shortLines(plan.constraints),
    "",
    detail?.review ? `리뷰 요약:\n- ${detail.review.summary || "-"}` : "",
    detail?.review?.risks.length ? `리스크:\n${shortLines(detail.review.risks)}` : "",
    detail?.decisionLog.length ? `결정 로그:\n${shortLines(detail.decisionLog, 8)}` : ""
  ].filter(Boolean).join("\n");
}

function buildTaskVerificationDraft(): string {
  const planning = usePlanningStore.getState();
  const graph = planning.selectedGraph;
  const output = planning.output;
  if (!graph && !output) return "";
  const nodes = graph?.nodes || [];
  return [
    "작업 그래프에서 가져온 검증 메모",
    "",
    graph ? `그래프: ${graph.graphId}` : "",
    graph ? `상태: ${graph.status || "-"}` : "",
    nodes.length ? `작업 요약:\n${shortLines(nodes.map((node) => `${node.taskId} · ${node.status || "-"} · ${node.title || node.category || "-"}`), 10)}` : "",
    output ? `\n최근 출력: ${output.taskId} · ${output.status || "-"}` : "",
    output?.stdout ? `표준 출력:\n${output.stdout.slice(0, 1200)}` : "",
    output?.stderr ? `오류 출력:\n${output.stderr.slice(0, 1200)}` : ""
  ].filter(Boolean).join("\n");
}

function buildDoctorVerificationDraft(): string {
  const doctor = useOpsPageStore.getState().doctor;
  const report = doctor.report;
  const fix = doctor.fixResult;
  if (!report && !fix) return "";
  return [
    "상태 점검에서 가져온 검증 메모",
    "",
    report ? `보고서: ${report.reportId || "-"}` : "",
    report ? `상태: ${report.status} · 정상=${report.okCount} 경고=${report.warnCount} 실패=${report.failCount} 건너뜀=${report.skipCount}` : "",
    report?.checks.length ? `체크:\n${shortLines(report.checks.map((check) => `${check.status} · ${check.summary || check.id}`), 10)}` : "",
    fix ? `\n수정 미리보기/적용: ${fix.action || "-"} · ${fix.ok ? "정상" : "확인 필요"}` : "",
    fix?.message ? `메시지: ${fix.message}` : "",
    fix?.actions.length ? `액션:\n${shortLines(fix.actions.map((action) => `${action.kind} · ${action.target} · ${action.status}`), 8)}` : ""
  ].filter(Boolean).join("\n");
}

function buildRefactorVerificationDraft(): string {
  const refactor = useRefactorStore.getState();
  if (!refactor.previewId && !refactor.previewDiff && !refactor.lastMessage && !refactor.loadedPath) return "";
  return [
    "리뷰에서 가져온 검증 메모",
    "",
    `파일: ${refactor.loadedPath || refactor.path || "-"}`,
    `상태: ${refactor.applied ? "적용" : refactor.previewId ? "미리보기" : "확인"}`,
    refactor.lastMessage ? `메시지: ${refactor.lastMessage}` : "",
    refactor.issues.length ? `이슈:\n${shortLines(refactor.issues, 8)}` : "",
    refactor.previewDiff ? `변경 미리보기:\n${refactor.previewDiff.slice(0, 1800)}` : ""
  ].filter(Boolean).join("\n");
}

function QuickImportPanel({ onImport }: { onImport: (kind: NotebookKind, text: string) => void }) {
  const selectedPlan = usePlanningStore((state) => state.selectedPlan);
  const selectedGraph = usePlanningStore((state) => state.selectedGraph);
  const output = usePlanningStore((state) => state.output);
  const doctor = useOpsPageStore((state) => state.doctor);
  const refactor = useRefactorStore();
  const sources = useMemo<QuickImportSource[]>(() => [
    {
      key: "plan-decision",
      label: "계획 결정",
      description: selectedPlan ? selectedPlan.title || selectedPlan.planId : "작업 탭에서 계획을 선택하면 가져올 수 있습니다.",
      kind: "decision",
      icon: ClipboardList,
      text: buildPlanDecisionDraft()
    },
    {
      key: "task-verification",
      label: "작업 검증",
      description: selectedGraph ? `${selectedGraph.graphId} · ${selectedGraph.status}` : output ? `${output.taskId} 출력` : "작업에서 그래프나 출력 결과를 열면 가져올 수 있습니다.",
      kind: "verification",
      icon: CheckCircle2,
      text: buildTaskVerificationDraft()
    },
    {
      key: "doctor-verification",
      label: "상태 점검",
      description: doctor.report ? `${doctor.report.status} · 실패 ${doctor.report.failCount}` : doctor.fixResult ? doctor.fixResult.message : "모니터에서 상태 점검을 실행하면 가져올 수 있습니다.",
      kind: "verification",
      icon: ShieldCheck,
      text: buildDoctorVerificationDraft()
    },
    {
      key: "refactor-verification",
      label: "리뷰 검증",
      description: refactor.loadedPath || refactor.path || "리뷰 미리보기와 읽기 결과를 가져옵니다.",
      kind: "verification",
      icon: Wrench,
      text: buildRefactorVerificationDraft()
    }
  ], [doctor, output, refactor, selectedGraph, selectedPlan]);

  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/25 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <b className="block text-sm">빠른 기록 가져오기</b>
          <span className="block truncate text-xs text-muted-foreground">현재 앱에 남아 있는 계획·검증 결과를 노트북 초안으로 합칩니다.</span>
        </div>
        <Badge tone="outline" className="shrink-0">{sources.filter((source) => source.text.trim()).length}/{sources.length}</Badge>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {sources.map((source) => {
          const Icon = source.icon;
          const available = Boolean(source.text.trim());
          return (
            <button
              key={source.key}
              type="button"
              onClick={() => onImport(source.kind, source.text)}
              disabled={!available}
              className={cn(
                "flex min-w-0 items-start gap-2 rounded-md border px-3 py-2 text-left transition-colors duration-200 active:scale-[0.98]",
                available ? "border-border bg-card/60 hover:bg-accent" : "border-border bg-muted/20 opacity-60"
              )}
            >
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Icon size={15} aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-sm font-medium">{source.label}</span>
                  <Badge tone={source.kind === "decision" ? "primary" : "success"} className="shrink-0">{notebookKindLabel(source.kind)}</Badge>
                </span>
                <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{source.description}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function NotebookDocumentDialog({ title, content, path, onClose }: { title: string; content: string; path: string; onClose: () => void }) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-xl" role="dialog" aria-modal="true" aria-labelledby="notebook-document-title">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="노트북 문서 닫기" onClick={onClose} />
      <section className="relative flex max-h-[86vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-border bg-card shadow-xl">
        <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h2 id="notebook-document-title" className="truncate text-base font-semibold">{title}</h2>
            <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">{path || "path -"}</p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="닫기" title="닫기" onClick={onClose}>
            <X size={15} aria-hidden="true" />
          </Button>
        </header>
        <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap p-4 text-xs leading-relaxed">{content || "표시할 내용이 없습니다."}</pre>
      </section>
    </div>
  );
}

export function NotebookPage() {
  useNotebookPageBridge();
  const bridgeStatus = useDesktopShellStore((state) => state.bridge.status);
  const authStatus = useDesktopAuthStore((state) => state.auth.status);
  const recordCardError = useUiLogStore((state) => state.recordCardError);
  const store = useNotebookStore();
  const canRequest = bridgeStatus === "connected" && authStatus === "authenticated";
  const normalizedFilter = store.filterText.trim().toLowerCase();
  const filteredDocs = useMemo(
    () => DOCS.filter((definition) => docMatches(store.snapshot[definition.field], definition.label, normalizedFilter)),
    [normalizedFilter, store.snapshot]
  );
  const coverageCount = useMemo(() => DOCS.filter((definition) => store.snapshot[definition.field].exists).length, [store.snapshot]);
  const activeKind = KINDS.find((item) => item.key === store.appendKind) || KINDS[0];
  const expandedDefinition = DOCS.find((definition) => definition.field === store.expandedDocument);
  const expandedDocument = expandedDefinition ? store.snapshot[expandedDefinition.field] : null;
  const checklist = useMemo(() => {
    const items: Array<{ key: string; title: string; description: string; kind: NotebookKind | "handoff" }> = [];
    if (!store.loaded) {
      items.push({ key: "load", title: "노트북을 먼저 불러오세요.", description: "현재 프로젝트에 남긴 메모를 먼저 읽어야 이어서 쓸 수 있습니다.", kind: "learning" });
      return items;
    }
    if (!store.snapshot.decisions.exists) items.push({ key: "decision", title: "작업 방향이 비어 있습니다.", description: "어디까지 했고 어디는 안 했는지만 남겨도 다음 작업이 빨라집니다.", kind: "decision" });
    if (!store.snapshot.verification.exists) items.push({ key: "verification", title: "확인한 내용이 없습니다.", description: "직접 실행한 것과 아직 못 본 것을 짧게 남기세요.", kind: "verification" });
    if (!store.snapshot.learnings.exists) items.push({ key: "learning", title: "작업 메모가 아직 없습니다.", description: "반복해서 헷갈린 점이나 다음에 쓸 내용을 적어두세요.", kind: "learning" });
    if (!store.snapshot.handoff.exists) items.push({ key: "handoff", title: "이어보기 문서가 아직 없습니다.", description: "작업을 넘기기 전 현재 상태를 한 번에 묶어두세요.", kind: "handoff" });
    if (items.length === 0) items.push({ key: "fresh", title: "필수 문서가 채워져 있습니다.", description: "새로 확인한 내용이 생기면 검증 메모를 갱신하세요.", kind: "verification" });
    return items;
  }, [store.loaded, store.snapshot]);

  useEffect(() => {
    if (canRequest) store.load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRequest]);

  return (
    <div className="dashboard-tab space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">노트</h1>
          <p className="text-sm text-muted-foreground">결정, 확인, 이어보기 메모를 프로젝트 기준으로 남깁니다.</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={store.load} disabled={!canRequest || store.loading}>
            <RefreshCcw size={15} aria-hidden="true" /> {store.loading ? "조회 중" : "새로고침"}
          </Button>
          <Button variant="primary" size="sm" onClick={store.createHandoff} disabled={!canRequest || store.pending}>
            <GitPullRequestArrow size={15} aria-hidden="true" /> 이어보기 문서
          </Button>
        </div>
      </div>

      {store.lastError ? <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{store.lastError}</p> : null}
      {store.lastMessage ? <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">{store.lastMessage}</p> : null}

      <CardBoundary title="노트북에 기록" card="operations" onError={recordCardError} hideTitle>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BookOpen size={16} aria-hidden="true" /> <span className="text-sm font-semibold">노트북에 기록</span>
          </div>
          <div className="flex min-w-[220px] flex-wrap items-center gap-2">
            <Input value={store.projectKeyDraft} placeholder="프로젝트 기준 (비우면 기본)" onChange={(event) => store.setProjectKeyDraft(event.target.value)} />
            <Button variant="outline" size="sm" onClick={store.load} disabled={!canRequest || store.loading}>적용</Button>
          </div>
        </div>

        <section className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <NotebookMetric label="남긴 문서" value={`${coverageCount}/4`} helper="학습·결정·검증·이어보기" />
          <NotebookMetric label="작성 대상" value={activeKind.label} helper="현재 저장 위치" />
          <NotebookMetric label="초안 길이" value={`${store.appendText.trim().length}자`} helper={`${countWords(store.appendText)}단어`} />
          <NotebookMetric label="프로젝트" value={store.projectKeyDraft || "기본"} helper="조회/저장 기준" />
        </section>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {KINDS.map((k) => {
                const Icon = k.icon;
                const on = store.appendKind === k.key;
                return (
                  <button
                    key={k.key}
                    type="button"
                    onClick={() => store.setAppendKind(k.key)}
                    className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors", on ? "border-primary bg-primary/12 text-primary" : "border-border bg-muted/40 text-muted-foreground hover:bg-accent hover:text-foreground")}
                  >
                    <Icon size={13} aria-hidden="true" /> {k.label}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <SectionLabel className="mr-1">템플릿</SectionLabel>
              {KINDS.map((k) => (
                <Button key={k.key} variant="outline" size="sm" className="h-7 px-2" onClick={() => store.insertTemplate(k.key)}>
                  {k.label}
                </Button>
              ))}
              <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => store.setAppendText("")}>비우기</Button>
            </div>
            <QuickImportPanel onImport={(kind, text) => store.applyDraft(kind, text)} />
            <Textarea rows={7} value={store.appendText} placeholder={NOTEBOOK_TEMPLATES[store.appendKind]} onChange={(event) => store.setAppendText(event.target.value)} />
            <div className="flex justify-end">
              <Button variant="primary" size="sm" onClick={store.append} disabled={!canRequest || store.pending || !store.appendText.trim()}>
                <Send size={14} aria-hidden="true" /> 기록
              </Button>
            </div>
          </div>

          <aside className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
            <div>
              <b className="block text-sm">다음 액션</b>
              <span className="block truncate text-xs text-muted-foreground">비어 있는 문서부터 채웁니다.</span>
            </div>
            <div className="space-y-2">
              {checklist.map((item) => {
                const kind = isNotebookKind(item.kind) ? item.kind : null;
                return (
                  <article key={item.key} className="rounded-md border border-border bg-card/60 p-2">
                    <strong className="block truncate text-xs">{item.title}</strong>
                    <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{item.description}</p>
                    {kind ? (
                      <Button variant="ghost" size="sm" className="mt-2 h-7 px-2" onClick={() => store.insertTemplate(kind)} disabled={!canRequest}>시작</Button>
                    ) : (
                      <Button variant="outline" size="sm" className="mt-2 h-7 px-2" onClick={store.createHandoff} disabled={!canRequest || store.pending}>이어보기</Button>
                    )}
                  </article>
                );
              })}
            </div>
          </aside>
        </div>
      </CardBoundary>

      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input className="pl-8" value={store.filterText} placeholder="문서 내용, 경로, 종류 검색" onChange={(event) => store.setFilterText(event.target.value)} />
        </div>
        <Badge tone="outline" className="shrink-0">{filteredDocs.length}/{DOCS.length}</Badge>
      </div>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {filteredDocs.map((d) => {
          const document = store.snapshot[d.field];
          const Icon = d.icon;
          return (
            <CardBoundary key={d.field} title={d.label} card="logs" onError={recordCardError} hideTitle>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={cn("flex h-7 w-7 items-center justify-center rounded-md", d.tint)}>
                    <Icon size={15} aria-hidden="true" />
                  </span>
                  <span className="text-sm font-semibold">{d.label}</span>
                </div>
                <Badge tone={document.exists ? "success" : "outline"}>{document.exists ? "있음" : "없음"}</Badge>
              </div>
              {document.path ? <div className="truncate font-mono text-[11px] text-muted-foreground">{document.path}</div> : null}
              {document.content ? (
                <pre className="max-h-56 overflow-hidden whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-3 text-xs leading-relaxed">{document.content}</pre>
              ) : (
                <p className="py-4 text-center text-xs text-muted-foreground">{store.loaded ? "기록 없음" : "새로고침하면 표시됩니다."}</p>
              )}
              <div className="flex justify-end gap-2">
                {d.field !== "handoff" ? (
                  <Button variant="ghost" size="sm" onClick={() => store.applyDraft(d.field === "learnings" ? "learning" : d.field === "decisions" ? "decision" : "verification", document.content)} disabled={!canRequest}>
                    <FileText size={14} aria-hidden="true" /> 초안으로
                  </Button>
                ) : null}
                <Button variant="outline" size="sm" onClick={() => store.setExpandedDocument(d.field)} disabled={!document.content}>
                  전체 보기
                </Button>
              </div>
            </CardBoundary>
          );
        })}
      </section>

      {expandedDefinition && expandedDocument ? (
        <NotebookDocumentDialog title={expandedDefinition.label} path={expandedDocument.path} content={expandedDocument.content} onClose={() => store.setExpandedDocument("")} />
      ) : null}
    </div>
  );
}
