import { CornerDownRight, FileSearch, FileText, FolderOpen, RefreshCcw, Search } from "lucide-react";
import { Badge, Button, Input, Spinner } from "../../components/ui/primitives";
import type { OpsStoreActions, OpsToolsState } from "./OperationsPage.shared";
import { compactPath, filterWorkspaceCandidates } from "./OperationsPage.shared";

type WorkspaceBrowserProps = {
  readonly context: OpsToolsState["context"];
  readonly store: OpsStoreActions;
  readonly canRequest: boolean;
  readonly workspacePath: OpsToolsState["context"]["logicPath"];
  readonly workspaceDirectoryCount: number;
  readonly workspaceFileCount: number;
  readonly filteredWorkspaceCandidates: ReturnType<typeof filterWorkspaceCandidates>;
};

export function WorkspaceBrowser({
  context,
  store,
  canRequest,
  workspacePath,
  workspaceDirectoryCount,
  workspaceFileCount,
  filteredWorkspaceCandidates
}: WorkspaceBrowserProps) {
  return (
    <div className="min-w-0 space-y-2 rounded-md border border-border bg-background/50 p-2.5">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <FolderOpen size={15} className="shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold">작업공간 탐색</p>
            <p className="truncate font-mono text-[11px] text-muted-foreground">{workspacePath?.displayPath || "워크스페이스"}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Badge tone="outline">폴더 {workspaceDirectoryCount}</Badge>
          <Badge tone="outline">파일 {workspaceFileCount}</Badge>
        </div>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <Input
          value={context.logicBrowsePath}
          placeholder="탐색 경로"
          onChange={(event) => store.setLogicPathField("logicBrowsePath", event.target.value)}
          className="font-mono text-xs"
        />
        <Button variant="outline" size="sm" onClick={() => store.loadLogicPath(context.logicBrowsePath, "workspace")} disabled={!canRequest || context.loading}>
          {context.loading ? <Spinner size={14} /> : <FolderOpen size={14} aria-hidden="true" />} 열기
        </Button>
      </div>
      <div className="flex flex-wrap gap-1">
        <Button variant="ghost" size="sm" onClick={() => store.loadLogicPath("", "workspace")} disabled={!canRequest || context.loading}>
          <FolderOpen size={13} aria-hidden="true" /> 루트
        </Button>
        {workspacePath?.parentBrowsePath ? (
          <Button variant="ghost" size="sm" onClick={() => store.loadLogicPath(workspacePath.parentBrowsePath || "", "workspace")} disabled={!canRequest || context.loading}>
            <CornerDownRight size={13} aria-hidden="true" /> 상위
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" onClick={store.loadProjectContext} disabled={!canRequest || context.loading}>
          <RefreshCcw size={13} aria-hidden="true" /> 문맥 갱신
        </Button>
      </div>
      <div className="relative">
        <Search size={14} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          value={context.workspaceSearch}
          placeholder="현재 폴더·문맥·최근 파일 검색"
          onChange={(event) => store.setWorkspaceSearch(event.target.value)}
          className="pl-7"
        />
      </div>
      <div className="max-h-80 space-y-1 overflow-y-auto pr-1">
        {filteredWorkspaceCandidates.map((candidate) => (
          <button
            key={candidate.key}
            type="button"
            className="flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent/60 active:scale-[0.99]"
            onClick={() => candidate.isDirectory ? store.loadLogicPath(candidate.browsePath, "workspace") : store.openWorkspaceFile(candidate.path)}
          >
            {candidate.isDirectory ? (
              <FolderOpen size={14} className="shrink-0 text-primary" aria-hidden="true" />
            ) : (
              <FileText size={14} className="shrink-0 text-muted-foreground" aria-hidden="true" />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{candidate.name}</span>
              <span className="block truncate font-mono text-[11px] text-muted-foreground">{compactPath(candidate.path)}</span>
            </span>
            <Badge tone={candidate.isDirectory ? "primary" : candidate.source === "직접" ? "warning" : "outline"} className="shrink-0">{candidate.source}</Badge>
          </button>
        ))}
        {filteredWorkspaceCandidates.length === 0 ? (
          <div className="rounded-md bg-muted/30 px-3 py-6 text-center">
            <FolderOpen size={18} className="mx-auto mb-2 text-muted-foreground" aria-hidden="true" />
            <p className="text-xs text-muted-foreground">검색 결과가 없습니다.</p>
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => store.loadLogicPath("", "workspace")} disabled={!canRequest || context.loading}>
              작업공간 루트 열기
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function WorkspacePreview({ context, store, canRequest }: Pick<WorkspaceBrowserProps, "context" | "store" | "canRequest">) {
  return (
    <div className="min-w-0 space-y-2 rounded-md border border-border bg-background/50 p-2.5">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <FileSearch size={15} className="shrink-0 text-primary" aria-hidden="true" />
          <span className="truncate text-xs font-semibold">작업공간 미리보기</span>
        </div>
        <Button variant="outline" size="sm" onClick={store.readWorkspaceFile} disabled={!canRequest || !context.filePath.trim() || context.readingFile}>
          {context.readingFile ? <Spinner size={14} /> : <FileSearch size={14} aria-hidden="true" />} 읽기
        </Button>
      </div>
      <Input value={context.filePath} placeholder="작업공간 상대/절대 파일 경로" onChange={(event) => store.setWorkspaceFilePath(event.target.value)} className="font-mono text-xs" />
      {context.filePreview ? (
        <div className="space-y-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Badge tone={context.filePreview.ok ? "success" : "destructive"}>{context.filePreview.ok ? "정상" : "실패"}</Badge>
            <span className="min-w-0 flex-1 truncate font-mono text-xs">{context.filePreview.path || context.filePreview.message}</span>
          </div>
          <pre className="max-h-[26rem] overflow-y-auto whitespace-pre-wrap break-words rounded bg-muted/40 p-2 font-mono text-[11px] text-muted-foreground">
            {context.filePreview.content || context.filePreview.message || "내용 없음"}
          </pre>
        </div>
      ) : (
        <div className="rounded-md bg-muted/30 px-3 py-10 text-center">
          <FileText size={18} className="mx-auto mb-2 text-muted-foreground" aria-hidden="true" />
          <p className="text-xs text-muted-foreground">파일을 선택하거나 경로를 입력하면 미리보기가 표시됩니다.</p>
        </div>
      )}
      {context.metrics ? (
        <div className="rounded-md bg-background/60 p-2">
          <p className="truncate text-xs font-semibold">상태 지표</p>
          <pre className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[11px] text-muted-foreground">{context.metrics.raw}</pre>
        </div>
      ) : null}
    </div>
  );
}
