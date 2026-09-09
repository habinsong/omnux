import { useEffect, useRef, useState } from "react";
import { FileDown, PenLine, RefreshCcw, Send, Sparkles } from "lucide-react";
import { Screen, ScreenNotice } from "../../components/screen/Screen";
import { ScreenTabs, type ScreenTab } from "../../components/screen/ScreenTabs";
import { Button, Input, Spinner, Textarea, cn } from "../../components/ui/primitives";
import { useDesktopShellStore } from "../../shell-store";
import { useDesktopAuthStore } from "../auth/auth-store";
import { useNotebookPageBridge, useNotebookStore } from "./notebook-store";
import {
  NOTEBOOK_DOCUMENTS,
  NOTEBOOK_KINDS,
  describeAppendBlock,
  describeDocument,
  describeProject,
  describeTruncation,
  kindLabel,
  type NotebookField,
  type NotebookKind
} from "./notebook-model";

/* ============================================================================
   노트 화면.
   캡슐 탭: 남기기 + 문서 넷.
   "남기기" 는 입력 한 곳, 문서 탭은 그 문서 하나만 보여준다.
   ============================================================================ */

type TabId = "write" | NotebookField;

export function NotebookPage() {
  useNotebookPageBridge();

  const bridgeStatus = useDesktopShellStore((state) => state.bridge.status);
  const authStatus = useDesktopAuthStore((state) => state.auth.status);
  const connected = bridgeStatus === "connected" && authStatus === "authenticated";

  const snapshot = useNotebookStore((state) => state.snapshot);
  const snapshotProject = useNotebookStore((state) => state.snapshotProject);
  const loaded = useNotebookStore((state) => state.loaded);
  const loading = useNotebookStore((state) => state.loading);
  const pending = useNotebookStore((state) => state.pending);
  const projectKeyDraft = useNotebookStore((state) => state.projectKeyDraft);
  const lastError = useNotebookStore((state) => state.lastError);
  const lastMessage = useNotebookStore((state) => state.lastMessage);
  const store = useNotebookStore;

  const [tab, setTab] = useState<TabId>("write");
  const loadedOnce = useRef(false);

  useEffect(() => {
    if (!connected || loadedOnce.current) return;
    loadedOnce.current = true;
    store.getState().load();
  }, [connected, store]);

  const projectChanged = loaded && snapshotProject !== projectKeyDraft.trim();

  const tabs: ScreenTab[] = [
    { id: "write", label: "남기기", icon: PenLine },
    ...NOTEBOOK_DOCUMENTS.map((definition) => ({
      id: definition.field,
      label: definition.label,
      badge: snapshot[definition.field].exists ? undefined : "없음"
    }))
  ];

  return (
    <Screen
      title="노트"
      hint="정한 것, 확인한 것, 넘길 것을 프로젝트별로 남깁니다."
      actions={
        <>
          <Button variant="outline" size="sm" onClick={() => store.getState().load()} disabled={!connected || loading}>
            {loading ? <Spinner size={14} /> : <RefreshCcw size={14} aria-hidden="true" />} 다시 조회
          </Button>
          <Button variant="primary" size="sm" onClick={() => store.getState().createHandoff()} disabled={!connected || pending}>
            {pending ? <Spinner size={14} /> : <FileDown size={14} aria-hidden="true" />} 이어보기 만들기
          </Button>
        </>
      }
      notice={
        !connected ? (
          <ScreenNotice tone="warning">연결되지 않았습니다.</ScreenNotice>
        ) : lastError ? (
          <ScreenNotice tone="danger">{lastError}</ScreenNotice>
        ) : projectChanged ? (
          <ScreenNotice tone="warning">
            아래는 «{describeProject(snapshotProject)}» 것입니다. «{describeProject(projectKeyDraft)}» 로 보려면 다시 조회하세요.
          </ScreenNotice>
        ) : lastMessage ? (
          <ScreenNotice>{lastMessage}</ScreenNotice>
        ) : null
      }
    >
      <div className="flex min-w-0 shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
        <label className="flex min-w-0 flex-1 items-center gap-2 text-[11px]">
          <span className="shrink-0 text-muted-foreground">프로젝트</span>
          <Input
            className="h-8 min-w-0 flex-1 text-xs"
            value={projectKeyDraft}
            aria-label="프로젝트 기준"
            placeholder="비우면 기본 프로젝트"
            onChange={(event) => store.getState().setProjectKeyDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") store.getState().load();
            }}
          />
        </label>
        <Button variant="outline" size="sm" className="shrink-0" onClick={() => store.getState().load()} disabled={!connected || loading}>
          이 프로젝트로 보기
        </Button>
      </div>

      <ScreenTabs tabs={tabs} value={tab} onChange={(id) => setTab(id as TabId)} label="노트 보기 종류" />

      {tab === "write" ? <WritePanel connected={connected} /> : <DocumentPanel field={tab} />}
    </Screen>
  );
}

function WritePanel({ connected }: { connected: boolean }) {
  const appendKind = useNotebookStore((state) => state.appendKind);
  const appendText = useNotebookStore((state) => state.appendText);
  const pending = useNotebookStore((state) => state.pending);
  const store = useNotebookStore;
  const blocked = describeAppendBlock(appendText);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex min-w-0 shrink-0 gap-1.5 overflow-x-auto border-b border-border px-2 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {NOTEBOOK_KINDS.map((entry) => (
          <button
            key={entry.kind}
            type="button"
            aria-pressed={appendKind === entry.kind}
            onClick={() => store.getState().setAppendKind(entry.kind)}
            className={cn(
              "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
              "outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
              appendKind === entry.kind ? "bg-primary/12 text-primary" : "text-muted-foreground hover:bg-accent"
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 p-3">
        <Textarea
          className="h-full min-h-0 w-full resize-none text-xs"
          value={appendText}
          aria-label="남길 내용"
          placeholder={`${kindLabel(appendKind)} 문서에 붙일 내용`}
          onChange={(event) => store.getState().setAppendText(event.target.value)}
        />
      </div>

      <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-2 border-t border-border p-3">
        <Button
          variant="primary"
          size="sm"
          onClick={() => store.getState().append()}
          disabled={!connected || pending || blocked.length > 0}
        >
          {pending ? <Spinner size={12} /> : <Send size={12} aria-hidden="true" />} {kindLabel(appendKind)}에 남기기
        </Button>
        <Button variant="outline" size="sm" onClick={() => store.getState().insertTemplate(appendKind)}>
          <Sparkles size={12} aria-hidden="true" /> 서식
        </Button>
        {appendText.trim().length > 0 ? (
          <Button variant="ghost" size="sm" onClick={() => store.getState().setAppendText("")}>
            비우기
          </Button>
        ) : null}
        {blocked ? <span className="min-w-0 break-words text-[11px] text-muted-foreground">{blocked}</span> : null}
      </div>
    </div>
  );
}

function DocumentPanel({ field }: { field: NotebookField }) {
  const document = useNotebookStore((state) => state.snapshot[field]);
  const loaded = useNotebookStore((state) => state.loaded);
  const store = useNotebookStore;
  const definition = NOTEBOOK_DOCUMENTS.find((entry) => entry.field === field);
  const truncation = describeTruncation(document);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="shrink-0 space-y-0.5 border-b border-border px-3 py-2">
        <p className="min-w-0 truncate text-[11px] text-muted-foreground">
          {definition?.description} · {describeDocument(document)}
        </p>
        {document.path ? (
          <p className="min-w-0 break-all font-mono text-[10px] text-muted-foreground">{document.path}</p>
        ) : null}
      </div>

      {truncation ? (
        <p className="shrink-0 border-b border-border bg-warning/10 px-3 py-2 text-[11px] text-warning">{truncation}</p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto">
        {document.content ? (
          <pre className="min-w-0 whitespace-pre-wrap break-words p-3 text-xs leading-relaxed">{document.content}</pre>
        ) : (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            {loaded ? "아직 남긴 내용이 없습니다." : "다시 조회하면 나옵니다."}
          </p>
        )}
      </div>

      {definition?.kind ? (
        <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-2 border-t border-border p-2">
          <Button size="sm" variant="outline" onClick={() => store.getState().setAppendKind(definition.kind as NotebookKind)}>
            여기에 남기기
          </Button>
          {document.content ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => store.getState().applyDraft(definition.kind as NotebookKind, document.content)}
            >
              지금 내용을 초안으로
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="shrink-0 border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
          이어보기 문서는 위의 「이어보기 만들기」로 만듭니다.
        </p>
      )}
    </div>
  );
}
