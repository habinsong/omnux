import { useEffect, type ReactNode } from "react";
import { BrainCircuit, Clock3, RefreshCcw, RotateCcw, Route, Save, Server } from "lucide-react";
import { CardBoundary } from "../../CardBoundary";
import { useDesktopShellStore } from "../../shell-store";
import { useDesktopAuthStore } from "../auth/auth-store";
import { useUiLogStore } from "../ui-log/ui-log-store";
import { type RoutingDecision, type RoutingLocalLlm, useRoutingPageBridge, useRoutingStore } from "./routing-store";
import { Badge, Button, EmptyState, Input, SectionLabel } from "../../components/ui/primitives";

const CATEGORY_META: Record<string, { label: string; hint: string }> = {
  generalChat: { label: "일반 채팅", hint: "기본 단일/오케스트레이션 채팅" },
  planner: { label: "계획 생성", hint: "작업 계획 초안 생성" },
  reviewer: { label: "계획 리뷰", hint: "작업 계획 검토" },
  searchTimeSensitive: { label: "최신성 검색", hint: "실시간 웹 필요 여부 판단" },
  searchFallback: { label: "검색 보조", hint: "검색 fallback 보조 판단" },
  deepCode: { label: "깊은 코딩", hint: "대형 구현과 통합 작업" },
  safeRefactor: { label: "안전 리팩터", hint: "구조 정리와 안전 수정" },
  quickFix: { label: "빠른 수정", hint: "짧은 버그 수정과 검증" },
  visualUi: { label: "UI 작업", hint: "레이아웃과 스타일 작업" },
  routineBuilder: { label: "루틴 빌더", hint: "루틴 생성과 갱신" },
  backgroundMonitor: { label: "백그라운드 모니터", hint: "분석과 상태 확인" },
  documentation: { label: "문서화", hint: "문서화와 가이드" }
};

function statusTone(status: string): "success" | "warning" | "destructive" | "primary" | "outline" | "default" {
  const value = status.toLowerCase();
  if (/(available|ok|ready|clean|ready_for_manual_routing)/.test(value)) return "success";
  if (/(warning|requested|manual)/.test(value)) return "warning";
  if (/(blocked|failed|error|unavailable)/.test(value)) return "destructive";
  if (/(skipped|not_requested|snapshot)/.test(value)) return "outline";
  if (/(selected|override|resolved)/.test(value)) return "primary";
  return "default";
}

function formatTimestamp(value: string): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "medium", hour12: false });
}

function ProviderBadges({ providers, emptyLabel = "없음" }: { providers: string[]; emptyLabel?: string }) {
  if (providers.length === 0) return <span className="text-xs text-muted-foreground">{emptyLabel}</span>;
  return (
    <div className="flex min-w-0 flex-wrap gap-1">
      {providers.map((provider) => (
        <Badge key={provider} tone="outline" className="max-w-full truncate font-mono">
          {provider}
        </Badge>
      ))}
    </div>
  );
}

export function RoutingPolicyPage() {
  useRoutingPageBridge();
  const bridgeStatus = useDesktopShellStore((state) => state.bridge.status);
  const authStatus = useDesktopAuthStore((state) => state.auth.status);
  const recordCardError = useUiLogStore((state) => state.recordCardError);
  const store = useRoutingStore();
  const canRequest = bridgeStatus === "connected" && authStatus === "authenticated";

  useEffect(() => {
    if (canRequest) {
      store.load();
      store.loadLocalLlm();
    }
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
            <div className="grid grid-cols-1 gap-2 2xl:grid-cols-2">
              {keys.map((key) => {
                const def = (store.snapshot.defaultChains[key] || []).join(", ");
                const hasOverride = (store.snapshot.overrideChains[key] || []).length > 0;
                const meta = CATEGORY_META[key] || { label: key, hint: "사용자 정의 intent" };
                return (
                  <div key={key} className="min-w-0 rounded-md border border-border bg-card/60 p-2.5">
                    <div className="flex min-w-0 items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{meta.label}</div>
                        <div className="truncate text-[11px] text-muted-foreground">{meta.hint}</div>
                      </div>
                      <Badge tone={hasOverride ? "primary" : "outline"}>{hasOverride ? "override" : "default"}</Badge>
                    </div>
                    <Input className="mt-1.5 font-mono text-xs" value={store.draftChains[key] ?? ""} placeholder={def || "provider1, provider2"} onChange={(event) => store.setDraft(key, event.target.value)} />
                    <div className="mt-1 flex min-w-0 items-center justify-between gap-2 text-[11px] text-muted-foreground">
                      <span className="truncate font-mono">{key}</span>
                      {def ? <span className="truncate">default: {def}</span> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardBoundary>

        <div className="space-y-4 self-start">
          <CardBoundary title="최근 라우팅 결정" card="logs" onError={recordCardError}>
            <Button variant="outline" size="sm" onClick={store.loadDecision} disabled={!canRequest}>
              <RefreshCcw size={14} aria-hidden="true" /> 최근 결정 조회
            </Button>
            <RoutingDecisionPanel decision={decision} />
          </CardBoundary>
          <CardBoundary title="로컬 LLM readiness" card="middleware" onError={recordCardError}>
            <LocalLlmRoutingPanel local={store.localLlm} loading={store.localLoading} canRequest={canRequest} onRefresh={store.loadLocalLlm} />
          </CardBoundary>
        </div>
      </section>
    </div>
  );
}

function RoutingDecisionPanel({ decision }: { decision: RoutingDecision | null }) {
  if (!decision) {
    return <EmptyState icon={Clock3} title="라우팅 결정 없음" description="최근 LLM 호출이 생기면 선택된 provider와 체인이 표시됩니다." className="mt-3 py-8" />;
  }
  return (
    <div className="mt-3 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <DecisionStat label="카테고리" value={decision.categoryLabel || decision.categoryKey || "-"} />
        <DecisionStat label="결과" value={decision.resolvedProvider || "-"} mono />
        <DecisionStat label="요청" value={decision.requestedProvider || "-"} mono />
        <DecisionStat label="시각" value={formatTimestamp(decision.decidedAtUtc)} />
      </div>
      <div className="rounded-md border border-border bg-card/60 p-2.5">
        <SectionLabel>결정 사유</SectionLabel>
        <p className="mt-1 text-sm text-foreground">{decision.reason || "결정 사유 없음"}</p>
      </div>
      <div className="space-y-2">
        <DecisionRow label="provider 체인">
          <ProviderBadges providers={decision.providerChain} />
        </DecisionRow>
        <DecisionRow label="사용 가능 provider">
          <ProviderBadges providers={decision.availableProviders} />
        </DecisionRow>
      </div>
    </div>
  );
}

function LocalLlmRoutingPanel({ local, loading, canRequest, onRefresh }: { local: RoutingLocalLlm | null; loading: boolean; canRequest: boolean; onRefresh: () => void }) {
  if (!local) {
    return (
      <div className="space-y-3">
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={!canRequest || loading}>
          <RefreshCcw size={14} aria-hidden="true" /> {loading ? "조회 중" : "readiness 조회"}
        </Button>
        <EmptyState icon={Server} title="로컬 모델 상태 없음" description="Ollama / LM Studio discovery 결과를 라우팅 판단 보조 정보로 표시합니다." className="py-8" />
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={!canRequest || loading}>
          <RefreshCcw size={14} aria-hidden="true" /> {loading ? "조회 중" : "새로고침"}
        </Button>
        <Badge tone={local.offlineReady ? "success" : "warning"}>{local.offlineReady ? "오프라인 준비" : "수동 확인"}</Badge>
        <Badge tone={statusTone(local.offlineStatus)}>{local.offlineStatus || "not_requested"}</Badge>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <DecisionStat label="엔드포인트" value={local.availableEndpointCount.toLocaleString()} mono />
        <DecisionStat label="모델" value={local.totalModelCount.toLocaleString()} mono />
        <DecisionStat label="클라우드 키" value={local.cloudProviderKeysPresent.length.toLocaleString()} mono />
      </div>
      <div className="space-y-1">
        {local.endpoints.slice(0, 4).map((endpoint) => (
          <DecisionRow key={`${endpoint.name}-${endpoint.baseUrl}`} label={`${endpoint.name} · ${endpoint.kind}`}>
            <Badge tone={statusTone(endpoint.status)}>{endpoint.status}</Badge>
            <Badge tone="outline">{endpoint.modelCount} 모델</Badge>
          </DecisionRow>
        ))}
        {local.endpoints.length === 0 ? <p className="py-2 text-center text-xs text-muted-foreground">발견된 로컬 endpoint 없음</p> : null}
      </div>
      <div className="space-y-1">
        {local.checks.slice(0, 4).map((check) => (
          <DecisionRow key={check.name} label={check.name} sub={check.message}>
            <Badge tone={statusTone(check.status)}>{check.status}</Badge>
          </DecisionRow>
        ))}
      </div>
      <div className="rounded-md border border-border bg-muted/30 p-2 text-[11px] text-muted-foreground">
        <BrainCircuit size={13} className="mr-1 inline-block align-[-2px]" aria-hidden="true" />
        discovery/readiness 전용입니다. 실제 provider 자동 전환과 cloud 차단은 아직 실행하지 않습니다.
      </div>
    </div>
  );
}

function DecisionStat({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-card/60 p-2.5">
      <div className="truncate text-[11px] text-muted-foreground">{label}</div>
      <div className={`mt-0.5 truncate text-sm font-semibold ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}

function DecisionRow({ label, sub, children }: { label: string; sub?: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-2 rounded-md border border-border bg-card/60 px-2.5 py-2">
      <div className="min-w-0">
        <div className="truncate text-xs font-medium">{label}</div>
        {sub ? <div className="truncate text-[11px] text-muted-foreground">{sub}</div> : null}
      </div>
      <div className="flex min-w-0 max-w-[60%] flex-wrap justify-end gap-1">{children}</div>
    </div>
  );
}
