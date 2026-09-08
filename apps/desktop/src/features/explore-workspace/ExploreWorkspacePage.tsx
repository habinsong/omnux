import { useEffect } from "react";
import { useDesktopShellStore } from "../../shell-store";
import { useDesktopAuthStore } from "../auth/auth-store";
import { subscribeDesktopMessages } from "../middleware/desktop-message-gateway";
import { WebExplorePanel } from "./WebExplorePanel";
import { BrowserExplorePanel, CanvasExplorePanel } from "./RuntimeExplorePanels";
import { SessionExplorePanel } from "./SessionExplorePanel";
import { receiveWebExplore, disconnectWebExplore } from "./web-explore-state";
import { receiveRuntimeExplore, disconnectRuntimeExplore } from "./runtime-explore-state";
import { receiveSessionExplore, disconnectSessionExplore } from "./session-explore-state";
import "./explore-workspace.css";

export function useExploreWorkspaceSession() {
  useEffect(() => {
    const messages = subscribeDesktopMessages(message => { receiveWebExplore(message); receiveRuntimeExplore(message); receiveSessionExplore(message); });
    const connection = useDesktopShellStore.subscribe((state, previous) => {
      if (state.bridge.status === "closed" || (state.bridge.status === "connecting" && previous.bridge.status === "connected")) {
        disconnectWebExplore(); disconnectRuntimeExplore(); disconnectSessionExplore();
      }
    });
    return () => { messages(); connection(); };
  }, []);
}

export function ExploreWorkspacePage() {
  const connected = useDesktopShellStore(state => state.bridge.status) === "connected";
  const authenticated = useDesktopAuthStore(state => state.auth.status) === "authenticated";
  const ready = connected && authenticated;
  return <div className="explore-workspace" data-surface="explore">
    <header className="explore-page-heading"><h1>탐색</h1><p>자료를 찾고, 웹 화면과 작업 기록을 확인하세요.</p></header>
    {!ready && <p role="status" className="explore-notice">서버에 연결하면 자료를 찾고 도구를 사용할 수 있습니다.</p>}
    <WebExplorePanel connected={ready} />
    <BrowserExplorePanel connected={ready} />
    <CanvasExplorePanel connected={ready} />
    <SessionExplorePanel connected={ready} />
  </div>;
}
