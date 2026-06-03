import type { ReactNode } from "react";
import { ReadOnlyWsPanel } from "../../ReadOnlyWsPanel";
import { ShellFault } from "../../ShellFault";
import { triggerMiddlewareRuntimeProbe } from "../../use-middleware-runtime-probe";
import { useDesktopShellStore } from "../../shell-store";
import { Badge, Button } from "../../components/ui/primitives";

function KV({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border py-2 text-xs last:border-0">
      <dt className="shrink-0 text-muted-foreground">{k}</dt>
      <dd className="flex min-w-0 flex-col items-end gap-0.5 text-right font-mono text-foreground">{children}</dd>
    </div>
  );
}

function statusTone(status: string): "success" | "warning" | "destructive" | "default" {
  if (/(connected|ok|ready|healthy|authenticated)/i.test(status)) return "success";
  if (/(error|fail|blocked|disconnected)/i.test(status)) return "destructive";
  if (/(connecting|waiting|pending|probing)/i.test(status)) return "warning";
  return "default";
}

function StatusPill({ status }: { status: string }) {
  return <Badge tone={statusTone(status)}>{status}</Badge>;
}

export function ShellBoundarySummary() {
  const items = [
    { title: "허용 범위", body: "window 관리, deep link, open external, sidecar bootstrap, lifecycle 이벤트." },
    { title: "금지 범위", body: "LLM, 코딩, 루틴, 리팩터, 로직, 라우팅 정책, 영속 상태 직접 접근." }
  ];
  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {items.map((item) => (
        <article key={item.title} className="rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-card)] backdrop-blur-xl">
          <h2 className="text-sm font-semibold">{item.title}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{item.body}</p>
          <p className="mt-2 text-[10px] uppercase tracking-wide text-muted-foreground">경계: runtime</p>
        </article>
      ))}
    </section>
  );
}

export function MiddlewareContractCard() {
  const middleware = useDesktopShellStore((state) => state.middleware);
  const markWaiting = useDesktopShellStore((state) => state.markWaiting);

  return (
    <div className="space-y-3">
      {middleware.status === "error" ? <ShellFault label={middleware.lastError || "연결 실패"} /> : null}
      <dl>
        <KV k="WebSocket">{middleware.endpoint}</KV>
        <KV k="상태"><StatusPill status={middleware.status} /></KV>
        <KV k="sidecar">{middleware.sidecarBootstrap}</KV>
      </dl>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={markWaiting}>연결 대기 표시</Button>
        <Button variant="outline" size="sm" onClick={triggerMiddlewareRuntimeProbe}>ping/pong 재확인</Button>
      </div>
    </div>
  );
}

export function RuntimeContractCard() {
  const runtime = useDesktopShellStore((state) => state.runtime);
  const markReconnectPlanned = useDesktopShellStore((state) => state.markReconnectPlanned);
  const detail = (text?: string | null) => (text ? <span className="max-w-[200px] truncate text-[10px] text-muted-foreground">{text}</span> : null);

  return (
    <div className="space-y-3">
      {runtime.phase === "error" ? <ShellFault label={runtime.lastError || "runtime probe 실패"} /> : null}
      <dl>
        <KV k="transport">tauri-shell</KV>
        <KV k="bootstrap">{runtime.bootstrapPhase}</KV>
        <KV k="pid">{runtime.bootstrapPid ?? "none"}</KV>
        <KV k="healthz">
          <StatusPill status={runtime.healthStatus} />
          {detail(runtime.healthUrl)}
          {detail(runtime.healthDetail)}
        </KV>
        <KV k="readyz">
          <StatusPill status={runtime.readyStatus} />
          {detail(runtime.readyUrl)}
          {detail(runtime.readyDetail)}
        </KV>
        <KV k="재연결">{runtime.reconnectPolicy.mode}</KV>
        <KV k="시도">{runtime.reconnectAttempts}/{runtime.reconnectPolicy.maxAttempts}</KV>
        <KV k="last probe">{runtime.lastProbeAt || "not yet"}</KV>
        <KV k="last error">{runtime.lastError || "none"}</KV>
      </dl>
      <Button variant="outline" size="sm" onClick={markReconnectPlanned}>재연결 예약</Button>
    </div>
  );
}

export function AuthReadOnlyCard() {
  return <ReadOnlyWsPanel />;
}
