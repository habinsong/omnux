import { Globe, Wifi } from "lucide-react";
import { CardBoundary } from "../../CardBoundary";
import type { ShellCard } from "../../shell-store";
import { Badge, Button, cn } from "../../components/ui/primitives";
import { useExternalAccessStore } from "./settings-external-store";

type CardErrorHandler = (card: ShellCard, message: string, componentStack?: string | null) => void;

export function SettingsExternalAccessPanel({ canRequest, onError }: { canRequest: boolean; onError: CardErrorHandler }) {
  const store = useExternalAccessStore();
  const disabled = !canRequest || store.loading || store.remoteDashboardClient;

  return (
    <CardBoundary title="외부접속 (LAN)" card="middleware" onError={onError}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">같은 LAN 기기 접속 허용</p>
          <p className="truncate text-xs text-muted-foreground">같은 와이파이/LAN에 연결된 다른 기기에서 이 대시보드를 열 수 있게 합니다.</p>
        </div>
        <Badge tone={store.enabled ? "success" : "outline"} className="shrink-0">{store.enabled ? "외부 접속 허용" : "로컬 전용"}</Badge>
      </div>

      <label className={cn("flex items-start gap-3 rounded-md border border-border bg-card/60 px-3 py-2.5", disabled && "opacity-60")}>
        <button
          type="button"
          role="switch"
          aria-checked={store.enabled}
          disabled={disabled}
          onClick={() => store.setEnabled(!store.enabled)}
          className={cn(
            "relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors duration-200",
            store.enabled ? "bg-primary" : "bg-border-strong",
            disabled ? "cursor-not-allowed" : "cursor-pointer"
          )}
        >
          <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all duration-200", store.enabled ? "left-[18px]" : "left-0.5")} />
        </button>
        <span className="min-w-0">
          <span className="block text-sm font-medium">{store.enabled ? "외부접속 활성" : "외부접속 비활성"}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {store.enabled ? "현재 리스너가 외부 접속을 받도록 열려 있습니다." : "현재 대시보드는 이 기기의 localhost에서만 열립니다."}
          </span>
        </span>
      </label>

      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Globe size={13} aria-hidden="true" /> 다른 기기에서 열 주소
        </div>
        {store.enabled && store.urls.length > 0 ? (
          store.urls.map((url) => (
            <div key={url} className="flex items-center justify-between gap-2 rounded-md border border-border bg-card/60 px-2.5 py-2">
              <code className="min-w-0 truncate font-mono text-xs">{url}</code>
              <Button variant="ghost" size="sm" className="h-7 shrink-0 px-2" onClick={() => navigator.clipboard?.writeText(url)} title="주소 복사">복사</Button>
            </div>
          ))
        ) : (
          <div className="flex items-center gap-2 rounded-md border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">
            <Wifi size={14} className="shrink-0" aria-hidden="true" />
            {store.enabled ? "사용 가능한 LAN IPv4 주소를 찾지 못했습니다. 네트워크 연결을 확인하세요." : "외부접속을 활성화하면 접속 주소가 표시됩니다."}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" size="sm" onClick={store.refresh} disabled={!canRequest || store.loading}>상태 새로고침</Button>
      </div>

      {store.remoteDashboardClient ? <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">원격 대시보드에서는 외부접속 설정을 변경할 수 없습니다.</p> : null}
      {!store.remoteDashboardClient && !canRequest ? <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">외부접속 변경은 OTP 인증 후 가능합니다.</p> : null}
      {store.message ? <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">{store.message}</p> : null}
    </CardBoundary>
  );
}
