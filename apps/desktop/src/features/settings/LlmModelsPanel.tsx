import { useEffect, useState, type ReactNode } from "react";
import { KeyRound, LogIn, LogOut, RefreshCcw, ShieldCheck, Trash2 } from "lucide-react";
import { CardBoundary } from "../../CardBoundary";
import type { ShellCard } from "../../shell-store";
import { useSettingsStore } from "./settings-store";
import { useProviderCredentialsStore, type ProviderCredentialCard } from "./settings-provider-credentials-store";
import { Badge, Button, Input, cn } from "../../components/ui/primitives";

type CardErrorHandler = (card: ShellCard, message: string, componentStack?: string | null) => void;
const SELECT_CLASS = "h-9 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60";

function ModelSelect({
  label,
  models,
  canRequest,
  onApply,
  onRefresh
}: {
  label: string;
  models: { selected: string; items: string[] };
  canRequest: boolean;
  onApply: (model: string) => void;
  onRefresh: () => void;
}) {
  const [choice, setChoice] = useState(models.selected);
  useEffect(() => {
    setChoice(models.selected || models.items[0] || "");
  }, [models.selected, models.items]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium">{label}</span>
        {models.selected ? <Badge tone="primary" className="max-w-[220px] truncate font-mono">{models.selected}</Badge> : <Badge tone="outline">미설정</Badge>}
      </div>
      <div className="flex min-w-0 flex-wrap gap-2">
        <select className={SELECT_CLASS} value={choice} onChange={(event) => setChoice(event.target.value)} disabled={models.items.length === 0}>
          {models.items.length === 0 ? <option value="">모델 없음 - 새로고침</option> : null}
          {models.items.map((model) => (
            <option key={model} value={model}>{model}</option>
          ))}
        </select>
        <Button variant="primary" size="sm" onClick={() => onApply(choice)} disabled={!canRequest || !choice}>적용</Button>
        <Button variant="outline" size="icon" aria-label={`${label} 카탈로그 새로고침`} onClick={onRefresh} disabled={!canRequest}>
          <RefreshCcw size={15} aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

function ProviderKeyCard({
  card,
  disabled,
  onChange
}: {
  card: ProviderCredentialCard;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className={cn("min-w-0 rounded-md border bg-card/60 p-3 transition-colors duration-200", card.set ? "border-primary/30" : "border-border")}>
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{card.label}</span>
          <span className="block truncate text-xs text-muted-foreground">{card.helper}</span>
        </span>
        <Badge tone={card.set ? "success" : "outline"} className="shrink-0">{card.set ? "저장됨" : "미설정"}</Badge>
      </div>
      <Input
        type="password"
        autoComplete="off"
        value={card.input}
        placeholder={card.masked || card.placeholder}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="mt-2"
      />
    </label>
  );
}

function CliStatusRow({
  title,
  detail,
  status,
  children
}: {
  title: string;
  detail: string;
  status: string;
  children: ReactNode;
}) {
  const ready = /완료|인증|logged|ready/i.test(status);
  return (
    <article className="rounded-md border border-border bg-card/60 p-3">
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <b className="block truncate text-sm">{title}</b>
          <span className="block truncate text-xs text-muted-foreground">{detail || "-"}</span>
        </span>
        <Badge tone={ready ? "success" : "warning"} className="shrink-0">{ready ? "인증됨" : "확인 필요"}</Badge>
      </div>
      <p className="mt-2 truncate font-mono text-xs text-muted-foreground">{status}</p>
      <div className="mt-3 flex flex-wrap gap-2">{children}</div>
    </article>
  );
}

export function LlmModelsPanel({ store, canRequest, onError }: { store: ReturnType<typeof useSettingsStore.getState>; canRequest: boolean; onError: CardErrorHandler }) {
  const credentials = useProviderCredentialsStore();
  const secretDisabled = !canRequest || credentials.loading || credentials.remoteDashboardClient;
  const hasKeyInput = Object.values(credentials.inputs).some((value) => value.trim());
  const hasStoredKey = credentials.cards.some((card) => card.set);

  useEffect(() => {
    if (canRequest) {
      store.loadLlmServices();
      credentials.loadSettings();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRequest]);

  return (
    <div className="space-y-4">
      <CardBoundary title="LLM 키" card="operations" onError={onError}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">Provider API keys</p>
            <p className="truncate text-xs text-muted-foreground">비어 있는 입력은 기존 저장값을 유지하고, 저장 시 키체인 또는 0600 보안 저장소에 반영합니다.</p>
          </div>
          <Badge tone={hasStoredKey ? "success" : "warning"} className="shrink-0">{credentials.cards.filter((card) => card.set).length} / {credentials.cards.length}</Badge>
        </div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
          {credentials.cards.map((card) => (
            <ProviderKeyCard key={card.id} card={card} disabled={secretDisabled} onChange={(value) => credentials.setInput(card.id, value)} />
          ))}
        </div>
        <label className={cn("flex items-start gap-2 rounded-md border border-border bg-card/60 px-3 py-2", secretDisabled && "opacity-60")}>
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
            checked={credentials.persist}
            onChange={(event) => credentials.setPersist(event.target.checked)}
            disabled={secretDisabled}
          />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">보안 저장소 저장/삭제</span>
            <span className="block truncate text-xs text-muted-foreground">
              {credentials.persist ? "키체인 또는 0600 보안 저장소에 반영합니다." : "현재 실행 중인 프로세스에만 반영합니다."}
            </span>
          </span>
        </label>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" size="sm" onClick={credentials.saveCredentials} disabled={secretDisabled || !hasKeyInput}>
            <ShieldCheck size={14} aria-hidden="true" /> 키 저장
          </Button>
          <Button variant="destructive" size="sm" onClick={credentials.deleteCredentials} disabled={secretDisabled || !hasStoredKey}>
            <Trash2 size={14} aria-hidden="true" /> 키 삭제
          </Button>
          <Button variant="ghost" size="sm" onClick={credentials.loadSettings} disabled={!canRequest || credentials.loading}>
            <KeyRound size={14} aria-hidden="true" /> 상태 새로고침
          </Button>
        </div>
        {credentials.remoteDashboardClient ? <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">원격 대시보드에서는 secret 설정 변경이 차단됩니다.</p> : null}
        {credentials.message ? <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">{credentials.message}</p> : null}
      </CardBoundary>

      <CardBoundary title="CLI 인증 상태" card="runtime" onError={onError}>
        <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
          <CliStatusRow title="GitHub Copilot CLI" detail={store.copilotStatus.detail} status={store.copilotStatus.text}>
            <Button variant="outline" size="sm" onClick={store.loadLlmServices} disabled={!canRequest}>
              <RefreshCcw size={14} aria-hidden="true" /> 상태 조회
            </Button>
            <Button variant="primary" size="sm" onClick={store.startCopilotLogin} disabled={!canRequest}>
              <LogIn size={14} aria-hidden="true" /> 로그인 시작
            </Button>
          </CliStatusRow>
          <CliStatusRow title="OpenAI Codex CLI" detail={store.codexStatus.detail} status={store.codexStatus.text}>
            <Button variant="outline" size="sm" onClick={store.loadLlmServices} disabled={!canRequest}>
              <RefreshCcw size={14} aria-hidden="true" /> 상태 조회
            </Button>
            <Button variant="primary" size="sm" onClick={store.startCodexLogin} disabled={!canRequest}>
              <LogIn size={14} aria-hidden="true" /> OAuth 로그인 시작
            </Button>
            <Button variant="ghost" size="sm" onClick={store.logoutCodex} disabled={!canRequest}>
              <LogOut size={14} aria-hidden="true" /> OAuth 로그아웃
            </Button>
          </CliStatusRow>
        </div>
        {store.llmMessage ? <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">{store.llmMessage}</p> : null}
      </CardBoundary>

      <CardBoundary title="LLM 모델" card="middleware" onError={onError}>
        <ModelSelect label="Groq" models={store.groqModels} canRequest={canRequest} onApply={store.setGroqModel} onRefresh={store.loadLlmServices} />
        <div className="border-t border-border" />
        <ModelSelect label="Copilot" models={store.copilotModels} canRequest={canRequest} onApply={store.setCopilotModel} onRefresh={store.loadLlmServices} />
      </CardBoundary>

      <CardBoundary title="API 사용량 / Copilot Premium" card="logs" onError={onError}>
        {store.llmUsage ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-border bg-card/60 p-3">
              <div className="truncate text-xs text-muted-foreground">Gemini 누적 토큰</div>
              <div className="mt-0.5 font-mono text-lg font-semibold tabular-nums">{store.llmUsage.geminiTotalTokens.toLocaleString()}</div>
              <div className="truncate text-[11px] text-muted-foreground">추정 비용 ${store.llmUsage.geminiCostUsd}</div>
            </div>
            <div className="rounded-md border border-border bg-card/60 p-3">
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="truncate">Copilot Premium</span>
                <Badge tone={store.llmUsage.copilotAvailable ? "success" : "outline"} className="shrink-0">{store.llmUsage.copilotPlan}</Badge>
              </div>
              <div className="mt-0.5 font-mono text-lg font-semibold tabular-nums">{store.llmUsage.copilotPercentUsed}%</div>
              <div className="truncate text-[11px] text-muted-foreground">{store.llmUsage.copilotUsedRequests} / {store.llmUsage.copilotMonthlyQuota} req</div>
            </div>
          </div>
        ) : (
          <p className="py-4 text-center text-xs text-muted-foreground">상태 조회 시 Gemini 토큰과 Copilot Premium 쿼터가 표시됩니다.</p>
        )}
      </CardBoundary>
    </div>
  );
}
