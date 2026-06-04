import { KeyRound, Send, ShieldCheck, Trash2 } from "lucide-react";
import { CardBoundary } from "../../CardBoundary";
import type { ShellCard } from "../../shell-store";
import { Badge, Button, Input, cn } from "../../components/ui/primitives";
import { useTelegramSettingsStore } from "./settings-telegram-store";

type CardErrorHandler = (card: ShellCard, message: string, componentStack?: string | null) => void;

function SecretStat({ label, value, ready, badge }: { label: string; value: string; ready: boolean; badge?: string }) {
  return (
    <div className="rounded-md border border-border bg-card/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs text-muted-foreground">{label}</span>
        <Badge tone={ready ? "success" : "outline"}>{badge || (ready ? "저장됨" : "미설정")}</Badge>
      </div>
      <p className="mt-1 truncate font-mono text-sm">{value || "미설정"}</p>
    </div>
  );
}

export function SettingsTelegramPanel({ canRequest, onError }: { canRequest: boolean; onError: CardErrorHandler }) {
  const store = useTelegramSettingsStore();
  const ready = store.botTokenSet && store.chatIdSet;
  const canSave = !!((store.botTokenInput.trim() || store.botTokenSet) && (store.chatIdInput.trim() || store.chatIdSet));
  const disabled = !canRequest || store.loading || store.remoteDashboardClient;
  return (
    <CardBoundary title="Telegram 연동" card="middleware" onError={onError}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">Bot Token / Chat ID</p>
          <p className="truncate text-xs text-muted-foreground">OTP, 루틴 결과, 운영 알림을 보낼 Telegram 봇과 채팅 대상을 설정합니다.</p>
        </div>
        <Badge tone={ready ? "success" : "warning"} className="shrink-0">{ready ? "발송 준비" : "설정 필요"}</Badge>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <SecretStat label="Bot Token" value={store.botTokenMasked} ready={store.botTokenSet} />
        <SecretStat label="Chat ID" value={store.chatIdMasked} ready={store.chatIdSet} />
        <SecretStat label="저장 방식" value={store.persist ? "키체인 또는 0600 보안 저장소" : "현재 세션"} ready={store.persist} badge={store.persist ? "보안 저장" : "세션"} />
      </div>

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        <label className="min-w-0 space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Bot Token</span>
          <Input
            type="password"
            autoComplete="off"
            value={store.botTokenInput}
            placeholder={store.botTokenMasked || "123456:telegram-bot-token"}
            onChange={(event) => store.setBotTokenInput(event.target.value)}
            disabled={disabled}
          />
        </label>
        <label className="min-w-0 space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Chat ID</span>
          <Input
            autoComplete="off"
            value={store.chatIdInput}
            placeholder={store.chatIdMasked || "123456789"}
            onChange={(event) => store.setChatIdInput(event.target.value)}
            disabled={disabled}
          />
        </label>
      </div>

      <label className={cn("flex items-start gap-2 rounded-md border border-border bg-card/60 px-3 py-2", disabled && "opacity-60")}>
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
          checked={store.persist}
          onChange={(event) => store.setPersist(event.target.checked)}
          disabled={disabled}
        />
        <span className="min-w-0">
          <span className="block text-sm font-medium">보안 저장소 저장/삭제</span>
          <span className="block truncate text-xs text-muted-foreground">
            {store.persist ? "키체인 또는 0600 보안 저장소에 반영합니다." : "현재 실행 중인 프로세스에만 반영합니다."}
          </span>
        </span>
      </label>

      <div className="flex min-w-0 flex-wrap gap-2">
        <Button variant="primary" size="sm" onClick={store.saveCredentials} disabled={disabled || !canSave}>
          <ShieldCheck size={14} aria-hidden="true" /> 저장
        </Button>
        <Button variant="outline" size="sm" onClick={store.sendTest} disabled={disabled || !ready}>
          <Send size={14} aria-hidden="true" /> 테스트 전송
        </Button>
        <Button variant="destructive" size="sm" onClick={store.deleteCredentials} disabled={disabled || !ready}>
          <Trash2 size={14} aria-hidden="true" /> 연동 삭제
        </Button>
        <Button variant="ghost" size="sm" onClick={store.loadSettings} disabled={!canRequest || store.loading}>
          <KeyRound size={14} aria-hidden="true" /> 상태 새로고침
        </Button>
      </div>

      {store.remoteDashboardClient ? <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">원격 대시보드에서는 secret 설정 변경이 차단됩니다.</p> : null}
      {store.message ? <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">{store.message}</p> : null}
    </CardBoundary>
  );
}
