import { useEffect, useMemo, useRef, useState } from "react";
import { Clock3, RefreshCcw, RotateCcw, Route, Save, Server } from "lucide-react";
import { Screen, ScreenNotice } from "../../components/screen/Screen";
import { ScreenTabs, type ScreenTab } from "../../components/screen/ScreenTabs";
import { Button, Input, Spinner, cn } from "../../components/ui/primitives";
import { statusLabel, statusTone } from "../../components/ui/status-tone";
import { useDesktopShellStore } from "../../shell-store";
import { useDesktopAuthStore } from "../auth/auth-store";
import { useRoutingPageBridge, useRoutingStore } from "./routing-store";
import {
  categoryMeta,
  describeChain,
  dirtyKeys,
  formatChain,
  formatDecisionTime,
  localCheckLabel,
  overrideCount
} from "./routing-model";

/* ============================================================================
   라우팅 화면.
   캡슐 탭: 경로 / 최근 선택 / 로컬 모델.
   경로 목록은 남은 높이를 채우고 안쪽에서만 스크롤한다. 줄을 열면 그 줄에서 바로 고친다.
   ============================================================================ */

type TabId = "chains" | "decision" | "local";

export function RoutingPolicyPage() {
  useRoutingPageBridge();

  const bridgeStatus = useDesktopShellStore((state) => state.bridge.status);
  const authStatus = useDesktopAuthStore((state) => state.auth.status);
  const connected = bridgeStatus === "connected" && authStatus === "authenticated";

  const snapshot = useRoutingStore((state) => state.snapshot);
  const draft = useRoutingStore((state) => state.draftChains);
  const loading = useRoutingStore((state) => state.loading);
  const pending = useRoutingStore((state) => state.pending);
  const lastError = useRoutingStore((state) => state.lastError);
  const store = useRoutingStore;

  const [tab, setTab] = useState<TabId>("chains");
  const [openKey, setOpenKey] = useState("");
  const loadedOnce = useRef(false);

  useEffect(() => {
    if (!connected || loadedOnce.current) return;
    loadedOnce.current = true;
    store.getState().load();
  }, [connected, store]);

  const keys = useMemo(() => Object.keys(snapshot.effectiveChains).sort(), [snapshot.effectiveChains]);
  const unsaved = useMemo(() => dirtyKeys(draft, snapshot.effectiveChains), [draft, snapshot.effectiveChains]);
  const overrides = overrideCount(snapshot.overrideChains);

  const tabs: ScreenTab[] = [
    { id: "chains", label: "작업별 경로", icon: Route, badge: keys.length > 0 ? String(keys.length) : undefined },
    { id: "decision", label: "최근 선택", icon: Clock3 },
    { id: "local", label: "로컬 모델", icon: Server }
  ];

  return (
    <Screen
      title="라우팅"
      hint="작업 종류마다 어떤 제공자를 어떤 순서로 쓸지 정합니다."
      actions={
        tab === "chains" ? (
          <>
            <Button variant="outline" size="sm" onClick={() => store.getState().load()} disabled={!connected || loading}>
              {loading ? <Spinner size={14} /> : <RefreshCcw size={14} aria-hidden="true" />} 다시 조회
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => store.getState().save()}
              disabled={!connected || pending || unsaved.length === 0}
            >
              {pending ? <Spinner size={14} /> : <Save size={14} aria-hidden="true" />} 저장
            </Button>
          </>
        ) : null
      }
      notice={
        lastError ? (
          <ScreenNotice tone="danger">{lastError}</ScreenNotice>
        ) : !connected ? (
          <ScreenNotice tone="warning">연결되지 않았습니다. 조회와 저장을 할 수 없습니다.</ScreenNotice>
        ) : unsaved.length > 0 ? (
          <ScreenNotice tone="warning">
            저장하지 않은 변경 {unsaved.length}개. 다시 조회해도 이 변경은 지워지지 않습니다.
          </ScreenNotice>
        ) : null
      }
    >
      <ScreenTabs tabs={tabs} value={tab} onChange={(id) => setTab(id as TabId)} label="라우팅 보기 종류" />

      {tab === "chains" ? (
        <ChainList
          keys={keys}
          unsaved={unsaved}
          overrides={overrides}
          openKey={openKey}
          onOpen={setOpenKey}
          connected={connected}
        />
      ) : tab === "decision" ? (
        <DecisionPanel connected={connected} />
      ) : (
        <LocalPanel connected={connected} />
      )}
    </Screen>
  );
}

function ChainList({
  keys,
  unsaved,
  overrides,
  openKey,
  onOpen,
  connected
}: {
  keys: string[];
  unsaved: string[];
  overrides: number;
  openKey: string;
  onOpen: (key: string) => void;
  connected: boolean;
}) {
  const snapshot = useRoutingStore((state) => state.snapshot);
  const draft = useRoutingStore((state) => state.draftChains);
  const pending = useRoutingStore((state) => state.pending);
  const store = useRoutingStore;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex min-w-0 shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-1.5">
        <span className="min-w-0 truncate text-[11px] text-muted-foreground">직접 지정 {overrides}개</span>
        <div className="flex shrink-0 items-center gap-1">
          {unsaved.length > 0 ? (
            <Button size="sm" variant="ghost" onClick={() => store.getState().discardDraft()}>
              <RotateCcw size={12} aria-hidden="true" /> 변경 버리기
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => void store.getState().reset()}
            disabled={!connected || pending || overrides === 0}
          >
            직접 지정 모두 지우기
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {keys.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            {connected ? "다시 조회하면 작업별 경로가 나옵니다." : "연결된 뒤에 나옵니다."}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {keys.map((key) => {
              const meta = categoryMeta(key);
              const hasOverride = (snapshot.overrideChains[key] ?? []).length > 0;
              const dirty = unsaved.includes(key);
              const open = openKey === key;
              return (
                <li key={key} className="min-w-0">
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => onOpen(open ? "" : key)}
                    className="flex w-full min-w-0 items-center gap-2 px-3 py-2 text-left outline-none hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60"
                  >
                    <span className="w-[96px] shrink-0 truncate text-xs font-medium">{meta.label}</span>
                    <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">
                      {describeChain(snapshot.effectiveChains[key], hasOverride)}
                    </span>
                    {dirty ? (
                      <span className="shrink-0 rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-medium text-warning">
                        저장 안 함
                      </span>
                    ) : hasOverride ? (
                      <span className="shrink-0 rounded-full bg-primary/12 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                        직접 지정
                      </span>
                    ) : null}
                  </button>

                  {open ? (
                    <div className="min-w-0 space-y-1.5 border-t border-border bg-muted/20 px-3 py-2">
                      <p className="text-[11px] text-muted-foreground">{meta.hint}</p>
                      <Input
                        className="h-8 font-mono text-xs"
                        value={draft[key] ?? ""}
                        aria-label={`${meta.label} 제공자 순서`}
                        placeholder={formatChain(snapshot.defaultChains[key]) || "예: groq, gemini"}
                        onChange={(event) => store.getState().setDraft(key, event.target.value)}
                      />
                      <div className="flex min-w-0 flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="min-w-0 break-all font-mono">{key}</span>
                        {formatChain(snapshot.defaultChains[key]) ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => store.getState().setDraft(key, formatChain(snapshot.defaultChains[key]))}
                          >
                            기본값으로
                          </Button>
                        ) : null}
                      </div>
                      <p className="text-[11px] text-muted-foreground">비우면 기본값을 씁니다. 「저장」을 눌러야 반영됩니다.</p>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function DecisionPanel({ connected }: { connected: boolean }) {
  const decision = useRoutingStore((state) => state.snapshot.lastDecision);
  const loadDecision = useRoutingStore((state) => state.loadDecision);
  const [asked, setAsked] = useState(false);

  useEffect(() => {
    if (!connected || asked) return;
    setAsked(true);
    loadDecision();
  }, [connected, asked, loadDecision]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-y-auto rounded-xl border border-border bg-card p-3">
      <div>
        <Button size="sm" variant="outline" onClick={loadDecision} disabled={!connected}>
          <RefreshCcw size={12} aria-hidden="true" /> 다시 조회
        </Button>
      </div>

      {decision === null ? (
        <p className="text-xs text-muted-foreground">아직 기록된 선택이 없습니다.</p>
      ) : (
        <>
          <p className="min-w-0 break-words text-sm font-medium">
            {decision.categoryLabel || decision.categoryKey || "-"} → {decision.resolvedProvider || "-"}
          </p>
          <p className="text-[11px] text-muted-foreground">
            요청 {decision.requestedProvider || "-"} · {formatDecisionTime(decision.decidedAtUtc)}
          </p>
          <p className="min-w-0 break-words rounded-lg border border-border bg-muted/20 px-2.5 py-2 text-xs">
            {decision.reason || "이유가 기록되지 않았습니다."}
          </p>
          <Chain label="선택한 순서" chain={decision.providerChain} />
          <Chain label="쓸 수 있던 제공자" chain={decision.availableProviders} />
        </>
      )}
    </div>
  );
}

function Chain({ label, chain }: { label: string; chain: string[] }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      {chain.length === 0 ? (
        <p className="text-xs text-muted-foreground">없음</p>
      ) : (
        <p className="min-w-0 break-words font-mono text-xs">{chain.map((item, index) => `${index + 1}. ${item}`).join("  ")}</p>
      )}
    </div>
  );
}

function LocalPanel({ connected }: { connected: boolean }) {
  const local = useRoutingStore((state) => state.localLlm);
  const loading = useRoutingStore((state) => state.localLoading);
  const loadLocalLlm = useRoutingStore((state) => state.loadLocalLlm);
  const [asked, setAsked] = useState(false);

  useEffect(() => {
    if (!connected || asked) return;
    setAsked(true);
    loadLocalLlm();
  }, [connected, asked, loadLocalLlm]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex min-w-0 shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-1.5">
        <span className="min-w-0 truncate text-[11px] text-muted-foreground">
          {local
            ? `연결점 ${local.availableEndpointCount}/${local.endpoints.length}개 · 모델 ${local.totalModelCount}개`
            : loading
              ? "조회 중"
              : "아직 조회 전"}
        </span>
        <Button size="sm" variant="ghost" onClick={loadLocalLlm} disabled={!connected || loading}>
          {loading ? <Spinner size={12} /> : <RefreshCcw size={12} aria-hidden="true" />} 다시 조회
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {local === null ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">Ollama·LM Studio 를 찾을 수 있는지 확인합니다.</p>
        ) : (
          <ul className="divide-y divide-border">
            {local.endpoints.map((endpoint) => (
              <StatusRow
                key={`${endpoint.name}-${endpoint.baseUrl}`}
                name={`${endpoint.name} · ${endpoint.kind}`}
                detail={endpoint.error || `${endpoint.baseUrl} · 모델 ${endpoint.modelCount}개`}
                status={endpoint.status}
              />
            ))}
            {local.checks.map((check) => (
              <StatusRow key={check.name} name={localCheckLabel(check.name)} detail={check.message} status={check.status} />
            ))}
          </ul>
        )}
      </div>

      <p className="shrink-0 border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
        상태만 확인합니다. 이 값으로 경로를 자동으로 바꾸지 않습니다.
      </p>
    </div>
  );
}

function StatusRow({ name, detail, status }: { name: string; detail: string; status: string }) {
  const tone = statusTone(status);
  return (
    <li className="flex min-w-0 items-start gap-2 px-3 py-2">
      <span className="min-w-0 flex-1">
        <span className="block min-w-0 break-words text-xs">{name}</span>
        <span className="block min-w-0 break-all text-[11px] text-muted-foreground">{detail}</span>
      </span>
      <span
        className={cn(
          "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
          tone === "destructive" && "bg-destructive/15 text-destructive",
          tone === "warning" && "bg-warning/15 text-warning",
          tone === "success" && "bg-success/15 text-success",
          (tone === "default" || tone === "primary") && "bg-muted text-muted-foreground"
        )}
      >
        {statusLabel(status)}
      </span>
    </li>
  );
}
