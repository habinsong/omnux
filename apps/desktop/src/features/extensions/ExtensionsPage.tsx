import { useEffect, useState } from "react";
import { Puzzle, RefreshCcw, ScrollText, ShieldQuestion, Webhook } from "lucide-react";
import { Screen, ScreenNotice } from "../../components/screen/Screen";
import { ScreenTabs, type ScreenTab } from "../../components/screen/ScreenTabs";
import { Button, Spinner } from "../../components/ui/primitives";
import { useExtensionStore } from "./extensions-store";
import { ApprovalsPanel, HooksPanel, PluginsPanel, RulesPanel } from "./ExtensionPanels";

/* ============================================================================
   확장 화면.
   훅·승인·규칙·플러그인을 캡슐 탭 네 개로 나눈다. 한 번에 한 가지만 본다.
   ============================================================================ */

type TabId = "hooks" | "approvals" | "rules" | "plugins";

export function ExtensionsPage() {
  const snapshot = useExtensionStore((state) => state.snapshot);
  const loading = useExtensionStore((state) => state.loading);
  const status = useExtensionStore((state) => state.status);
  const store = useExtensionStore;

  const [tab, setTab] = useState<TabId>("hooks");

  useEffect(() => {
    // 화면에 들어올 때마다 조회한다. 승인 대기는 다른 화면의 작업 중에도 생긴다.
    store.getState().load();
  }, [store]);

  const pendingCount = snapshot.pendingApprovals.length;

  useEffect(() => {
    // 승인 대기가 생기면 그 탭으로 옮긴다. 접힌 채 놓쳐서 작업이 계속 멈추는 것을 막는다.
    if (pendingCount > 0) setTab("approvals");
  }, [pendingCount]);

  const tabs: ScreenTab[] = [
    { id: "hooks", label: "훅", icon: Webhook, badge: snapshot.hooks.length > 0 ? String(snapshot.hooks.length) : undefined },
    {
      id: "approvals",
      label: "승인",
      icon: ShieldQuestion,
      badge: pendingCount > 0 ? String(pendingCount) : undefined,
      alert: pendingCount > 0
    },
    { id: "rules", label: "규칙", icon: ScrollText, badge: snapshot.rules.length > 0 ? String(snapshot.rules.length) : undefined },
    { id: "plugins", label: "플러그인", icon: Puzzle, badge: snapshot.plugins.length > 0 ? String(snapshot.plugins.length) : undefined }
  ];

  return (
    <Screen
      title="확장"
      hint="작업 앞뒤에 끼워 넣는 검사와, 항상 붙는 지침을 관리합니다."
      actions={
        <Button variant="outline" size="sm" onClick={() => store.getState().refresh()} disabled={loading}>
          {loading ? <Spinner size={14} /> : <RefreshCcw size={14} aria-hidden="true" />} 다시 읽기
        </Button>
      }
      notice={
        snapshot.configError ? (
          <ScreenNotice tone="danger">설정 파일을 읽지 못했습니다: {snapshot.configError}</ScreenNotice>
        ) : status ? (
          <ScreenNotice tone={status.kind === "ok" ? "info" : "danger"}>{status.message}</ScreenNotice>
        ) : null
      }
    >
      <ScreenTabs tabs={tabs} value={tab} onChange={(id) => setTab(id as TabId)} label="확장 보기 종류" />
      {tab === "hooks" ? <HooksPanel /> : tab === "approvals" ? <ApprovalsPanel /> : tab === "rules" ? <RulesPanel /> : <PluginsPanel />}
    </Screen>
  );
}
