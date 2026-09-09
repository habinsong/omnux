import { useMemo, useState } from "react";
import { Download, Plug, RefreshCcw, ScrollText, Trash2, Zap } from "lucide-react";
import { Screen, ScreenNotice } from "../../components/screen/Screen";
import { ScreenTabs, type ScreenTab } from "../../components/screen/ScreenTabs";
import { Badge, Button, cn } from "../../components/ui/primitives";
import { statusLabel, statusTone } from "../../components/ui/status-tone";
import { useDesktopShellStore } from "../../shell-store";
import { serializeUiLogs, useUiLogStore } from "../ui-log/ui-log-store";
import { triggerMiddlewareRuntimeProbe } from "../../use-middleware-runtime-probe";

/* ============================================================================
   셸 화면.
   껍데기(창·연결·부팅)만 다룬다. 세 탭으로 나누고 화면 높이에 맞춘다.
   ============================================================================ */

type TabId = "connection" | "boot" | "log";

export function ShellOverviewPage() {
  const middleware = useDesktopShellStore((state) => state.middleware);
  const runtime = useDesktopShellStore((state) => state.runtime);
  const markWaiting = useDesktopShellStore((state) => state.markWaiting);
  const markReconnectPlanned = useDesktopShellStore((state) => state.markReconnectPlanned);
  const logs = useUiLogStore((state) => state.logs);

  const [tab, setTab] = useState<TabId>("connection");

  const errorCount = logs.filter((log) => log.level === "error").length;
  const tabs: ScreenTab[] = [
    { id: "connection", label: "연결", icon: Plug, alert: middleware.status === "error" },
    { id: "boot", label: "부팅", icon: Zap, alert: runtime.phase === "error" },
    { id: "log", label: "화면 기록", icon: ScrollText, badge: logs.length > 0 ? String(logs.length) : undefined, alert: errorCount > 0 }
  ];

  const fault =
    middleware.status === "error"
      ? middleware.lastError || "미들웨어에 연결하지 못했습니다."
      : runtime.phase === "error"
        ? runtime.lastError || "부팅 확인에 실패했습니다."
        : "";

  return (
    <Screen
      title="셸"
      hint="창과 연결, 부팅만 봅니다. 모델과 작업은 여기서 다루지 않습니다."
      actions={
        <>
          <Button variant="outline" size="sm" onClick={markWaiting}>
            연결 대기
          </Button>
          <Button variant="outline" size="sm" onClick={triggerMiddlewareRuntimeProbe}>
            <RefreshCcw size={14} aria-hidden="true" /> 다시 확인
          </Button>
        </>
      }
      notice={fault ? <ScreenNotice tone="danger">{fault}</ScreenNotice> : null}
    >
      <ScreenTabs tabs={tabs} value={tab} onChange={(id) => setTab(id as TabId)} label="셸 보기 종류" />
      {tab === "connection" ? <ConnectionPanel /> : tab === "boot" ? <BootPanel onPlan={markReconnectPlanned} /> : <LogPanel />}
    </Screen>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <div className="min-w-0 p-3">{children}</div>
      </div>
    </div>
  );
}

/** 한 줄에 이름과 값. 값은 길면 줄바꿈해서 잘리지 않게 한다. */
function Row({ name, value, detail }: { name: string; value: React.ReactNode; detail?: string | null }) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-3 border-b border-border py-2 text-xs last:border-0">
      <span className="w-24 shrink-0 text-muted-foreground">{name}</span>
      <span className="flex min-w-0 flex-1 flex-col items-end gap-0.5 text-right">
        <span className="min-w-0 break-all font-mono text-foreground">{value}</span>
        {detail ? <span className="min-w-0 break-all text-[10px] text-muted-foreground">{detail}</span> : null}
      </span>
    </div>
  );
}

function Pill({ status }: { status: string }) {
  return <Badge tone={statusTone(status)}>{statusLabel(status)}</Badge>;
}

function ConnectionPanel() {
  const middleware = useDesktopShellStore((state) => state.middleware);
  const bridge = useDesktopShellStore((state) => state.bridge);
  return (
    <Card>
      <Row name="상태" value={<Pill status={middleware.status} />} />
      <Row name="주소" value={middleware.endpoint} />
      <Row name="통로" value={<Pill status={bridge.status} />} detail={bridge.lastError || null} />
      <Row name="sidecar" value={middleware.sidecarBootstrap} />
      <Row name="마지막 오류" value={middleware.lastError || "없음"} />
    </Card>
  );
}

function BootPanel({ onPlan }: { onPlan: () => void }) {
  const runtime = useDesktopShellStore((state) => state.runtime);
  return (
    <Card>
      <Row name="단계" value={runtime.bootstrapPhase} />
      <Row name="프로세스" value={runtime.bootstrapPid ?? "없음"} />
      <Row name="healthz" value={<Pill status={runtime.healthStatus} />} detail={runtime.healthDetail || runtime.healthUrl} />
      <Row name="readyz" value={<Pill status={runtime.readyStatus} />} detail={runtime.readyDetail || runtime.readyUrl} />
      <Row name="재연결" value={`${runtime.reconnectPolicy.mode} · ${runtime.reconnectAttempts}/${runtime.reconnectPolicy.maxAttempts}`} />
      <Row name="마지막 확인" value={runtime.lastProbeAt || "아직 없음"} />
      <Row name="마지막 오류" value={runtime.lastError || "없음"} />
      <div className="pt-3">
        <Button variant="outline" size="sm" onClick={onPlan}>
          재연결 예약
        </Button>
      </div>
    </Card>
  );
}

const LEVEL_TONE: Record<string, string> = {
  error: "bg-destructive/12 text-destructive",
  warn: "bg-warning/12 text-warning",
  info: "bg-primary/12 text-primary"
};

function clock(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

function LogPanel() {
  const logs = useUiLogStore((state) => state.logs);
  const clearLogs = useUiLogStore((state) => state.clearLogs);
  const [openId, setOpenId] = useState("");
  const text = useMemo(() => serializeUiLogs(logs), [logs]);

  const save = () => {
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `omnux-ui-logs-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <Button variant="outline" size="sm" onClick={save} disabled={logs.length === 0}>
          <Download size={12} aria-hidden="true" /> 내려받기
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={clearLogs}
          disabled={logs.length === 0}
        >
          <Trash2 size={12} aria-hidden="true" /> 비우기
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        {logs.length === 0 ? (
          <p className="px-3 py-8 text-center text-xs text-muted-foreground">기록된 화면 오류가 없습니다.</p>
        ) : (
          <ul className="min-w-0 divide-y divide-border">
            {logs.map((log) => {
              const open = openId === log.id;
              return (
                <li key={log.id} className="min-w-0">
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setOpenId(open ? "" : log.id)}
                    className="flex w-full min-w-0 items-start gap-2 px-3 py-2 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60"
                  >
                    <span className={cn("mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase", LEVEL_TONE[log.level] || LEVEL_TONE.info)}>
                      {log.level}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs">{log.message}</span>
                      <span className="block truncate text-[10px] text-muted-foreground">
                        {clock(log.createdAt)} · {log.source}
                      </span>
                    </span>
                  </button>
                  {open ? (
                    <div className="min-w-0 px-3 pb-3">
                      <p className="min-w-0 whitespace-pre-wrap break-words rounded-md bg-muted/50 p-2 text-[11px]">{log.message}</p>
                      {log.componentStack ? (
                        <pre className="mt-2 max-h-48 min-w-0 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/50 p-2 font-mono text-[10px] text-muted-foreground">
                          {log.componentStack}
                        </pre>
                      ) : null}
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
