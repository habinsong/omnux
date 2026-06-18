import { FileSearch, ListChecks, RefreshCcw, ShieldCheck } from "lucide-react";
import { Badge, Button, Spinner } from "../../components/ui/primitives";
import type { OpsStoreActions, OpsToolsState } from "./OperationsPage.shared";
import { buildWorkspaceCandidates, filterWorkspaceCandidates } from "./OperationsPage.shared";
import { WorkspaceBrowser, WorkspacePreview } from "./OperationsWorkspacePanel";

type OperationsContextPanelProps = {
  readonly context: OpsToolsState["context"];
  readonly store: OpsStoreActions;
  readonly canRequest: boolean;
};

export function OperationsContextPanel({ context, store, canRequest }: OperationsContextPanelProps) {
  const workspacePath = context.logicPath?.scope === "workspace" ? context.logicPath : null;
  const workspaceCandidates = buildWorkspaceCandidates({
    items: workspacePath?.items || [],
    sources: context.project?.sources || [],
    commands: context.commands?.items || context.project?.commands || [],
    recentFiles: context.recentWorkspaceFiles,
    currentPreviewPath: context.filePreview?.path || "",
    query: context.workspaceSearch
  });
  const filteredWorkspaceCandidates = filterWorkspaceCandidates(workspaceCandidates, context.workspaceSearch);
  const workspaceFileCount = workspacePath?.items.filter((item) => !item.isDirectory).length || 0;
  const workspaceDirectoryCount = workspacePath?.items.filter((item) => item.isDirectory).length || 0;

  return (
    <div className="min-w-0 space-y-3 rounded-md border border-border bg-muted/20 p-3 xl:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <FileSearch size={16} className="shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">문맥 · 파일</p>
            <p className="truncate text-xs text-muted-foreground">프로젝트 지침, 명령 템플릿, 설정 상태, 작업공간 미리보기를 읽기 전용으로 확인합니다.</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1">
          <Button variant="outline" size="sm" onClick={store.loadProjectContext} disabled={!canRequest || context.loading}>
            {context.loading ? <Spinner size={14} /> : <RefreshCcw size={14} aria-hidden="true" />} 문맥
          </Button>
          <Button variant="outline" size="sm" onClick={store.loadCommandTemplates} disabled={!canRequest || context.commandsLoading}>
            {context.commandsLoading ? <Spinner size={14} /> : <ListChecks size={14} aria-hidden="true" />} 명령
          </Button>
          <Button variant="outline" size="sm" onClick={store.loadSetupState} disabled={!canRequest || context.setupLoading}>
            {context.setupLoading ? <Spinner size={14} /> : <ShieldCheck size={14} aria-hidden="true" />} 설정
          </Button>
          <Button variant="outline" size="sm" onClick={store.loadMetrics} disabled={!canRequest || context.setupLoading}>
            지표
          </Button>
        </div>
      </div>
      {context.lastError ? <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{context.lastError}</p> : null}
      <ContextStats context={context} />
      <ContextLists context={context} />
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(320px,440px)_minmax(0,1fr)]">
        <WorkspaceBrowser
          context={context}
          store={store}
          canRequest={canRequest}
          workspacePath={workspacePath}
          workspaceDirectoryCount={workspaceDirectoryCount}
          workspaceFileCount={workspaceFileCount}
          filteredWorkspaceCandidates={filteredWorkspaceCandidates}
        />
        <WorkspacePreview context={context} store={store} canRequest={canRequest} />
      </div>
    </div>
  );
}

function ContextStats({ context }: { readonly context: OpsToolsState["context"] }) {
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
      <div className="rounded-md bg-background/60 px-2 py-1.5">
        <p className="text-[11px] text-muted-foreground">지침</p>
        <p className="font-mono text-sm font-semibold tabular-nums">{context.project?.sources.length || 0}</p>
      </div>
      <div className="rounded-md bg-background/60 px-2 py-1.5">
        <p className="text-[11px] text-muted-foreground">스킬</p>
        <p className="font-mono text-sm font-semibold tabular-nums">{context.project?.skills.length || 0}</p>
      </div>
      <div className="rounded-md bg-background/60 px-2 py-1.5">
        <p className="text-[11px] text-muted-foreground">명령</p>
        <p className="font-mono text-sm font-semibold tabular-nums">{context.commands?.items.length ?? context.project?.commands.length ?? 0}</p>
      </div>
      <div className="rounded-md bg-background/60 px-2 py-1.5">
        <p className="text-[11px] text-muted-foreground">공급자</p>
        <p className="truncate text-sm font-semibold">
          {[context.setup?.groqApiKeySet, context.setup?.geminiApiKeySet, context.setup?.cerebrasApiKeySet, context.setup?.nvidiaApiKeySet, context.setup?.codexApiKeySet].filter(Boolean).length}
        </p>
      </div>
      <div className="rounded-md bg-background/60 px-2 py-1.5">
        <p className="text-[11px] text-muted-foreground">외부</p>
        <p className="truncate text-sm font-semibold">{context.setup?.externalDashboardEnabled ? "켜짐" : "꺼짐"}</p>
      </div>
    </div>
  );
}

function ContextLists({ context }: { readonly context: OpsToolsState["context"] }) {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      <div className="min-w-0 space-y-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <FileSearch size={13} className="shrink-0" aria-hidden="true" />
          <span className="truncate">지침 원본</span>
        </div>
        <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
          {(context.project?.sources || []).slice(0, 30).map((source) => (
            <div key={`${source.order}-${source.path}`} className="rounded-md bg-background/50 px-2 py-1.5 text-xs">
              <p className="truncate font-mono">{source.path}</p>
              <p className="truncate text-[11px] text-muted-foreground">{source.scope} · 순서 {source.order}</p>
            </div>
          ))}
          {context.project && context.project.sources.length === 0 ? <p className="py-4 text-center text-xs text-muted-foreground">지침 소스 없음</p> : null}
          {!context.project ? <p className="py-4 text-center text-xs text-muted-foreground">문맥을 조회하면 지침 소스가 표시됩니다.</p> : null}
        </div>
      </div>
      <div className="min-w-0 space-y-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <ListChecks size={13} className="shrink-0" aria-hidden="true" />
          <span className="truncate">명령 템플릿</span>
        </div>
        <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
          {(context.commands?.items || context.project?.commands || []).slice(0, 30).map((command) => (
            <div key={`${command.scope}-${command.name}-${command.path}`} className="rounded-md bg-background/50 px-2 py-1.5 text-xs">
              <p className="truncate font-medium">{command.name}</p>
              <p className="truncate text-[11px] text-muted-foreground">{command.summary || command.description || command.path}</p>
            </div>
          ))}
          {(context.commands || context.project) && (context.commands?.items.length ?? context.project?.commands.length ?? 0) === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">명령 템플릿 없음</p>
          ) : null}
          {!context.commands && !context.project ? <p className="py-4 text-center text-xs text-muted-foreground">명령을 조회하면 템플릿이 표시됩니다.</p> : null}
        </div>
      </div>
      <SetupStateList context={context} />
    </div>
  );
}

function SetupStateList({ context }: { readonly context: OpsToolsState["context"] }) {
  const setupItems = [
    { label: "Telegram", enabled: Boolean(context.setup?.telegramBotTokenSet && context.setup?.telegramChatIdSet) },
    { label: "Groq", enabled: Boolean(context.setup?.groqApiKeySet) },
    { label: "Gemini", enabled: Boolean(context.setup?.geminiApiKeySet) },
    { label: "Cerebras", enabled: Boolean(context.setup?.cerebrasApiKeySet) },
    { label: "NVIDIA", enabled: Boolean(context.setup?.nvidiaApiKeySet) },
    { label: "Codex", enabled: Boolean(context.setup?.codexApiKeySet) }
  ] as const;

  return (
    <div className="min-w-0 space-y-2">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        <ShieldCheck size={13} className="shrink-0" aria-hidden="true" />
        <span className="truncate">설정 상태</span>
      </div>
      <div className="grid grid-cols-2 gap-1">
        {setupItems.map((item) => (
          <div key={item.label} className="flex min-w-0 items-center justify-between gap-2 rounded-md bg-background/50 px-2 py-1.5 text-xs">
            <span className="truncate">{item.label}</span>
            <Badge tone={item.enabled ? "success" : "outline"}>{item.enabled ? "있음" : "비움"}</Badge>
          </div>
        ))}
      </div>
      <p className="truncate rounded-md bg-background/50 px-2 py-1.5 text-[11px] text-muted-foreground">
        {context.setup?.dashboardExternalUrls[0] || "설정 상태를 조회하면 외부 URL이 표시됩니다."}
      </p>
    </div>
  );
}
