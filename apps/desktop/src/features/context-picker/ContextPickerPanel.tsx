import { useEffect, type ReactNode } from "react";
import { BookOpen, Check, ClipboardList, CornerDownRight, Database, FileSearch, FileText, FolderOpen, Plus, RefreshCcw, Search, X } from "lucide-react";
import { Badge, Button, Input, Spinner, cn } from "../../components/ui/primitives";
import {
  type ContextMemoryResult,
  type ContextPathEntry,
  type ContextPickerSelection,
  type ContextPickerTab,
  useContextPickerBridge,
  useContextPickerStore
} from "./context-picker-store";

type ContextPickerPanelProps = {
  canRequest: boolean;
  surface: "ask" | "build" | "logic";
  applyLabel: string;
  onApply: (items: ContextPickerSelection[]) => void;
  className?: string;
};

const TAB_META: Record<ContextPickerTab, { label: string; icon: typeof Database }> = {
  memory: { label: "메모리", icon: Database },
  workspace: { label: "파일", icon: FolderOpen },
  paths: { label: "경로", icon: ClipboardList }
};

function filterEntries(items: ContextPathEntry[], query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return items;
  return items.filter((item) => [item.name, item.selectPath, item.browsePath, item.description].join("\n").toLowerCase().includes(normalized));
}

function pathText(entry: ContextPathEntry) {
  return entry.selectPath || entry.browsePath || entry.name;
}

function SurfaceHint({ surface }: { surface: ContextPickerPanelProps["surface"] }) {
  const text =
    surface === "logic"
      ? "선택 노드의 path/note/query 필드 또는 실행 입력에 적용합니다."
      : surface === "build"
        ? "선택한 문맥을 코딩 요청 입력에 붙입니다."
        : "선택한 문맥을 질문 입력에 붙입니다.";
  return <p className="truncate text-[11px] text-muted-foreground">{text}</p>;
}

function SelectionTray({ applyLabel, onApply }: Pick<ContextPickerPanelProps, "applyLabel" | "onApply">) {
  const selections = useContextPickerStore((state) => state.selections);
  const removeSelection = useContextPickerStore((state) => state.removeSelection);
  const clearSelections = useContextPickerStore((state) => state.clearSelections);
  if (selections.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        메모리·파일·경로를 선택하면 여기서 한 번에 적용합니다.
      </div>
    );
  }
  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/25 p-2.5">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Check size={14} className="shrink-0 text-primary" aria-hidden="true" />
          <span className="truncate text-xs font-semibold">선택 문맥</span>
          <Badge tone="primary">{selections.length}</Badge>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={clearSelections}>비우기</Button>
          <Button variant="primary" size="sm" className="h-7 px-2" onClick={() => onApply(selections)}>
            <ClipboardList size={13} aria-hidden="true" /> {applyLabel}
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        {selections.map((item) => (
          <button
            key={item.id}
            type="button"
            className="flex max-w-full items-center gap-1 rounded-md border border-border bg-card/70 px-2 py-1 text-[11px] transition-colors hover:bg-accent"
            onClick={() => removeSelection(item.id)}
            title="선택 해제"
          >
            <Badge tone="outline" className="shrink-0">{item.kind}</Badge>
            <span className="min-w-0 truncate font-mono">{item.path || item.title}</span>
            <X size={12} className="shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  );
}

function RowAction({ children }: { children: ReactNode }) {
  return <div className="flex shrink-0 items-center gap-1">{children}</div>;
}

function MemoryTab({ canRequest }: { canRequest: boolean }) {
  const store = useContextPickerStore();
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <div className="relative min-w-0">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={store.memoryQuery}
            placeholder="메모리 검색어"
            className="pl-8 text-xs"
            onChange={(event) => store.setMemoryQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                if (canRequest) store.searchMemory();
              }
            }}
          />
        </div>
        <Button variant="outline" size="sm" onClick={store.searchMemory} disabled={!canRequest || store.memoryLoading || !store.memoryQuery.trim()}>
          {store.memoryLoading ? <Spinner size={14} /> : <Search size={14} aria-hidden="true" />} 검색
        </Button>
      </div>
      <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
        {store.memoryResults.map((item: ContextMemoryResult) => (
          <article key={`${item.path}-${item.fromLine || 0}`} className="rounded-md border border-border bg-card/55 p-2">
            <div className="flex min-w-0 items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold">{item.title}</p>
                <p className="truncate font-mono text-[11px] text-muted-foreground">{item.path}</p>
                {item.detail ? <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{item.detail}</p> : null}
              </div>
              <RowAction>
                <Badge tone="outline">{item.score}</Badge>
                <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => store.previewMemory(item)} disabled={!canRequest}>
                  <FileText size={13} aria-hidden="true" /> 보기
                </Button>
                <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => store.selectMemory(item)}>
                  <Plus size={13} aria-hidden="true" /> 선택
                </Button>
              </RowAction>
            </div>
            {item.badges.length > 0 ? (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {item.badges.slice(0, 4).map((badge) => <Badge key={badge} tone="outline">{badge}</Badge>)}
              </div>
            ) : null}
          </article>
        ))}
        {!store.memoryLoading && store.memoryResults.length === 0 ? (
          <p className="rounded-md bg-muted/25 px-3 py-6 text-center text-xs text-muted-foreground">검색 결과가 없습니다.</p>
        ) : null}
      </div>
    </div>
  );
}

function WorkspaceTab({ canRequest }: { canRequest: boolean }) {
  const store = useContextPickerStore();
  const snapshot = store.workspacePath;
  const entries = filterEntries(snapshot?.items || [], store.workspaceSearch);
  useEffect(() => {
    if (canRequest && !snapshot && !store.workspaceLoading) store.loadWorkspace("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRequest]);
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <Input
          value={store.workspaceBrowsePath}
          placeholder="workspace browse path"
          className="font-mono text-xs"
          onChange={(event) => store.setWorkspaceBrowsePath(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              if (canRequest) store.loadWorkspace();
            }
          }}
        />
        <Button variant="outline" size="sm" onClick={() => store.loadWorkspace()} disabled={!canRequest || store.workspaceLoading}>
          {store.workspaceLoading ? <Spinner size={14} /> : <FolderOpen size={14} aria-hidden="true" />} 열기
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => store.loadWorkspace("")} disabled={!canRequest || store.workspaceLoading}>
          <FolderOpen size={13} aria-hidden="true" /> root
        </Button>
        {snapshot?.parentBrowsePath ? (
          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => store.loadWorkspace(snapshot.parentBrowsePath)} disabled={!canRequest || store.workspaceLoading}>
            <CornerDownRight size={13} aria-hidden="true" /> 상위
          </Button>
        ) : null}
        <Badge tone="outline" className="max-w-[180px] truncate">{snapshot?.displayPath || "workspace"}</Badge>
      </div>
      <div className="relative">
        <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input value={store.workspaceSearch} placeholder="현재 폴더 필터" className="pl-8 text-xs" onChange={(event) => store.setWorkspaceSearch(event.target.value)} />
      </div>
      <PathEntryList
        entries={entries}
        emptyLabel="workspace 파일이 없습니다."
        onOpenDirectory={(entry) => store.loadWorkspace(entry.browsePath)}
        onPreview={(entry) => store.previewWorkspaceFile(pathText(entry))}
        onSelect={(entry) => store.selectWorkspaceFile(entry)}
        canRequest={canRequest}
        previewFiles
      />
    </div>
  );
}

function PathsTab({ canRequest }: { canRequest: boolean }) {
  const store = useContextPickerStore();
  const snapshot = store.pathSnapshot;
  useEffect(() => {
    if (canRequest && !snapshot && !store.pathLoading) store.loadPathBrowser("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRequest, store.pathScope]);
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <select
          value={store.pathScope}
          onChange={(event) => store.setPathScope(event.target.value === "workspace" ? "workspace" : "memory")}
          className="h-9 rounded-md border border-input bg-transparent px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          aria-label="문맥 경로 범위"
        >
          <option value="memory">memory</option>
          <option value="workspace">workspace</option>
        </select>
        <select
          value={store.pathRootKey}
          onChange={(event) => store.setPathRootKey(event.target.value)}
          className="h-9 rounded-md border border-input bg-transparent px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          aria-label="문맥 경로 루트"
        >
          <option value="">{snapshot?.rootLabel || "default root"}</option>
          {(snapshot?.roots || []).map((root) => <option key={root.key} value={root.key}>{root.label || root.key}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <Input
          value={store.pathBrowsePath}
          placeholder="browse path"
          className="font-mono text-xs"
          onChange={(event) => store.setPathBrowsePath(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              if (canRequest) store.loadPathBrowser();
            }
          }}
        />
        <Button variant="outline" size="sm" onClick={() => store.loadPathBrowser()} disabled={!canRequest || store.pathLoading}>
          {store.pathLoading ? <Spinner size={14} /> : <RefreshCcw size={14} aria-hidden="true" />} 조회
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => store.loadPathBrowser("")} disabled={!canRequest || store.pathLoading}>
          <FolderOpen size={13} aria-hidden="true" /> root
        </Button>
        {snapshot?.parentBrowsePath ? (
          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => store.loadPathBrowser(snapshot.parentBrowsePath)} disabled={!canRequest || store.pathLoading}>
            <CornerDownRight size={13} aria-hidden="true" /> 상위
          </Button>
        ) : null}
        <Badge tone="outline" className="max-w-[180px] truncate">{snapshot?.displayPath || store.pathScope}</Badge>
      </div>
      <PathEntryList
        entries={snapshot?.items || []}
        emptyLabel="경로 후보가 없습니다."
        onOpenDirectory={(entry) => store.loadPathBrowser(entry.browsePath)}
        onPreview={() => undefined}
        onSelect={(entry) => store.selectPathEntry(entry)}
        canRequest={canRequest}
      />
    </div>
  );
}

function PathEntryList({
  entries,
  emptyLabel,
  onOpenDirectory,
  onPreview,
  onSelect,
  canRequest,
  previewFiles = false
}: {
  entries: ContextPathEntry[];
  emptyLabel: string;
  onOpenDirectory: (entry: ContextPathEntry) => void;
  onPreview: (entry: ContextPathEntry) => void;
  onSelect: (entry: ContextPathEntry) => void;
  canRequest: boolean;
  previewFiles?: boolean;
}) {
  return (
    <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
      {entries.map((entry) => (
        <article key={`${entry.name}-${entry.browsePath}-${entry.selectPath}`} className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-card/55 px-2 py-1.5">
          {entry.isDirectory ? (
            <FolderOpen size={14} className="shrink-0 text-primary" aria-hidden="true" />
          ) : (
            <FileText size={14} className="shrink-0 text-muted-foreground" aria-hidden="true" />
          )}
          <button
            type="button"
            className="min-w-0 flex-1 text-left"
            onClick={() => entry.isDirectory ? onOpenDirectory(entry) : onSelect(entry)}
            disabled={!canRequest}
          >
            <span className="block truncate text-xs font-medium">{entry.name}</span>
            <span className="block truncate font-mono text-[11px] text-muted-foreground">{pathText(entry)}</span>
          </button>
          <RowAction>
            {previewFiles && !entry.isDirectory ? (
              <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => onPreview(entry)} disabled={!canRequest}>
                <FileSearch size={13} aria-hidden="true" /> 보기
              </Button>
            ) : null}
            <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => entry.isDirectory ? onOpenDirectory(entry) : onSelect(entry)} disabled={!canRequest}>
              {entry.isDirectory ? <FolderOpen size={13} aria-hidden="true" /> : <Plus size={13} aria-hidden="true" />}
              {entry.isDirectory ? "열기" : "선택"}
            </Button>
          </RowAction>
        </article>
      ))}
      {entries.length === 0 ? <p className="rounded-md bg-muted/25 px-3 py-6 text-center text-xs text-muted-foreground">{emptyLabel}</p> : null}
    </div>
  );
}

function PreviewPanel() {
  const preview = useContextPickerStore((state) => state.preview);
  const clearPreview = useContextPickerStore((state) => state.clearPreview);
  if (!preview) return null;
  return (
    <div className="overflow-hidden rounded-md border border-border bg-card/70">
      <div className="flex min-w-0 items-center justify-between gap-2 border-b border-border px-2.5 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <BookOpen size={13} className="shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0 truncate font-mono text-xs font-medium" title={preview.path}>{preview.path}</span>
          {preview.loading ? <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground"><Spinner size={12} /> 읽는 중</span> : null}
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="문맥 preview 닫기" onClick={clearPreview}>
          <X size={13} aria-hidden="true" />
        </Button>
      </div>
      {preview.error ? <p className="px-2.5 py-2 text-xs text-destructive">{preview.error}</p> : null}
      {preview.text ? <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-[11px] leading-5 text-foreground">{preview.text}</pre> : null}
      {!preview.loading && !preview.error && !preview.text ? <p className="px-2.5 py-3 text-center text-xs text-muted-foreground">표시할 원문이 없습니다.</p> : null}
    </div>
  );
}

export function ContextPickerPanel({ canRequest, surface, applyLabel, onApply, className }: ContextPickerPanelProps) {
  useContextPickerBridge();
  const store = useContextPickerStore();
  return (
    <div className={cn("space-y-3 rounded-lg border border-border bg-muted/25 p-3", className)}>
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ClipboardList size={15} className="shrink-0 text-primary" aria-hidden="true" />
            <h3 className="truncate text-sm font-semibold">문맥 picker</h3>
            <Badge tone="outline">공통</Badge>
          </div>
          <SurfaceHint surface={surface} />
        </div>
        {store.lastError ? <Badge tone="destructive" className="max-w-[220px] truncate">{store.lastError}</Badge> : null}
      </div>

      <div className="flex gap-1 rounded-md bg-background/50 p-0.5 text-xs" role="tablist" aria-label="문맥 picker">
        {(Object.keys(TAB_META) as ContextPickerTab[]).map((tab) => {
          const Icon = TAB_META[tab].icon;
          const on = store.tab === tab;
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => store.setTab(tab)}
              className={cn(
                "flex min-w-0 flex-1 items-center justify-center gap-1 rounded px-2 py-1.5 font-medium transition-colors",
                on ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon size={13} aria-hidden="true" /> <span className="truncate">{TAB_META[tab].label}</span>
            </button>
          );
        })}
      </div>

      <SelectionTray applyLabel={applyLabel} onApply={onApply} />

      {store.tab === "memory" ? <MemoryTab canRequest={canRequest} /> : null}
      {store.tab === "workspace" ? <WorkspaceTab canRequest={canRequest} /> : null}
      {store.tab === "paths" ? <PathsTab canRequest={canRequest} /> : null}
      <PreviewPanel />
    </div>
  );
}
