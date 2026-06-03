import { useEffect } from "react";
import { RefreshCcw, RotateCcw, Route, Save } from "lucide-react";
import { CardBoundary } from "../../CardBoundary";
import { useDesktopShellStore } from "../../shell-store";
import { useDesktopAuthStore } from "../auth/auth-store";
import { useUiLogStore } from "../ui-log/ui-log-store";
import { useRoutingPageBridge, useRoutingStore } from "./routing-store";
import { Badge, Button, EmptyState, Input } from "../../components/ui/primitives";

export function RoutingPolicyPage() {
  useRoutingPageBridge();
  const bridgeStatus = useDesktopShellStore((state) => state.bridge.status);
  const authStatus = useDesktopAuthStore((state) => state.auth.status);
  const recordCardError = useUiLogStore((state) => state.recordCardError);
  const store = useRoutingStore();
  const canRequest = bridgeStatus === "connected" && authStatus === "authenticated";

  useEffect(() => {
    if (canRequest) store.load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRequest]);

  const keys = Object.keys(store.snapshot.effectiveChains);
  const decision = store.snapshot.lastDecision;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">라우팅 정책</h1>
          <p className="text-sm text-muted-foreground">의도(intent)별 LLM provider 체인을 쉼표로 지정합니다. override가 default를 덮어씁니다.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" onClick={store.load} disabled={!canRequest || store.loading}>
            <RefreshCcw size={15} aria-hidden="true" /> {store.loading ? "조회 중" : "새로고침"}
          </Button>
          <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={store.reset} disabled={!canRequest || store.pending}>
            <RotateCcw size={15} aria-hidden="true" /> override 초기화
          </Button>
          <Button variant="primary" size="sm" onClick={store.save} disabled={!canRequest || store.pending}>
            <Save size={15} aria-hidden="true" /> {store.pending ? "저장 중" : "override 저장"}
          </Button>
        </div>
      </div>
      {store.lastError ? <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{store.lastError}</p> : null}
      {store.lastMessage ? <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">{store.lastMessage}</p> : null}

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <CardBoundary title="Intent 체인" card="operations" onError={recordCardError}>
          {keys.length === 0 ? (
            <EmptyState icon={Route} title="라우팅 체인 없음" description={canRequest ? "새로고침하면 intent별 provider 체인이 표시됩니다." : "미들웨어 연결 후 표시됩니다."} />
          ) : (
            <div className="space-y-2">
              {keys.map((key) => {
                const def = (store.snapshot.defaultChains[key] || []).join(", ");
                const hasOverride = (store.snapshot.overrideChains[key] || []).length > 0;
                return (
                  <div key={key} className="rounded-md border border-border bg-card/60 p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm font-medium">{key}</span>
                      {hasOverride ? <Badge tone="primary">override</Badge> : <Badge tone="outline">default</Badge>}
                    </div>
                    <Input className="mt-1.5 font-mono text-xs" value={store.draftChains[key] ?? ""} placeholder={def || "provider1, provider2"} onChange={(event) => store.setDraft(key, event.target.value)} />
                    {def ? <div className="mt-1 text-[11px] text-muted-foreground">default: {def}</div> : null}
                  </div>
                );
              })}
            </div>
          )}
        </CardBoundary>

        <CardBoundary title="최근 라우팅 결정" card="logs" onError={recordCardError}>
          <Button variant="outline" size="sm" onClick={store.loadDecision} disabled={!canRequest}>
            <RefreshCcw size={14} aria-hidden="true" /> 최근 결정 조회
          </Button>
          {decision ? (
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-3 font-mono text-[11px]">{JSON.stringify(decision, null, 2)}</pre>
          ) : (
            <p className="py-4 text-center text-xs text-muted-foreground">최근 라우팅 결정이 없습니다.</p>
          )}
        </CardBoundary>
      </section>
    </div>
  );
}
