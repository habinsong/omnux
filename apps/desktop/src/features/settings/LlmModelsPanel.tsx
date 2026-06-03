import { useEffect, useState } from "react";
import { KeyRound, LogIn, RefreshCcw, Trash2 } from "lucide-react";
import { CardBoundary } from "../../CardBoundary";
import type { ShellCard } from "../../shell-store";
import { useSettingsStore } from "./settings-store";
import { Badge, Button, Input } from "../../components/ui/primitives";

type CardErrorHandler = (card: ShellCard, message: string, componentStack?: string | null) => void;
const SELECT_CLASS = "h-9 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60";
const FIELD_LABEL = "block space-y-1 text-xs font-semibold text-muted-foreground";

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
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        {models.selected ? <Badge tone="primary" className="font-mono">{models.selected}</Badge> : <Badge tone="outline">미설정</Badge>}
      </div>
      <div className="flex gap-2">
        <select className={SELECT_CLASS} value={choice} onChange={(event) => setChoice(event.target.value)} disabled={models.items.length === 0}>
          {models.items.length === 0 ? <option value="">모델 없음 — 새로고침</option> : null}
          {models.items.map((model) => (
            <option key={model} value={model}>{model}</option>
          ))}
        </select>
        <Button variant="primary" size="sm" onClick={() => onApply(choice)} disabled={!canRequest || !choice}>적용</Button>
        <Button variant="outline" size="icon" aria-label="카탈로그 새로고침" onClick={onRefresh} disabled={!canRequest}>
          <RefreshCcw size={15} aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

export function LlmModelsPanel({ store, canRequest, onError }: { store: ReturnType<typeof useSettingsStore.getState>; canRequest: boolean; onError: CardErrorHandler }) {
  const [groqKey, setGroqKey] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [cerebrasKey, setCerebrasKey] = useState("");

  useEffect(() => {
    if (canRequest) store.loadLlmServices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRequest]);

  const saveKeys = () => {
    store.saveLlmCredentials({ groqApiKey: groqKey, geminiApiKey: geminiKey, cerebrasApiKey: cerebrasKey });
    setGroqKey("");
    setGeminiKey("");
    setCerebrasKey("");
  };

  return (
    <div className="space-y-4">
      <CardBoundary title="LLM 모델" card="middleware" onError={onError}>
        {store.llmMessage ? <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">{store.llmMessage}</p> : null}
        <ModelSelect label="Groq" models={store.groqModels} canRequest={canRequest} onApply={store.setGroqModel} onRefresh={() => store.loadLlmServices()} />
        <div className="border-t border-border" />
        <ModelSelect label="Copilot" models={store.copilotModels} canRequest={canRequest} onApply={store.setCopilotModel} onRefresh={() => store.loadLlmServices()} />
        <div className="flex items-center justify-between border-t border-border pt-3">
          <span className="text-xs text-muted-foreground">Copilot CLI 로그인이 필요하면 디바이스 인증을 시작합니다.</span>
          <Button variant="outline" size="sm" onClick={store.startCopilotLogin} disabled={!canRequest}>
            <LogIn size={14} aria-hidden="true" /> Copilot 로그인
          </Button>
        </div>
      </CardBoundary>

      <CardBoundary title="CLI 어댑터 상태" card="runtime" onError={onError}>
        <div className="flex items-center justify-between gap-3 border-b border-border py-2">
          <div className="min-w-0">
            <b className="block text-sm">GitHub Copilot CLI</b>
            <span className="block truncate text-xs text-muted-foreground">{store.copilotStatus.detail}</span>
          </div>
          <Badge tone={store.copilotStatus.text.includes("완료") ? "success" : "warning"}>{store.copilotStatus.text}</Badge>
        </div>
        <div className="flex items-center justify-between gap-3 py-2">
          <div className="min-w-0">
            <b className="block text-sm">OpenAI Codex CLI</b>
            <span className="block truncate text-xs text-muted-foreground">{store.codexStatus.detail}</span>
          </div>
          <Badge tone={store.codexStatus.text.includes("완료") ? "success" : "warning"}>{store.codexStatus.text}</Badge>
        </div>
        <Button variant="outline" size="sm" onClick={() => store.loadLlmServices()} disabled={!canRequest}>
          <RefreshCcw size={14} aria-hidden="true" /> 상태 조회
        </Button>
      </CardBoundary>

      <CardBoundary title="API 키" card="operations" onError={onError}>
        <p className="text-xs text-muted-foreground">키는 입력 후 저장하면 미들웨어 키체인/영속 저장소로 전달되며, 입력란에는 다시 표시되지 않습니다.</p>
        <label className={FIELD_LABEL}>
          Groq API Key
          <Input type="password" value={groqKey} placeholder="gsk_..." onChange={(event) => setGroqKey(event.target.value)} />
        </label>
        <label className={FIELD_LABEL}>
          Gemini API Key
          <Input type="password" value={geminiKey} placeholder="AIza..." onChange={(event) => setGeminiKey(event.target.value)} />
        </label>
        <label className={FIELD_LABEL}>
          Cerebras API Key
          <Input type="password" value={cerebrasKey} placeholder="csk-..." onChange={(event) => setCerebrasKey(event.target.value)} />
        </label>
        <div className="flex gap-2">
          <Button variant="primary" size="sm" onClick={saveKeys} disabled={!canRequest || (!groqKey.trim() && !geminiKey.trim() && !cerebrasKey.trim())}>
            <KeyRound size={14} aria-hidden="true" /> 키 저장
          </Button>
          <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={store.deleteLlmCredentials} disabled={!canRequest}>
            <Trash2 size={14} aria-hidden="true" /> 키 삭제
          </Button>
        </div>
      </CardBoundary>
    </div>
  );
}
