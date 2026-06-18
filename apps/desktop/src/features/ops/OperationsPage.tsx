import { useEffect } from "react";
import { useDesktopShellStore } from "../../shell-store";
import { useDesktopAuthStore } from "../auth/auth-store";
import { useUiLogStore } from "../ui-log/ui-log-store";
import { OperationsGitPanel } from "./OperationsGitPanel";
import { OperationsOverviewSection } from "./OperationsOverviewSection";
import { OperationsToolsSection } from "./OperationsToolsSection";
import { useGitAutomationBridge, useOpsPageStore } from "./ops-store";

export function OperationsPage() {
  useGitAutomationBridge();
  const recordCardError = useUiLogStore((state) => state.recordCardError);
  const bridgeStatus = useDesktopShellStore((state) => state.bridge.status);
  const authStatus = useDesktopAuthStore((state) => state.auth.status);
  const git = useOpsPageStore((state) => state.git);
  const doctor = useOpsPageStore((state) => state.doctor);
  const ops = useOpsPageStore((state) => state.ops);
  const tools = useOpsPageStore((state) => state.tools);
  const store = useOpsPageStore();
  const canRequest = bridgeStatus === "connected" && authStatus === "authenticated";

  useEffect(() => {
    if (!canRequest) return;
    store.loadGitAutomation();
    store.loadDoctorLast();
    store.loadOpsSnapshot();
    store.loadCronStatus();
    store.loadCronJobs();
    store.loadNodesSnapshot();
    store.loadLogicPath();
    void store.loadGuardRetryTimeline();
  }, [
    canRequest,
    store.loadCronJobs,
    store.loadCronStatus,
    store.loadDoctorLast,
    store.loadGitAutomation,
    store.loadGuardRetryTimeline,
    store.loadLogicPath,
    store.loadNodesSnapshot,
    store.loadOpsSnapshot
  ]);

  return (
    <div className="dashboard-tab space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">상태</h1>
        <p className="text-sm text-muted-foreground">인증, 연결, 진단, Git 승인, 예약 작업 상태를 확인합니다.</p>
      </div>
      <OperationsOverviewSection doctor={doctor} ops={ops} store={store} canRequest={canRequest} onError={recordCardError} />
      <OperationsGitPanel git={git} store={store} canRequest={canRequest} onError={recordCardError} />
      <OperationsToolsSection tools={tools} store={store} canRequest={canRequest} onError={recordCardError} />
    </div>
  );
}
