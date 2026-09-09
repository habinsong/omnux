import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, Plus, RefreshCcw, Save, Search, Trash2, X } from "lucide-react";
import { Screen, ScreenNotice } from "../../components/screen/Screen";
import { ScreenTabs, type ScreenTab } from "../../components/screen/ScreenTabs";
import { Button, Input, Spinner, Textarea, cn } from "../../components/ui/primitives";
import { useDesktopShellStore } from "../../shell-store";
import { useDesktopAuthStore } from "../auth/auth-store";
import { useSkillPageBridge, useSkillStore } from "./skill-store";
import {
  countByScope,
  describeNameHint,
  describeSaveBlock,
  describeUsage,
  filterSkills,
  parseScope,
  scopeLabel,
  skillKey
} from "./skills-model";

/* ============================================================================
   도구 화면.
   왼쪽 목록·오른쪽 편집기로 나누지 않는다. 목록 한 줄이 곧 편집기다.
   캡슐 탭으로 범위를 좁히고, 목록은 남은 높이 안에서만 스크롤한다.
   ============================================================================ */

type TabId = "all" | "project" | "global";

export function SkillsPage() {
  useSkillPageBridge();

  const bridgeStatus = useDesktopShellStore((state) => state.bridge.status);
  const authStatus = useDesktopAuthStore((state) => state.auth.status);
  const connected = bridgeStatus === "connected" && authStatus === "authenticated";

  const skills = useSkillStore((state) => state.skills);
  const listLoaded = useSkillStore((state) => state.listLoaded);
  const loading = useSkillStore((state) => state.loading);
  const searchQuery = useSkillStore((state) => state.searchQuery);
  const selectedKey = useSkillStore((state) => state.selectedKey);
  const editor = useSkillStore((state) => state.editor);
  const status = useSkillStore((state) => state.status);
  const store = useSkillStore;

  const [tab, setTab] = useState<TabId>("all");
  const loadedOnce = useRef(false);

  useEffect(() => {
    if (!connected || loadedOnce.current) return;
    loadedOnce.current = true;
    store.getState().load();
  }, [connected, store]);

  const counts = useMemo(() => countByScope(skills), [skills]);
  const scoped = useMemo(
    () => (tab === "all" ? skills : skills.filter((item) => item.scope === tab)),
    [skills, tab]
  );
  const shown = useMemo(() => filterSkills(scoped, searchQuery), [scoped, searchQuery]);
  const creating = editor !== null && editor.isNew;

  const tabs: ScreenTab[] = [
    { id: "all", label: "전체", badge: String(skills.length) },
    { id: "project", label: "프로젝트", badge: String(counts.project) },
    { id: "global", label: "전역", badge: String(counts.global) }
  ];

  return (
    <Screen
      title="도구"
      hint="반복해서 쓰는 작업 방식을 문서로 남깁니다. 줄을 열면 바로 고칩니다."
      actions={
        <>
          <Button variant="outline" size="sm" onClick={() => store.getState().load()} disabled={!connected || loading}>
            {loading ? <Spinner size={14} /> : <RefreshCcw size={14} aria-hidden="true" />} 다시 조회
          </Button>
          <Button variant="primary" size="sm" onClick={() => store.getState().newSkill()} disabled={!connected}>
            <Plus size={14} aria-hidden="true" /> 새 도구
          </Button>
        </>
      }
      notice={
        !connected ? (
          <ScreenNotice tone="warning">연결되지 않았습니다.</ScreenNotice>
        ) : status ? (
          <ScreenNotice tone={status.kind === "error" ? "danger" : "info"}>{status.message}</ScreenNotice>
        ) : null
      }
    >
      <ScreenTabs tabs={tabs} value={tab} onChange={(id) => setTab(id as TabId)} label="도구 범위" />

      {creating ? (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-primary/40 bg-card">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
            <span className="text-sm font-medium">새 도구</span>
            <Button size="sm" variant="ghost" onClick={() => store.getState().closeEditor()}>
              <X size={13} aria-hidden="true" /> 닫기
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <Editor connected={connected} />
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
          <div className="relative shrink-0 border-b border-border p-2">
            <Search size={13} aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-8 pl-7 text-xs"
              value={searchQuery}
              aria-label="도구 찾기"
              placeholder="이름·설명으로 찾기"
              onChange={(event) => store.getState().setSearchQuery(event.target.value)}
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {shown.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                {skills.length === 0
                  ? listLoaded
                    ? "만들어 둔 도구가 없습니다."
                    : "아직 목록을 받지 못했습니다."
                  : "찾는 도구가 없습니다."}
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {shown.map((item) => {
                  const key = skillKey(item);
                  const open = key === selectedKey;
                  return (
                    <li key={key} className="min-w-0">
                      <button
                        type="button"
                        aria-expanded={open}
                        onClick={() => (open ? store.getState().closeEditor() : store.getState().openSkill(item))}
                        className="flex w-full min-w-0 items-center gap-2 px-3 py-2 text-left outline-none hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-medium">{item.name}</span>
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {item.description || "설명 없음"}
                          </span>
                        </span>
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                            item.scope === "global" ? "bg-primary/12 text-primary" : "bg-muted text-muted-foreground"
                          )}
                        >
                          {scopeLabel(item.scope)}
                        </span>
                      </button>

                      {open ? (
                        <div className="min-w-0 border-t border-border bg-muted/20 p-3">
                          {editor !== null && !editor.isNew ? (
                            <Editor connected={connected} />
                          ) : (
                            <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
                              <Spinner size={12} /> 본문을 불러오는 중입니다.
                            </p>
                          )}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </Screen>
  );
}

const SELECT =
  "h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60";

function Editor({ connected }: { connected: boolean }) {
  const editor = useSkillStore((state) => state.editor);
  const saving = useSkillStore((state) => state.saving);
  const store = useSkillStore;
  const [showBody, setShowBody] = useState(true);

  if (editor === null) return null;

  const blocked = describeSaveBlock(editor);
  const hint = describeNameHint(editor);

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {editor.isNew ? (
        <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_120px]">
          <label className="flex min-w-0 flex-col gap-1 text-[11px]">
            이름
            <Input
              className={cn("h-8 font-mono text-xs", hint.invalid && "border-destructive")}
              value={editor.name}
              placeholder="my-skill"
              onChange={(event) => store.getState().patchEditor({ name: event.target.value.trim().toLowerCase() })}
            />
            <span className={cn("min-w-0 break-words", hint.invalid ? "text-destructive" : "text-muted-foreground")}>
              {hint.text}
            </span>
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-[11px]">
            범위
            <select
              className={SELECT}
              value={editor.scope}
              onChange={(event) => store.getState().patchEditor({ scope: parseScope(event.target.value) })}
            >
              <option value="project">프로젝트</option>
              <option value="global">전역</option>
            </select>
          </label>
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          {scopeLabel(editor.scope)} 범위 · 이름과 범위는 만든 뒤에 바꿀 수 없습니다.
        </p>
      )}

      <label className="flex min-w-0 flex-col gap-1 text-[11px]">
        설명
        <Input
          className="h-8 text-xs"
          value={editor.description}
          placeholder="이 도구를 언제 쓰는지 한 줄로"
          onChange={(event) => store.getState().patchEditor({ description: event.target.value })}
        />
      </label>

      <p className="min-w-0 break-words rounded-md bg-background/60 px-2 py-1.5 text-[11px] text-muted-foreground">
        {describeUsage(editor.name)}
      </p>

      <button
        type="button"
        aria-expanded={showBody}
        onClick={() => setShowBody((value) => !value)}
        className="self-start rounded px-1 text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        본문 {showBody ? "접기" : "펼치기"} ({editor.body.split("\n").length}줄)
      </button>
      {showBody ? (
        <Textarea
          rows={12}
          className="font-mono text-[11px]"
          value={editor.body}
          aria-label="도구 본문"
          onChange={(event) => store.getState().patchEditor({ body: event.target.value })}
        />
      ) : null}

      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Button size="sm" variant="primary" onClick={() => store.getState().saveEditor()} disabled={!connected || saving || blocked.length > 0}>
          {saving ? <Spinner size={12} /> : <Save size={12} aria-hidden="true" />} 저장
        </Button>
        <Button size="sm" variant="outline" onClick={() => void store.getState().insertDefaultBody()} disabled={saving}>
          <FileText size={12} aria-hidden="true" /> 기본 양식
        </Button>
        {!editor.isNew ? (
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() =>
              void store.getState().deleteSkill({ name: editor.name, scope: editor.scope, description: editor.description })
            }
            disabled={!connected || saving}
          >
            <Trash2 size={12} aria-hidden="true" /> 삭제
          </Button>
        ) : null}
        {blocked ? <span className="min-w-0 break-words text-[11px] text-muted-foreground">{blocked}</span> : null}
      </div>
    </div>
  );
}
