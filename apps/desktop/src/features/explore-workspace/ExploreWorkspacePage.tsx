import { useEffect, useState } from "react";
import { Globe, History, MonitorSmartphone, Search } from "lucide-react";
import { Screen, ScreenNotice } from "../../components/screen/Screen";
import { ScreenTabs, type ScreenTab } from "../../components/screen/ScreenTabs";
import { useDesktopShellStore } from "../../shell-store";
import { useDesktopAuthStore } from "../auth/auth-store";
import { subscribeDesktopMessages } from "../middleware/desktop-message-gateway";
import { receiveWebExplore, disconnectWebExplore } from "./web-explore-state";
import { receiveRuntimeExplore, disconnectRuntimeExplore } from "./runtime-explore-state";
import { receiveSessionExplore, disconnectSessionExplore } from "./session-explore-state";
import { BrowserPanel, CanvasPanel, SessionPanel, WebPanel } from "./ExplorePanels";

/* ============================================================================
   탐색 화면.
   웹 찾기 / 브라우저 / 캔버스 / 기록 을 캡슐 탭으로 가른다.
   ============================================================================ */

export function useExploreWorkspaceSession() {
  useEffect(() => {
    const messages = subscribeDesktopMessages((message) => {
      receiveWebExplore(message);
      receiveRuntimeExplore(message);
      receiveSessionExplore(message);
    });
    const connection = useDesktopShellStore.subscribe((state, previous) => {
      if (state.bridge.status === "closed" || (state.bridge.status === "connecting" && previous.bridge.status === "connected")) {
        disconnectWebExplore();
        disconnectRuntimeExplore();
        disconnectSessionExplore();
      }
    });
    return () => {
      messages();
      connection();
    };
  }, []);
}

type TabId = "web" | "browser" | "canvas" | "session";

export function ExploreWorkspacePage() {
  const connected = useDesktopShellStore((state) => state.bridge.status) === "connected";
  const authenticated = useDesktopAuthStore((state) => state.auth.status) === "authenticated";
  const ready = connected && authenticated;
  const [tab, setTab] = useState<TabId>("web");

  const tabs: ScreenTab[] = [
    { id: "web", label: "웹 찾기", icon: Search },
    { id: "browser", label: "브라우저", icon: Globe },
    { id: "canvas", label: "캔버스", icon: MonitorSmartphone },
    { id: "session", label: "기록", icon: History }
  ];

  return (
    <Screen
      title="탐색"
      hint="자료를 찾고, 웹 화면과 지난 작업을 확인합니다."
      notice={!ready ? <ScreenNotice tone="warning">서버에 연결하면 자료를 찾고 도구를 쓸 수 있습니다.</ScreenNotice> : null}
    >
      <ScreenTabs tabs={tabs} value={tab} onChange={(id) => setTab(id as TabId)} label="탐색 보기 종류" />
      {tab === "web" ? (
        <WebPanel connected={ready} />
      ) : tab === "browser" ? (
        <BrowserPanel connected={ready} />
      ) : tab === "canvas" ? (
        <CanvasPanel connected={ready} />
      ) : (
        <SessionPanel connected={ready} />
      )}
    </Screen>
  );
}
