import { useEffect } from "react";
import { Plus, RefreshCcw, Save, Sparkles, Trash2, Wand2 } from "lucide-react";
import { CardBoundary } from "../../CardBoundary";
import { useDesktopShellStore } from "../../shell-store";
import { useDesktopAuthStore } from "../auth/auth-store";
import { useUiLogStore } from "../ui-log/ui-log-store";
import { useSkillPageBridge, useSkillStore } from "./skill-store";
import type { SkillScope } from "../middleware/skill-gateway";
import { Badge, Button, EmptyState, Input, Textarea, cn } from "../../components/ui/primitives";

const SELECT_CLASS = "h-9 rounded-md border border-input bg-transparent px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60";
const FIELD_LABEL = "block space-y-1 text-xs font-semibold text-muted-foreground";

export function SkillsPage() {
  useSkillPageBridge();
  const bridgeStatus = useDesktopShellStore((state) => state.bridge.status);
  const authStatus = useDesktopAuthStore((state) => state.auth.status);
  const recordCardError = useUiLogStore((state) => state.recordCardError);
  const store = useSkillStore();
  const canRequest = bridgeStatus === "connected" && authStatus === "authenticated";
  const editor = store.editor;

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

      <section className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <CardBoundary title="스킬 목록" card="navigation" onError={recordCardError}>
          <Button variant="outline" size="sm" onClick={store.load} disabled={!canRequest || store.loading}>
            <RefreshCcw size={14} aria-hidden="true" /> {store.loading ? "조회 중" : "새로고침"}
          </Button>
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
            {store.skills.map((item) => {
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
            {store.skills.length === 0 ? (
              <EmptyState icon={Wand2} title="스킬 없음" description="새 스킬을 만들어 AI 행동 강령을 정의하세요." />
            ) : null}
          </div>
        </CardBoundary>

        <CardBoundary title="스킬 편집" card="operations" onError={recordCardError}>
          {editor ? (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_140px]">
                <label className={FIELD_LABEL}>
                  이름
                  <Input value={editor.name} placeholder="my-skill" disabled={!editor.isNew} onChange={(event) => store.patchEditor({ name: event.target.value })} />
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
              <label className={cn(FIELD_LABEL, "flex min-h-0 flex-1 flex-col")}>
                본문 (SKILL.md)
                <Textarea className="min-h-0 flex-1 font-mono text-[12px]" value={editor.body} placeholder="# 스킬 행동 강령&#10;..." onChange={(event) => store.patchEditor({ body: event.target.value })} />
              </label>
              <div className="flex gap-2 border-t border-border pt-3">
                <Button variant="primary" size="sm" onClick={store.saveEditor} disabled={!canRequest || !editor.name.trim()}>
                  <Save size={14} aria-hidden="true" /> 저장
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
