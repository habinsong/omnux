import { useEffect, useMemo, useRef, useState } from "react";
import { Plug, RefreshCcw } from "lucide-react";
import { Screen, ScreenNotice } from "../../components/screen/Screen";
import { ScreenTabs, type ScreenTab } from "../../components/screen/ScreenTabs";
import { ScreenPanels, type ScreenPanel } from "../../components/screen/ScreenPanels";
import { Button, cn } from "../../components/ui/primitives";
import { statusLabel, statusTone } from "../../components/ui/status-tone";
import { triggerMiddlewareRuntimeProbe } from "../../use-middleware-runtime-probe";
import { useDesktopShellStore } from "../../shell-store";
import { useDesktopAuthStore } from "../auth/auth-store";
import { OpsPanelBody } from "./OpsPanels";
import { useGitAutomationBridge, useOpsPageStore } from "./ops-store";
import {
  OPS_GROUPS,
  deriveStatus,
  describeStatus,
  formatUtc,
  panelDefinition,
  panelsOfGroup,
  type OpsGroupId,
  type OpsPanelId
} from "./ops-view";

/* ============================================================================
   상태 화면.
   첫 탭은 연결·인증이다. 이 화면에서 가장 먼저 알아야 하는 값이라 목록이 아니라 바로 보여준다.
   나머지는 점검·작업·도구 세 탭으로 나누고, 각 탭 안에서 한 번에 한 칸만 연다.
   ============================================================================ */

type TabId = "connection" | OpsGroupId;

export function OperationsPage() {
  useGitAutomationBridge();

  const bridge = useDesktopShellStore((state) => state.bridge);
  const authStatus = useDesktopAuthStore((state) => state.auth.status);
  const connected = bridge.status === "connected" && authStatus === "authenticated";

  const [tab, setTab] = useState<TabId>("connection");
  const [openPanel, setOpenPanel] = useState("");
  const requested = useRef<Set<OpsPanelId>>(new Set());

  const statuses = usePanelStatuses();

  useEffect(() => {
    if (!connected || openPanel === "") return;
    const id = openPanel as OpsPanelId;
    if (requested.current.has(id)) return;
    if (!panelDefinition(id).loadOnOpen) return;
    requested.current.add(id);
    loadPanel(id);
  }, [connected, openPanel]);

  const failed = (Object.keys(statuses) as OpsPanelId[]).filter((id) => statuses[id] === "failed").length;

  const tabs: ScreenTab[] = [
    { id: "connection", label: "연결", icon: Plug },
    ...OPS_GROUPS.map((group) => ({
      id: group.id,
      label: group.label,
      badge: countFailedInGroup(group.id, statuses) > 0 ? String(countFailedInGroup(group.id, statuses)) : undefined,
      alert: countFailedInGroup(group.id, statuses) > 0
    }))
  ];

  const panels: ScreenPanel[] =
    tab === "connection"
      ? []
      : panelsOfGroup(tab).map((definition) => ({
          id: definition.id,
          title: definition.label,
          summary: describeStatus(statuses[definition.id], definition.hint, definition.loadOnOpen),
          alert: statuses[definition.id] === "failed",
          render: () => <OpsPanelBody id={definition.id} />
        }));

  return (
    <Screen
      title="상태"
      hint="연결과 인증을 먼저 보여줍니다. 나머지는 탭에서 골라 여세요."
      notice={
        !connected ? (
          <ScreenNotice tone="warning">연결되지 않았거나 인증되지 않았습니다. 아래 칸은 조회할 수 없습니다.</ScreenNotice>
        ) : failed > 0 ? (
          <ScreenNotice tone="danger">조회하지 못한 칸이 {failed}개 있습니다.</ScreenNotice>
        ) : null
      }
      actions={
        tab === "connection" ? (
          <Button variant="outline" size="sm" onClick={triggerMiddlewareRuntimeProbe}>
            <RefreshCcw size={14} aria-hidden="true" /> 다시 확인
          </Button>
        ) : null
      }
    >
      <ScreenTabs tabs={tabs} value={tab} onChange={(id) => setTab(id as TabId)} label="상태 보기 종류" />

      {tab === "connection" ? (
        <ConnectionPanel />
      ) : (
        <ScreenPanels panels={panels} openId={openPanel} onOpenChange={setOpenPanel} label="상태 항목" />
      )}
    </Screen>
  );
}

function countFailedInGroup(group: OpsGroupId, statuses: Record<OpsPanelId, ReturnType<typeof deriveStatus>>): number {
  return panelsOfGroup(group).filter((panel) => statuses[panel.id] === "failed").length;
}

function loadPanel(id: OpsPanelId) {
  const store = useOpsPageStore.getState();
  if (id === "doctor") return store.loadDoctorLast();
  if (id === "plans") return store.loadOpsSnapshot();
  if (id === "git") return store.loadGitAutomation();
  if (id === "schedule") {
    store.loadCronStatus();
    store.loadCronJobs();
    return;
  }
  if (id === "devices") return store.loadNodesSnapshot();
  if (id === "alerts") {
    void store.loadGuardRetryTimeline();
    return;
  }
  if (id === "context") {
    store.loadProjectContext();
    store.loadLogicPath();
  }
}

function usePanelStatuses(): Record<OpsPanelId, ReturnType<typeof deriveStatus>> {
  const doctor = useOpsPageStore((state) => state.doctor);
  const ops = useOpsPageStore((state) => state.ops);
  const git = useOpsPageStore((state) => state.git);
  const tools = useOpsPageStore((state) => state.tools);

  return useMemo(
    () => ({
      doctor: deriveStatus({
        loading: doctor.loading || doctor.running || doctor.fixPreviewing || doctor.fixApplying,
        error: doctor.lastError || "",
        hasResult: doctor.report !== null || doctor.found === false
      }),
      plans: deriveStatus({
        loading: ops.loadingPlans || ops.loadingTaskGraphs,
        error: ops.lastError || "",
        hasResult: ops.planCount > 0 || ops.taskGraphCount > 0 || ops.latestPlanTitle !== null
      }),
      git: deriveStatus({
        loading: git.loading || git.previewing || git.applying,
        error: git.lastError || "",
        hasResult: git.snapshot !== null
      }),
      schedule: deriveStatus({
        loading: tools.cron.loading || tools.cron.mutating || tools.cron.running || tools.cron.waking,
        error: tools.cron.lastError,
        hasResult: tools.cron.status !== null || tools.cron.jobs.length > 0
      }),
      devices: deriveStatus({
        loading: tools.nodes.loading,
        error: tools.nodes.lastError,
        hasResult: tools.nodes.snapshot !== null
      }),
      alerts: deriveStatus({
        loading: tools.guard.loading || tools.guard.dispatching,
        error: tools.guard.lastError,
        hasResult: tools.guard.snapshot !== null
      }),
      context: deriveStatus({
        loading:
          tools.context.loading || tools.context.commandsLoading || tools.context.setupLoading || tools.context.readingFile,
        error: tools.context.lastError,
        hasResult: tools.context.project !== null || tools.context.logicPath !== null
      }),
      cleanup: deriveStatus({
        loading: tools.cleanup.previewing || tools.cleanup.applying,
        error: tools.cleanup.lastError,
        hasResult: tools.cleanup.preview !== null
      }),
      command: deriveStatus({
        loading: tools.command.running,
        error: tools.command.lastError,
        hasResult: tools.command.result !== null
      })
    }),
    [doctor, ops, git, tools]
  );
}

function ConnectionPanel() {
  const middleware = useDesktopShellStore((state) => state.middleware);
  const runtime = useDesktopShellStore((state) => state.runtime);
  const bridge = useDesktopShellStore((state) => state.bridge);
  const auth = useDesktopAuthStore((state) => state.auth);

  const probedAt = runtime.lastProbeAt ? formatUtc(runtime.lastProbeAt) : "확인 기록 없음";
  const live = bridge.status === "connected";

  const rows = [
    { label: "실시간 연결", status: bridge.status, detail: bridge.lastMessageAt ? `마지막 수신 ${formatUtc(bridge.lastMessageAt)}` : "수신 기록 없음" },
    { label: "인증", status: auth.status, detail: auth.expiresAtLocal ? `만료 ${auth.expiresAtLocal}` : auth.lastMessage || "세션 없음" },
    { label: "미들웨어", status: middleware.status, detail: `${middleware.endpoint} · 확인 ${probedAt}` },
    { label: "healthz", status: runtime.healthStatus, detail: `${runtime.healthDetail || runtime.healthUrl} · 확인 ${probedAt}` },
    { label: "readyz", status: runtime.readyStatus, detail: `${runtime.readyDetail || runtime.readyUrl} · 확인 ${probedAt}` }
  ];

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
      {!live ? (
        <p className="shrink-0 border-b border-border bg-warning/10 px-3 py-2 text-[11px] text-warning">
          실시간 연결이 끊겼습니다. 아래 미들웨어·healthz·readyz 는 지금 상태가 아니라 마지막으로 확인한 값입니다.
        </p>
      ) : null}
      {middleware.lastError || runtime.lastError ? (
        <p className="shrink-0 border-b border-border bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
          {middleware.lastError || runtime.lastError}
        </p>
      ) : null}
      <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
        {rows.map((row) => {
          const tone = statusTone(row.status);
          return (
            <li key={row.label} className="flex min-w-0 items-start gap-2 px-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block text-sm">{row.label}</span>
                <span className="block min-w-0 break-all text-[11px] text-muted-foreground">{row.detail || "-"}</span>
              </span>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
                  tone === "destructive" && "bg-destructive/15 text-destructive",
                  tone === "warning" && "bg-warning/15 text-warning",
                  tone === "success" && "bg-success/15 text-success",
                  (tone === "default" || tone === "primary") && "bg-muted text-muted-foreground"
                )}
              >
                {statusLabel(row.status)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
