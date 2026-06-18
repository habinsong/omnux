import { Send } from "lucide-react";
import { Badge, Button, Spinner, Textarea } from "../../components/ui/primitives";
import type { OpsStoreActions, OpsToolsState } from "./OperationsPage.shared";
import { statusLabel } from "./OperationsPage.shared";

type OperationsTelegramPanelProps = {
  readonly telegram: OpsToolsState["telegram"];
  readonly store: OpsStoreActions;
  readonly canRequest: boolean;
};

export function OperationsTelegramPanel({ telegram, store, canRequest }: OperationsTelegramPanelProps) {
  return (
    <div className="min-w-0 space-y-3 rounded-md border border-border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Send size={16} className="shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">텔레그램 점검</p>
            <p className="truncate text-xs text-muted-foreground">텔레그램 명령 라우팅을 점검 채널로 확인합니다.</p>
          </div>
        </div>
        <Badge tone={telegram.result?.ok ? "success" : telegram.result ? "destructive" : "outline"}>
          {statusLabel(telegram.result?.status || "idle")}
        </Badge>
      </div>
      {telegram.lastError ? <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{telegram.lastError}</p> : null}
      <Textarea
        rows={4}
        value={telegram.text}
        onChange={(event) => store.setTelegramStubText(event.target.value)}
        placeholder="/llm status"
        className="font-mono text-xs"
      />
      <Button variant="primary" size="sm" onClick={store.sendTelegramStubCommand} disabled={!canRequest || !telegram.text.trim() || telegram.sending}>
        {telegram.sending ? <Spinner size={14} /> : <Send size={14} aria-hidden="true" />} 전송
      </Button>
      {telegram.result ? (
        <div className="space-y-2 rounded-md bg-background/60 p-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            <Badge tone={telegram.result.ok ? "success" : "destructive"}>{statusLabel(telegram.result.status)}</Badge>
            {telegram.result.retryRequired ? <Badge tone="warning">{telegram.result.retryAction || "retry"}</Badge> : null}
            {telegram.result.guardCategory ? <Badge tone="outline">{telegram.result.guardCategory}</Badge> : null}
          </div>
          <p className="line-clamp-5 whitespace-pre-wrap break-words text-xs text-muted-foreground">{telegram.result.response || telegram.result.error || "응답 없음"}</p>
        </div>
      ) : (
        <p className="rounded-md bg-background/60 px-3 py-6 text-center text-xs text-muted-foreground">명령을 전송하면 응답이 여기에 표시됩니다.</p>
      )}
    </div>
  );
}
