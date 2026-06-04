import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Check, Database, Download, Eye, HardDrive, Info, RefreshCw, Route, Search, Settings2, Trash2, Upload } from "lucide-react";
import { CardBoundary } from "../../CardBoundary";
import { useDesktopShellStore } from "../../shell-store";
import type { ShellCard } from "../../shell-store";
import { useDesktopAuthStore } from "../auth/auth-store";
import { useUiLogStore } from "../ui-log/ui-log-store";
import { useSettingsPageBridge, useSettingsStore } from "./settings-store";
import type { MemorySearchResultItem } from "./settings-memory";
import { LlmModelsPanel } from "./LlmModelsPanel";
import { Badge, Button, Input, cn } from "../../components/ui/primitives";
import { SettingsTelegramPanel } from "./SettingsTelegramPanel";
import { useTelegramSettingsBridge, useTelegramSettingsStore } from "./settings-telegram-store";
import { useProviderCredentialsBridge } from "./settings-provider-credentials-store";

type SettingsTab = "general" | "models" | "memory" | "about";
type CardErrorHandler = (card: ShellCard, message: string, componentStack?: string | null) => void;
type Store = ReturnType<typeof useSettingsStore.getState>;

const SETTINGS_TABS: Array<{ id: SettingsTab; label: string; icon: typeof Settings2 }> = [
  { id: "general", label: "General", icon: Settings2 },
  { id: "models", label: "Models & services", icon: Route },
  { id: "memory", label: "Memory & backup", icon: Database },
  { id: "about", label: "About", icon: Info }
];

const BACKUP_SCOPE_LABELS: Record<string, string> = {
  conversations: "대화",
  routines: "루틴",
  "routing-policy": "라우팅 정책",
  "memory-notes": "메모리 노트",
  plans: "계획",
  tasks: "작업 그래프",
  notebooks: "노트북",
  "skills/global": "전역 스킬",
  "commands/global": "전역 명령",
  "skills/project": "프로젝트 스킬",
  "commands/project": "프로젝트 명령"
};

function memoryTierTone(tier: string): "success" | "primary" | "warning" | "outline" {
  if (tier === "working") return "success";
  if (tier === "short_term") return "primary";
  if (tier === "episodic") return "warning";
  return "outline";
}

function formatAccessTime(value: number): string {
  if (!value) return "access -";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "access -";
  return date.toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" });
}

function MemorySearchResultRow({ result, canRequest, loading, onOpen }: { result: MemorySearchResultItem; canRequest: boolean; loading: boolean; onOpen: (result: MemorySearchResultItem) => void }) {
  const lineLabel = result.startLine > 0 ? `L${result.startLine}-${result.endLine || result.startLine}` : "";
  const tier = result.memoryTier || "tier -";
  return (
    <article className="rounded-md border border-border bg-card/60 px-2.5 py-2">
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="block truncate text-xs font-medium">{result.path}</span>
          <small className="block truncate text-[11px] text-muted-foreground">{result.snippet}</small>
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <Badge tone="outline">{result.score.toFixed(2)}</Badge>
          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => onOpen(result)} disabled={!canRequest || loading} title="검색 결과 상세 읽기">
            <Eye size={13} aria-hidden="true" /> 열기
          </Button>
        </span>
      </div>
      <div className="mt-1.5 flex min-w-0 flex-wrap gap-1">
        <Badge
          tone={memoryTierTone(result.memoryTier)}
          title={result.memoryTier === "long_term" ? "오래된 long_term 결과도 score floor 정책으로 유지될 수 있습니다." : undefined}
        >
          {tier}
        </Badge>
        {result.source ? <Badge tone="outline">{result.source}</Badge> : null}
        {lineLabel ? <Badge tone="outline">{lineLabel}</Badge> : null}
        <Badge tone="outline">{formatAccessTime(result.lastAccessedAtUnixMs)}</Badge>
      </div>
    </article>
  );
}

function SetRow({ title, desc, right }: { title: string; desc: string; right: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-0">
      <div className="min-w-0">
        <b className="block text-sm">{title}</b>
        <span className="block text-xs text-muted-foreground">{desc}</span>
      </div>
      <div className="shrink-0">{right}</div>
    </div>
  );
}

function GeneralTab({ bridgeStatus, authStatus, lastMessage, loading, onError }: { bridgeStatus: string; authStatus: string; lastMessage: string; loading: boolean; onError: CardErrorHandler }) {
  return (
    <CardBoundary title="General" card="operations" onError={onError}>
      <SetRow title="미들웨어 브릿지" desc="데스크톱 앱이 실제 WebSocket 세션으로 요청을 보낼 수 있는지 표시합니다." right={<Badge tone={bridgeStatus === "connected" ? "success" : "warning"}>{bridgeStatus}</Badge>} />
      <SetRow title="인증 상태" desc="인증되지 않은 상태에서는 백그라운드 요청을 보내지 않습니다." right={<Badge tone={authStatus === "authenticated" ? "success" : "warning"}>{authStatus}</Badge>} />
      <SetRow title="최근 응답" desc={lastMessage || "아직 설정 응답이 없습니다."} right={<Badge tone="default">{loading ? "loading" : "idle"}</Badge>} />
    </CardBoundary>
  );
}

function ModelsTab({ store, canRequest, onError }: { store: Store; canRequest: boolean; onError: CardErrorHandler }) {
  return (
    <div className="space-y-4">
      <SettingsTelegramPanel canRequest={canRequest} onError={onError} />
      <LlmModelsPanel store={store} canRequest={canRequest} onError={onError} />
      <CardBoundary title="Cerebras 카탈로그" card="middleware" onError={onError}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <b className="block text-sm">Cerebras</b>
            <span className="block truncate text-xs text-muted-foreground">현재 설정: {store.cerebrasModels.selected || "-"}</span>
          </div>
          <Button variant="outline" size="sm" onClick={store.loadCerebrasModels} disabled={!canRequest || store.loading}>
            {store.loading ? "조회 중..." : "모델 새로고침"}
          </Button>
        </div>
        <div className="space-y-1">
          {store.cerebrasModels.items.map((item) => (
            <article key={item.id} className="flex items-center justify-between rounded-md border border-border bg-card/60 px-2.5 py-2">
              <span className="truncate font-mono text-xs">{item.id}</span>
              <small className="shrink-0 text-[11px] text-muted-foreground">{item.ownedBy || "owned_by -"}</small>
            </article>
          ))}
          {store.cerebrasModels.items.length === 0 ? <p className="py-6 text-center text-xs text-muted-foreground">조회된 Cerebras 모델이 없습니다.</p> : null}
        </div>
      </CardBoundary>
    </div>
  );
}

function MemoryTab({ store, canRequest, fileInputRef, onError }: { store: Store; canRequest: boolean; fileInputRef: RefObject<HTMLInputElement | null>; onError: CardErrorHandler }) {
  const toggleScope = (scope: string) => {
    const current = new Set(store.backupIncludeScopes);
    current.has(scope) ? current.delete(scope) : current.add(scope);
    store.setBackupIncludeScopes(Array.from(current));
  };

  return (
    <div className="space-y-4">
      <CardBoundary title="Memory & portable package" card="operations" onError={onError}>
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs text-muted-foreground">대화에서 생성된 실제 메모리 노트와 검색 결과만 표시합니다.</p>
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            <Button variant="outline" size="sm" onClick={store.loadMemoryNotes} disabled={!canRequest || store.loading}>새로고침</Button>
            <Button variant="outline" size="sm" onClick={store.rebuildMemoryIndex} disabled={!canRequest || store.loading}>
              <RefreshCw size={14} aria-hidden="true" /> 인덱스
            </Button>
            <Button variant="ghost" size="sm" onClick={store.clearMemory} disabled={!canRequest}>비우기</Button>
          </div>
        </div>
        {store.memoryIndexStatus ? (
          <div className={cn("rounded-md border px-3 py-2 text-xs", store.memoryIndexStatus.ok ? "border-border bg-muted/40" : "border-destructive/30 bg-destructive/10 text-destructive")}>
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <Badge tone={store.memoryIndexStatus.ok ? "success" : "destructive"}>{store.memoryIndexStatus.ok ? "indexed" : "failed"}</Badge>
              <Badge tone="outline">scanned {store.memoryIndexStatus.scannedDocuments}</Badge>
              <Badge tone="outline">indexed {store.memoryIndexStatus.indexedDocuments}</Badge>
              <Badge tone="outline">removed {store.memoryIndexStatus.removedDocuments}</Badge>
              <Badge tone={store.memoryIndexStatus.ftsAvailable ? "success" : "warning"}>{store.memoryIndexStatus.ftsAvailable ? "FTS ready" : "FTS hold"}</Badge>
              <Badge tone="outline">{store.memoryIndexStatus.elapsedMs}ms</Badge>
            </div>
            <p className="mt-1 truncate text-muted-foreground">{store.memoryIndexStatus.error || store.memoryIndexStatus.message}</p>
          </div>
        ) : null}
        <div className="flex gap-2">
          <Input
            value={store.memorySearchQuery}
            placeholder="메모리 검색"
            onChange={(event) => store.setMemorySearchQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                if (canRequest) store.searchMemory();
              }
            }}
          />
          <Button variant="primary" size="sm" onClick={store.searchMemory} disabled={!canRequest || !store.memorySearchQuery.trim()}>
            <Search size={14} aria-hidden="true" /> 검색
          </Button>
        </div>
        <div className="space-y-1">
          {store.memoryNotes.map((note) => (
            <button key={note.name} type="button" onClick={() => store.readMemoryNote(note.name)} disabled={!canRequest} className={cn("flex w-full flex-col rounded-md border px-2.5 py-2 text-left transition-colors", note.name === store.selectedNoteName ? "border-primary/50 bg-accent" : "border-transparent hover:bg-accent/60")}>
              <span className="truncate text-sm font-medium">{note.name}</span>
              <small className="truncate text-[11px] text-muted-foreground">{note.excerpt || note.fullPath}</small>
            </button>
          ))}
          {store.memoryNotes.length === 0 ? <p className="py-4 text-center text-xs text-muted-foreground">메모리 노트 없음</p> : null}
        </div>
        {store.memorySearchResults.length > 0 ? (
          <div className="space-y-1">
            {store.memorySearchResults.map((result) => (
              <MemorySearchResultRow key={`${result.path}-${result.score}-${result.startLine}`} result={result} canRequest={canRequest} loading={store.loading} onOpen={store.openMemoryResult} />
            ))}
          </div>
        ) : null}
        {store.selectedNoteText || store.selectedMemoryError ? (
          <div className="rounded-md border border-border bg-muted/40">
            <div className="flex min-w-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
              <span className="min-w-0 truncate text-xs font-medium">{store.selectedNoteName || "memory"}</span>
              <Badge tone={store.selectedMemoryKind === "note" ? "primary" : "outline"} className="shrink-0">{store.selectedMemoryKind || "memory"}</Badge>
            </div>
            {store.selectedMemoryError ? <p className="px-3 py-2 text-xs text-destructive">{store.selectedMemoryError}</p> : null}
            {store.selectedNoteText ? <pre className="max-h-56 overflow-auto whitespace-pre-wrap p-3 font-mono text-[11px]">{store.selectedNoteText}</pre> : null}
          </div>
        ) : null}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => store.renameMemoryNote(store.selectedNoteName)} disabled={!canRequest || !store.selectedNoteName || store.selectedMemoryKind !== "note"}>이름 변경</Button>
          <Button variant="destructive" size="sm" onClick={() => store.deleteSelectedMemoryNotes()} disabled={!canRequest || !store.selectedNoteName || store.selectedMemoryKind !== "note"}>
            <Trash2 size={14} aria-hidden="true" /> 삭제
          </Button>
        </div>
      </CardBoundary>

      <CardBoundary title="Portable package" card="logs" onError={onError}>
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs text-muted-foreground">API 키, Telegram 토큰, auth session, runtime 로그는 패키지에 넣지 않습니다.</p>
          <Button variant="ghost" size="sm" onClick={() => store.setBackupIncludeScopes(Object.keys(BACKUP_SCOPE_LABELS))}>전체 선택</Button>
        </div>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {Object.entries(BACKUP_SCOPE_LABELS).map(([scope, label]) => {
            const on = store.backupIncludeScopes.includes(scope);
            return (
              <label key={scope} className={cn("flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 text-xs", on ? "border-primary/40 bg-primary/5" : "border-border")}>
                <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border", on ? "border-primary bg-primary text-primary-foreground" : "border-border-strong")}>
                  {on ? <Check size={11} aria-hidden="true" /> : null}
                </span>
                <input type="checkbox" className="sr-only" checked={on} onChange={() => toggleScope(scope)} />
                <span className="truncate">{label}</span>
              </label>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={store.exportBackup} disabled={!canRequest || store.backupIncludeScopes.length === 0 || store.loading}>
            <Download size={14} aria-hidden="true" /> 내보내기
          </Button>
          <Button variant="outline" size="sm" onClick={store.downloadBackupPackage} disabled={!store.backupPackage}>
            <HardDrive size={14} aria-hidden="true" /> 다운로드
          </Button>
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={!canRequest}>
            <Upload size={14} aria-hidden="true" /> 가져오기
          </Button>
          <Button variant="primary" size="sm" onClick={store.applyBackup} disabled={!canRequest || !store.backupPreview || store.loading}>적용</Button>
        </div>
        <input ref={fileInputRef} type="file" accept=".zip" hidden onChange={(event) => { const file = event.target.files?.[0] ?? null; void store.importBackup(file); event.target.value = ""; }} />
        {store.backupPackage ? <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">백업 패키지: {store.backupPackage.fileName}</p> : null}
        {store.backupPreview ? (
          <div className={cn("rounded-md border px-3 py-2 text-xs", store.backupPreview.error ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-border bg-muted/40 text-muted-foreground")}>
            {store.backupPreview.fileName} · 대화 {store.backupPreview.conversationCount} · 파일 {store.backupPreview.fileCount} · 충돌 {store.backupPreview.conflictCount}
            {store.backupPreview.error ? <p className="mt-1">{store.backupPreview.error}</p> : null}
          </div>
        ) : null}
      </CardBoundary>
    </div>
  );
}

function AboutTab({ onError }: { onError: CardErrorHandler }) {
  return (
    <CardBoundary title="About" card="navigation" onError={onError}>
      <SetRow title="대상 앱" desc="Tauri React 데스크톱 앱이 Phase 5 기본 전환 대상입니다." right={<Badge tone="outline">apps/desktop</Badge>} />
      <SetRow title="데이터 원칙" desc="데모 데이터 대신 미들웨어 WebSocket 계약과 로컬 상태 파일만 표시합니다." right={<Badge tone="success">live</Badge>} />
    </CardBoundary>
  );
}

export function SettingsPage() {
  useSettingsPageBridge();
  useTelegramSettingsBridge();
  useProviderCredentialsBridge();
  const bridgeStatus = useDesktopShellStore((state) => state.bridge.status);
  const authStatus = useDesktopAuthStore((state) => state.auth.status);
  const recordCardError = useUiLogStore((state) => state.recordCardError);
  const store = useSettingsStore();
  const loadTelegramSettings = useTelegramSettingsStore((state) => state.loadSettings);
  const canRequest = bridgeStatus === "connected" && authStatus === "authenticated";
  const canSetupRequest = bridgeStatus === "connected";
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [tab, setTab] = useState<SettingsTab>("models");

  useEffect(() => {
    if (canSetupRequest) {
      store.loadCerebrasModels();
      loadTelegramSettings();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSetupRequest]);

  useEffect(() => {
    if (canRequest) {
      store.loadMemoryNotes();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRequest]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">설정</h1>
        <p className="text-sm text-muted-foreground">메모리, 백업, 모델 상태를 실제 미들웨어 응답 기준으로 관리합니다.</p>
      </div>
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[200px_minmax(0,1fr)]">
        <nav className="flex gap-1 overflow-x-auto lg:flex-col" aria-label="Settings sections">
          {SETTINGS_TABS.map((item) => {
            const Icon = item.icon;
            const on = tab === item.id;
            return (
              <button key={item.id} type="button" onClick={() => setTab(item.id)} className={cn("flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors duration-200", on ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground")}>
                <Icon size={16} className={cn("shrink-0", on && "text-primary")} aria-hidden="true" /> {item.label}
              </button>
            );
          })}
        </nav>
        <div className="min-w-0">
          {tab === "general" ? <GeneralTab bridgeStatus={bridgeStatus} authStatus={authStatus} lastMessage={store.lastMessage} loading={store.loading} onError={recordCardError} /> : null}
          {tab === "models" ? <ModelsTab store={store} canRequest={canSetupRequest} onError={recordCardError} /> : null}
          {tab === "memory" ? <MemoryTab store={store} canRequest={canRequest} fileInputRef={fileInputRef} onError={recordCardError} /> : null}
          {tab === "about" ? <AboutTab onError={recordCardError} /> : null}
        </div>
      </section>
    </div>
  );
}
