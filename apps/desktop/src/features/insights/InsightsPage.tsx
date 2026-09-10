import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, RefreshCcw, Stethoscope } from "lucide-react";
import { Screen, ScreenNotice } from "../../components/screen/Screen";
import { ScreenTabs, type ScreenTab } from "../../components/screen/ScreenTabs";
import { ScreenPanels, type ScreenPanel } from "../../components/screen/ScreenPanels";
import { Button, Spinner, cn } from "../../components/ui/primitives";
import { statusLabel, statusTone } from "../../components/ui/status-tone";
import { useDesktopShellStore } from "../../shell-store";
import { useDesktopAuthStore } from "../auth/auth-store";
import { useInsightsPageBridge, useInsightsStore } from "./insights-store";
import {
  CALL_PAGE_SIZE,
  DIAGNOSTIC_SECTIONS,
  callDetail,
  callTitle,
  describeFreshness,
  describeLoad,
  formatDuration,
  formatTokens,
  shouldReloadOnReconnect,
  summarizeCalls,
  type SliceId
} from "./insights-view";
import { DiagnosticBody } from "./InsightsDiagnostic";

/* ============================================================================
   로그 화면.

   위쪽 캡슐 탭으로 "호출" 과 "진단" 을 고른다.
   호출은 목록 하나, 진단은 접힌 칸 아홉 개다. 페이지는 화면 높이를 넘지 않는다.
   ============================================================================ */

type TabId = "calls" | "diagnostics";

export function InsightsPage() {
  useInsightsPageBridge();

  const bridgeStatus = useDesktopShellStore((state) => state.bridge.status);
  const authStatus = useDesktopAuthStore((state) => state.auth.status);
  const connected = bridgeStatus === "connected" && authStatus === "authenticated";

  const telemetry = useInsightsStore((state) => state.telemetry);
  const slices = useInsightsStore((state) => state.slices);
  const gatewayNotice = useInsightsStore((state) => state.gatewayNotice);
  const load = useInsightsStore((state) => state.load);

  const [tab, setTab] = useState<TabId>("calls");
  const [openPanel, setOpenPanel] = useState("");
  const [visible, setVisible] = useState(CALL_PAGE_SIZE);
  const requested = useRef<Set<SliceId>>(new Set());
  const wasConnected = useRef(connected);

  const callState = slices.telemetry;

  useEffect(() => {
    const reconnected = shouldReloadOnReconnect(connected, wasConnected.current, callState.status);
    wasConnected.current = connected;
    if (!connected) {
      requested.current.clear();
      return;
    }
    if (reconnected) {
      requested.current.clear();
      load("telemetry");
      return;
    }
    if (callState.status !== "idle") return;
    load("telemetry");
  }, [connected, callState.status, load]);

  // 진단 칸은 펼칠 때 그 칸만 조회한다.
  useEffect(() => {
    if (!connected || openPanel === "") return;
    const id = openPanel as SliceId;
    if (requested.current.has(id)) return;
    if (slices[id] === undefined || slices[id].status !== "idle") return;
    requested.current.add(id);
    load(id);
  }, [connected, openPanel, slices, load]);

  const events = useMemo(() => telemetry?.events ?? [], [telemetry]);
  const summary = useMemo(() => summarizeCalls(events), [events]);
  const failedCount = DIAGNOSTIC_SECTIONS.filter((section) => slices[section.id].status === "failed").length;

  const tabs: ScreenTab[] = [
    { id: "calls", label: "모델 호출", icon: Activity, badge: summary.total > 0 ? String(summary.total) : undefined },
    {
      id: "diagnostics",
      label: "진단",
      icon: Stethoscope,
      badge: failedCount > 0 ? String(failedCount) : undefined,
      alert: failedCount > 0
    }
  ];

  const panels: ScreenPanel[] = DIAGNOSTIC_SECTIONS.map((section) => ({
    id: section.id,
    title: section.label,
    summary: slices[section.id].status === "idle" ? section.hint : describeLoad(slices[section.id]),
    alert: slices[section.id].status === "failed",
    render: () => <DiagnosticBody id={section.id} hint={section.hint} />
  }));

  return (
    <Screen
      title="로그"
      hint=""
      actions={
        tab === "calls" ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => load("telemetry")}
            disabled={!connected || callState.status === "loading"}
          >
            <RefreshCcw size={14} aria-hidden="true" className={cn(callState.status === "loading" && "animate-spin")} />
            다시 조회
          </Button>
        ) : null
      }
      notice={
        !connected ? (
          <ScreenNotice tone="warning">연결되지 않았습니다. 새로 조회할 수 없고 아래는 이전 값입니다.</ScreenNotice>
        ) : gatewayNotice ? (
          <ScreenNotice tone="danger">{gatewayNotice}</ScreenNotice>
        ) : null
      }
    >
      <ScreenTabs tabs={tabs} value={tab} onChange={(id) => setTab(id as TabId)} label="로그 보기 종류" />

      {tab === "calls" ? (
        <CallList
          events={events}
          visible={visible}
          onMore={() => setVisible((value) => value + CALL_PAGE_SIZE)}
          summaryLine={`${summary.total}건 · 실패 ${summary.problem} · 토큰 ${formatTokens(summary.totalTokens)} · 평균 ${formatDuration(summary.averageDurationMs)}`}
          freshness={describeFreshness(callState.updatedAt, connected, callState.status)}
          loading={callState.status === "loading"}
          error={callState.status === "failed" ? callState.error : ""}
          onRetry={() => load("telemetry")}
          receivedNote={
            telemetry !== null && telemetry.totalEvents > events.length
              ? `전체 ${telemetry.totalEvents}건 중 ${events.length}건을 받았습니다.`
              : ""
          }
        />
      ) : (
        <ScreenPanels panels={panels} openId={openPanel} onOpenChange={setOpenPanel} label="진단 항목" />
      )}
    </Screen>
  );
}

function CallList({
  events,
  visible,
  onMore,
  summaryLine,
  freshness,
  loading,
  error,
  onRetry,
  receivedNote
}: {
  events: ReturnType<typeof useInsightsStore.getState>["telemetry"] extends null
    ? never
    : NonNullable<ReturnType<typeof useInsightsStore.getState>["telemetry"]>["events"];
  visible: number;
  onMore: () => void;
  summaryLine: string;
  freshness: string;
  loading: boolean;
  error: string;
  onRetry: () => void;
  receivedNote: string;
}) {
  const shown = events.slice(0, visible);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex min-w-0 shrink-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border px-3 py-2">
        <span className="min-w-0 truncate text-xs font-medium">{summaryLine}</span>
        <span className="min-w-0 truncate text-[11px] text-muted-foreground">
          {freshness}
          {receivedNote ? ` · ${receivedNote}` : ""}
        </span>
      </div>

      {error ? (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-destructive/10 px-3 py-2">
          <span className="min-w-0 break-words text-xs text-destructive">{error}</span>
          <Button size="sm" variant="outline" onClick={onRetry}>
            다시 조회
          </Button>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && events.length === 0 ? (
          <p className="flex items-center gap-2 px-3 py-4 text-xs text-muted-foreground">
            <Spinner size={13} /> 조회 중입니다.
          </p>
        ) : events.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">기록된 모델 호출이 없습니다.</p>
        ) : (
          <ul className="divide-y divide-border">
            {shown.map((event, index) => (
              <li key={event.id || `${event.startedUtc}-${index}`}>
                <CallRow event={event} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {events.length > shown.length ? (
        <div className="shrink-0 border-t border-border p-2">
          <Button variant="ghost" size="sm" className="w-full" onClick={onMore}>
            더 보기 ({shown.length}/{events.length})
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function CallRow({ event }: { event: { id: string; operation: string; provider: string; model: string; status: string; totalTokens: number; durationMs: number; error: string; startedUtc: string } }) {
  const [open, setOpen] = useState(false);
  const tone = statusTone(event.status);

  return (
    <div className="min-w-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full min-w-0 items-center gap-2 px-3 py-2 text-left outline-none hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60"
      >
        <span className="w-[68px] shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
          {callTitle(event)}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs">{callDetail(event)}</span>
        <span
          className={cn(
            "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
            tone === "destructive" && "bg-destructive/15 text-destructive",
            tone === "warning" && "bg-warning/15 text-warning",
            tone === "success" && "bg-success/15 text-success",
            (tone === "default" || tone === "primary") && "bg-muted text-muted-foreground"
          )}
        >
          {statusLabel(event.status)}
        </span>
      </button>

      {open ? (
        <dl className="grid min-w-0 grid-cols-2 gap-x-3 gap-y-1 border-t border-border bg-muted/20 px-3 py-2 text-[11px] sm:grid-cols-4">
          <Fact label="제공자" value={event.provider || "-"} />
          <Fact label="작업" value={event.operation || "-"} />
          <Fact label="토큰" value={formatTokens(event.totalTokens)} />
          <Fact label="소요" value={formatDuration(event.durationMs)} />
          {event.error ? (
            <div className="col-span-2 min-w-0 sm:col-span-4">
              <dt className="text-muted-foreground">기록된 오류</dt>
              <dd className="mt-0.5 min-w-0 whitespace-pre-wrap break-words rounded bg-destructive/10 p-2 font-mono text-destructive">
                {event.error}
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate">{value}</dd>
    </div>
  );
}
