import { useEffect, useMemo } from "react";
import { FileText, Globe2, Plus, RefreshCcw, Save, Search, Sparkles, Trash2, Wand2 } from "lucide-react";
import { CardBoundary } from "../../CardBoundary";
import { useDesktopShellStore } from "../../shell-store";
import { useDesktopAuthStore } from "../auth/auth-store";
import { useUiLogStore } from "../ui-log/ui-log-store";
import { useSkillPageBridge, useSkillStore } from "./skill-store";
import type { SkillScope } from "../middleware/skill-gateway";
import { Badge, Button, EmptyState, Input, Textarea, cn } from "../../components/ui/primitives";

const SELECT_CLASS = "h-9 rounded-md border border-input bg-transparent px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60";
const FIELD_LABEL = "block space-y-1 text-xs font-semibold text-muted-foreground";
const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;

function MetricTile({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <article className="rounded-md border border-border bg-card/60 px-3 py-2">
      <span className="block truncate text-[11px] font-medium text-muted-foreground">{label}</span>
      <strong className="mt-1 block truncate text-lg font-semibold tabular-nums">{value}</strong>
      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{helper}</p>
    </article>
  );
}

export function SkillsPage() {
  useSkillPageBridge();
  const bridgeStatus = useDesktopShellStore((state) => state.bridge.status);
  const authStatus = useDesktopAuthStore((state) => state.auth.status);
  const recordCardError = useUiLogStore((state) => state.recordCardError);
  const store = useSkillStore();
  const canRequest = bridgeStatus === "connected" && authStatus === "authenticated";
  const editor = store.editor;
  const normalizedSearch = store.searchQuery.trim().toLowerCase();
  const filteredSkills = useMemo(
    () =>
      normalizedSearch
        ? store.skills.filter((item) =>
            [item.name, item.scope, item.description]
              .some((value) => String(value || "").toLowerCase().includes(normalizedSearch))
          )
        : store.skills,
    [normalizedSearch, store.skills]
  );
  const projectCount = useMemo(() => store.skills.filter((item) => item.scope === "project").length, [store.skills]);
  const globalCount = useMemo(() => store.skills.filter((item) => item.scope === "global").length, [store.skills]);
  const editorName = String(editor?.name || "").trim();
  const nameInvalid = Boolean(editor?.isNew && editorName && !SKILL_NAME_PATTERN.test(editorName));
  const usageText = editorName ? `${editorName} 스킬 사용해` : "스킬 이름을 먼저 입력하세요";

  useEffect(() => {
    if (canRequest) store.load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRequest]);

  return (
    <div className="flex h-[calc(100vh-8.5rem)] min-h-[560px] flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">스킬</h1>
          <p className="text-sm text-muted-foreground">AI 행동 강령(SKILL.md)을 만들고 편집합니다. 프로젝트/글로벌 스코프로 격리됩니다.</p>
        </div>
        <Button variant="primary" size="sm" onClick={store.newSkill}>
          <Plus size={15} aria-hidden="true" /> 새 스킬
        </Button>
      </div>
      {store.status ? (
        <p className={cn("rounded-md border px-3 py-2 text-xs", store.status.kind === "error" ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-success/30 bg-success/10 text-success")}>{store.status.message}</p>
      ) : null}

      <section className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <MetricTile label="전체" value={`${store.skills.length}개`} helper="현재 연결된 스킬" />
        <MetricTile label="프로젝트" value={`${projectCount}개`} helper=".omni/skills" />
        <MetricTile label="전역" value={`${globalCount}개`} helper="global scope" />
        <MetricTile label="선택" value={editorName || "-"} helper={editor?.scope || "편집할 항목"} />
      </section>

      <section className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <CardBoundary title="스킬 목록" card="navigation" onError={recordCardError}>
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input className="pl-8" value={store.searchQuery} placeholder="이름, 설명, 스코프 검색" onChange={(event) => store.setSearchQuery(event.target.value)} />
            </div>
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={store.load} disabled={!canRequest || store.loading} aria-label="새로고침" title="새로고침">
              <RefreshCcw size={14} aria-hidden="true" />
            </Button>
          </div>
          <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span className="truncate">표시 {filteredSkills.length}/{store.skills.length}개</span>
            <span className="shrink-0">{store.loading ? "조회 중" : "idle"}</span>
          </div>
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
            {filteredSkills.map((item) => {
              const key = `${item.scope}:${item.name}`;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => store.openSkill(item)}
                  disabled={!canRequest}
                  className={cn("flex w-full flex-col rounded-md border px-2.5 py-2 text-left transition-colors", key === store.selectedKey ? "border-primary/50 bg-accent" : "border-transparent hover:bg-accent/60")}
                >
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium">{item.name}</span>
                    <Badge tone={item.scope === "global" ? "primary" : "outline"}>{item.scope}</Badge>
                  </span>
                  <span className="truncate text-[11px] text-muted-foreground">{item.description || "설명 없음"}</span>
                </button>
              );
            })}
            {filteredSkills.length === 0 ? (
              <EmptyState icon={Wand2} title={store.skills.length === 0 ? "스킬 없음" : "검색 결과 없음"} description={store.skills.length === 0 ? "새 스킬을 만들어 AI 행동 강령을 정의하세요." : "검색어를 줄이거나 목록을 새로고침하세요."} />
            ) : null}
          </div>
        </CardBoundary>

        <CardBoundary title="스킬 편집" card="operations" onError={recordCardError}>
          {editor ? (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_140px]">
                <label className={FIELD_LABEL}>
                  이름
                  <Input
                    value={editor.name}
                    placeholder="my-skill"
                    disabled={!editor.isNew}
                    onChange={(event) => store.patchEditor({ name: event.target.value.trim().toLowerCase() })}
                    className={nameInvalid ? "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/40" : undefined}
                  />
                  <span className={cn("block truncate text-[11px]", nameInvalid ? "text-destructive" : "text-muted-foreground")}>
                    {nameInvalid ? "소문자, 숫자, 하이픈만 사용할 수 있습니다." : "예: ui-review, backend-audit"}
                  </span>
                </label>
                <label className={FIELD_LABEL}>
                  스코프
                  <select className={SELECT_CLASS} value={editor.scope} disabled={!editor.isNew} onChange={(event) => store.patchEditor({ scope: event.target.value as SkillScope })}>
                    <option value="project">project</option>
                    <option value="global">global</option>
                  </select>
                </label>
              </div>
              <label className={FIELD_LABEL}>
                설명 (YAML frontmatter description)
                <Input value={editor.description} placeholder="이 스킬이 언제 적용되는지" onChange={(event) => store.patchEditor({ description: event.target.value })} />
              </label>
              <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-xs font-medium">대화에서 이렇게 사용</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{usageText}</span>
                </span>
                <Badge tone={editor.scope === "global" ? "primary" : "outline"} className="shrink-0">
                  {editor.scope === "global" ? <Globe2 size={12} aria-hidden="true" /> : <FileText size={12} aria-hidden="true" />}
                  {editor.scope}
                </Badge>
              </div>
              <label className={cn(FIELD_LABEL, "flex min-h-0 flex-1 flex-col")}>
                본문 (SKILL.md)
                <Textarea className="min-h-0 flex-1 font-mono text-[12px]" value={editor.body} placeholder="# 스킬 행동 강령&#10;..." onChange={(event) => store.patchEditor({ body: event.target.value })} />
              </label>
              <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                <Button variant="primary" size="sm" onClick={store.saveEditor} disabled={!canRequest || !editor.name.trim() || nameInvalid}>
                  <Save size={14} aria-hidden="true" /> 저장
                </Button>
                <Button variant="outline" size="sm" onClick={store.insertDefaultBody} disabled={!canRequest}>
                  <Wand2 size={14} aria-hidden="true" /> 기본 양식
                </Button>
                {!editor.isNew ? (
                  <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => store.deleteSkill({ name: editor.name, scope: editor.scope, description: editor.description })} disabled={!canRequest}>
                    <Trash2 size={14} aria-hidden="true" /> 삭제
                  </Button>
                ) : null}
              </div>
            </>
          ) : (
            <EmptyState icon={Sparkles} title="스킬을 선택하거나 새로 만드세요" description="왼쪽 목록에서 스킬을 열거나 [새 스킬]로 행동 강령을 작성합니다." />
          )}
        </CardBoundary>
      </section>
    </div>
  );
}
